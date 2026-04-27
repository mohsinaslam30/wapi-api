import axios from 'axios';
import FormData from 'form-data';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FacebookConnection, FacebookPage, FacebookAdAccount, AutomationFlow, FacebookAdSet, FacebookAd } from '../models/index.js';
import FacebookAdCampaign from '../models/facebook-ad-campaign.model.js';

const FB_API_VERSION = 'v20.0';
const BASE = `https://graph.facebook.com/${FB_API_VERSION}`;


const getOwnerId = (user) => user.owner_id || user.id;


const requireConnection = async (userId) => {
  const connection = await FacebookConnection.findOne({
    user_id: userId,
    is_active: true
  }).lean();

  if (!connection) {
    const err = new Error('NO_FB_CONNECTION');
    err.statusCode = 404;
    err.userMessage =
      'No active Facebook connection found. Please connect your Facebook account first.';
    throw err;
  }
  return connection;
};

const saveAdMediaLocally = async (buffer, originalName, subDir = 'ads') => {
  const uploadDir = path.join(process.cwd(), 'uploads', subDir);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const ext = path.extname(originalName) || '.bin';
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const filePath = path.join(uploadDir, fileName);

  fs.writeFileSync(filePath, buffer);

  return `/uploads/${subDir}/${fileName}`;
};

const downloadRemoteMedia = async (url, subDir = 'ads') => {
  if (!url || url.startsWith('blob:')) {
    console.log(`[downloadRemoteMedia] Skipping invalid or blob URL: ${url}`);
    return null;
  }
  try {
    console.log(`[downloadRemoteMedia] Starting download: ${url}`);
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 30000
    });

    const uploadDir = path.resolve(process.cwd(), 'uploads', subDir);
    if (!fs.existsSync(uploadDir)) {
      console.log(`[downloadRemoteMedia] Creating directory: ${uploadDir}`);
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const urlPath = new URL(url).pathname.split('?')[0];
    const ext = path.extname(urlPath) || '.jpg';
    const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const filePath = path.join(uploadDir, fileName);

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`[downloadRemoteMedia] Successfully saved: ${filePath}`);
        resolve(`/uploads/${subDir}/${fileName}`);
      });
      writer.on('error', (err) => {
        console.error(`[downloadRemoteMedia] Write Stream Error: ${err.message}`);
        reject(err);
      });
    });
  } catch (error) {
    console.error(`[downloadRemoteMedia] Failed to download ${url}:`, error.message);
    return null;
  }
};


const requirePage = async (fb_page_id, userId) => {
  const page = await FacebookPage.findOne({
    _id: fb_page_id,
    user_id: userId,
    is_active: true
  }).lean();

  if (!page) {
    const err = new Error('FB_PAGE_NOT_FOUND');
    err.statusCode = 404;
    err.userMessage =
      'Facebook page not found. Make sure the page belongs to your connected account.';
    throw err;
  }
  return page;
};


const uploadAdImage = async (adAccountId, imageBuffer, mimeType, accessToken) => {
  const form = new FormData();
  form.append('filename', imageBuffer, {
    filename: `ad_image_${Date.now()}.jpg`,
    contentType: mimeType || 'image/jpeg'
  });
  form.append('access_token', accessToken);

  const res = await axios.post(
    `${BASE}/act_${adAccountId}/adimages`,
    form,
    { headers: form.getHeaders() }
  );

  const images = res.data?.images || {};
  const first = Object.values(images)[0];
  if (!first?.hash) {
    throw new Error('Image upload did not return a hash from Facebook.');
  }
  return first.hash;
};


const uploadAdVideo = async (adAccountId, videoBuffer, mimeType, accessToken) => {
  const form = new FormData();
  form.append('source', videoBuffer, {
    filename: `ad_video_${Date.now()}.mp4`,
    contentType: mimeType || 'video/mp4'
  });
  form.append('access_token', accessToken);

  const res = await axios.post(
    `${BASE}/act_${adAccountId}/advideos`,
    form,
    { headers: form.getHeaders() }
  );

  if (!res.data?.id) {
    throw new Error('Video upload did not return an ID from Facebook.');
  }
  return res.data.id;
};

const resolveTargetingKey = async (q, type, accessToken) => {
  try {
    const params = { type, q, access_token: accessToken };

    if (type === 'adcity') {
      params.type = 'adgeolocation';
      params.location_types = JSON.stringify(['city']);
    }

    const res = await axios.get(`${BASE}/search`, { params });
    return res.data?.data?.[0]?.key || res.data?.data?.[0]?.id || null;
  } catch (error) {
    const fbErr = error?.response?.data?.error;
    console.error(`[Ads Resolution] Failed for ${q} (${type}):`, fbErr || error.message);
    return null;
  }
};


const transformToMetaSpec = async (data, pageId, imageHash, videoId, accessToken) => {
  const creativeData = data.ad_creative || {};
  const {
    creative_type,
    targeting,
    carousel_cards
  } = data;

  const headline = creativeData.title || data.headline || '';
  const primaryText = creativeData.body || data.ad_message || '';
  const description = creativeData.description || data.description || '';
  const welcome_message = creativeData.welcome_message || data.welcome_message;
  const prefilled_message = creativeData.prefilled_message || data.prefilled_message;
  const welcome_experience = creativeData.welcome_experience || data.welcome_experience;

  const targetingSpec = {
    geo_locations: { countries: ['IN'] },
    age_min: 18,
    age_max: 65,
    device_platforms: ['mobile', 'desktop'],
    publisher_platforms: ['facebook', 'instagram', 'messenger'],
    targeting_automation: { advantage_audience: 0 }
  };

  if (targeting) {
    const locationsInput = targeting.locations || targeting.geo_locations;
    if (locationsInput) {
      const cities = [];
      const regions = [];
      const countries = locationsInput.countries || [];

      if (locationsInput.cities) {
        for (const c of locationsInput.cities) {
          let key = c.key;
          if (!key && c.name) {
            key = await resolveTargetingKey(c.name, 'adcity', accessToken);
          }
          if (key) {
            cities.push({
              key,
              radius: c.radius || 10,
              distance_unit: c.distance_unit || 'kilometer'
            });
          }
        }
      }

      if (locationsInput.regions) {
        for (const r of locationsInput.regions) {
          let key = r.key;
          if (!key && r.name) {
            key = await resolveTargetingKey(r.name, 'adregion', accessToken);
          }
          if (key) regions.push({ key });
        }
      }

      targetingSpec.geo_locations = { countries, cities, regions };
      if (locationsInput.location_types) {
        targetingSpec.geo_locations.location_types = locationsInput.location_types;
      }
      if (!countries.length && !cities.length && !regions.length) {
         targetingSpec.geo_locations.countries = ['IN'];
      }
    }

    if (targeting.age_range) {
      targetingSpec.age_min = targeting.age_range[0];
      targetingSpec.age_max = targeting.age_range[1];
    }
    if (targeting.genders) targetingSpec.genders = targeting.genders;

    if (targeting.interests && Array.isArray(targeting.interests)) {
      targetingSpec.flexible_spec = [{
        interests: targeting.interests.map(i => ({ name: i.name }))
      }];
    }
  }

  if (targeting?.publisher_platforms) targetingSpec.publisher_platforms = targeting.publisher_platforms;
  if (targeting?.device_platforms) targetingSpec.device_platforms = targeting.device_platforms;

  let optimizationGoal = data.optimization_goal;
  let billingEvent = data.billing_event || 'IMPRESSIONS';
  let destinationType = 'WHATSAPP';

  if (data.objective === 'OUTCOME_ENGAGEMENT' || data.objective === 'OUTCOME_TRAFFIC') {
    if (!optimizationGoal || optimizationGoal === 'REACH') {
      optimizationGoal = 'REPLIES';
    }
  } else if (data.objective === 'OUTCOME_AWARENESS' || data.objective === 'OUTREACH') {
    optimizationGoal = 'IMPRESSIONS';
    billingEvent = 'IMPRESSIONS';
    destinationType = null;
  }

  if (!optimizationGoal) optimizationGoal = 'REPLIES';

  const adsetParams = {
    name: `${data.name || 'AdSet'}`,
    optimization_goal: optimizationGoal,
    billing_event: billingEvent,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting: targetingSpec,
    status: 'PAUSED'
  };

  if (destinationType) {
    adsetParams.destination_type = destinationType;
  }

  const objectStorySpec = {
    page_id: pageId
  };

  const ctaObject = {
    type: 'WHATSAPP_MESSAGE',
    value: { app_destination: 'WHATSAPP' }
  };

  if (creative_type === 'CAROUSEL' && Array.isArray(carousel_cards)) {
    objectStorySpec.link_data = {
      message: primaryText,
      link: 'https://fb.me/whatsdesk',
      child_attachments: carousel_cards.map(card => {
        const attachment = {
          link: card.link || 'https://fb.me/whatsdesk',
          image_hash: card.image_hash,
          name: card.headline || headline || '',
          description: card.description || description || '',
          call_to_action: ctaObject
        };
        if (card.image_url && !card.image_url.startsWith('blob:')) {
          attachment.picture = card.image_url;
        }
        return attachment;
      }),
      multi_share_optimized: true,
      multi_share_end_card: true
    };
  } else if (creative_type === 'VIDEO') {
    objectStorySpec.video_data = {
      video_id: videoId,
      title: headline,
      message: primaryText,
      call_to_action: ctaObject
    };
    if (imageHash) objectStorySpec.video_data.image_hash = imageHash;
  } else {
    objectStorySpec.link_data = {
      message: primaryText,
      link: 'https://fb.me/whatsdesk',
      image_hash: imageHash,
      name: headline,
      description: description,
      call_to_action: ctaObject
    };
  }

  if (welcome_experience || prefilled_message || welcome_message) {
    let greeting = "Hi! I'm interested in this.";
    let iceBreakers = [];
    let customerActionType = 'ice_breakers';

    if (welcome_experience) {
      greeting = welcome_experience.text || greeting;
      if (welcome_experience.type === 'prefilled') {
        customerActionType = 'prefilled_message';
        iceBreakers = [{
          title: welcome_experience.prefilled_text || "I'm interested!",
          response: "AD_CLICK_TRIGGER"
        }];
      } else if (welcome_experience.type === 'faq' && Array.isArray(welcome_experience.questions)) {
        customerActionType = 'ice_breakers';
        iceBreakers = welcome_experience.questions.map(q => ({
          title: q.question,
          response: q.automated_response || "AD_CLICK_TRIGGER"
        }));
      }
    } else {
      greeting = prefilled_message || (welcome_message && welcome_message.greeting) || greeting;
      const legacyIceBreakers = (welcome_message && welcome_message.ice_breakers) || [
        {
          question: prefilled_message || "I'm interested!",
          payload: "AD_CLICK_TRIGGER"
        }
      ];
      iceBreakers = legacyIceBreakers.map(ib => ({
        title: ib.question || ib.title,
        response: ib.payload || ib.response || "AD_CLICK_TRIGGER"
      }));
    }

    if (greeting || iceBreakers.length > 0) {
      const visualEditorSpec = {
        type: "VISUAL_EDITOR",
        version: 2,
        landing_screen_type: "welcome_message",
        media_type: "text",
        text_format: {
          customer_action_type: customerActionType,
          message: {
            text: greeting,
            ice_breakers: iceBreakers.slice(0, 5)
          }
        }
      };

      const welcomeMessageStr = JSON.stringify(visualEditorSpec);

      objectStorySpec.page_welcome_message = welcomeMessageStr;

      if (objectStorySpec.link_data) {
        objectStorySpec.link_data.page_welcome_message = welcomeMessageStr;
      }
      if (objectStorySpec.video_data) {
        objectStorySpec.video_data.page_welcome_message = welcomeMessageStr;
      }
    }
  }

  return { adsetParams, objectStorySpec };
};

const tryArchiveFbObject = async (endpoint, accessToken) => {
  try {
    await axios.post(endpoint, null, {
      params: { status: 'ARCHIVED', access_token: accessToken }
    });
  } catch {
  }
};



const internalCreateMetaCampaign = async (adAccountId, params, accessToken) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.append(key, value);
  }
  body.append('access_token', accessToken);

  const res = await axios.post(`${BASE}/act_${adAccountId}/campaigns`, body);
  return res.data.id;
};

const internalCreateMetaAdSet = async (adAccountId, params, accessToken) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.append(key, value);
  }
  body.append('access_token', accessToken);

  const res = await axios.post(`${BASE}/act_${adAccountId}/adsets`, body);
  return res.data.id;
};

const internalCreateMetaAdCreative = async (adAccountId, name, objectStorySpec, accessToken) => {
  const body = new URLSearchParams();
  body.append('name', `${name} - Creative`);
  body.append('object_story_spec', JSON.stringify(objectStorySpec));
  body.append('access_token', accessToken);

  const res = await axios.post(`${BASE}/act_${adAccountId}/adcreatives`, body);
  return res.data.id;
};

const internalCreateMetaAd = async (adAccountId, name, adsetId, creativeId, accessToken) => {
  const body = new URLSearchParams();
  body.append('name', `${name} - Ad`);
  body.append('adset_id', adsetId);
  body.append('creative', JSON.stringify({ creative_id: creativeId }));
  body.append('status', 'PAUSED');
  body.append('access_token', accessToken);

  const res = await axios.post(`${BASE}/act_${adAccountId}/ads`, body);
  return res.data.id;
};

export const getAdAccounts = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const connection = await requireConnection(userId);

    const accounts = await FacebookAdAccount.find({
      user_id: userId,
      connection_id: connection._id,
      is_active: true
    }).lean();

    return res.json({
      success: true,
      data: accounts
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.userMessage });
    }
    console.error('[getAdAccounts] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch ad accounts from database',
      details: error.message
    });
  }
};


export const syncFacebookAdAccounts = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const connection = await requireConnection(userId);
    const { long_lived_access_token: token } = connection;

    let allAccounts = [];
    let url = `${BASE}/me/adaccounts?fields=id,name,account_id,currency,account_status,funding_source_details,is_prepay_account,balance&limit=100&access_token=${token}`;

    while (url) {
      const resp = await axios.get(url);
      allAccounts = [...allAccounts, ...(resp.data.data || [])];
      url = resp.data.paging?.next || null;
    }

    if (allAccounts.length === 0) {
       return res.json({ success: true, message: 'No ad accounts found on Meta', count: 0 });
    }

    const adAccountStatusMap = {
      1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending Review',
      9: 'In Grace Period', 100: 'Pending Closure', 101: 'Test Account', 201: 'Closed'
    };

    const operations = allAccounts.map(acc => {
      const hasPaymentMethod = !!(acc.funding_source_details?.id);
      const canCreateAds = acc.account_status === 1 && hasPaymentMethod;
      const statusLabel = adAccountStatusMap[acc.account_status] || 'Unknown';

      return {
        updateOne: {
          filter: { ad_account_id: acc.id, user_id: userId },
          update: {
            $set: {
              connection_id: connection._id,
              name: acc.name,
              currency: acc.currency,
              account_status: acc.account_status,
              status_label: statusLabel,
              has_payment_method: hasPaymentMethod,
              can_create_ads: canCreateAds,
              balance: acc.balance,
              is_active: true
            }
          },
          upsert: true
        }
      };
    });

    const activeIds = allAccounts.map(acc => acc.id);
    await FacebookAdAccount.updateMany(
      { user_id: userId, ad_account_id: { $nin: activeIds } },
      { $set: { is_active: false } }
    );

    await FacebookAdAccount.bulkWrite(operations);

    return res.json({
      success: true,
      message: 'Ad accounts synchronized successfully',
      count: allAccounts.length
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ success: false, error: error.userMessage });
    }
    console.error('[syncFacebookAdAccounts] Error:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to synchronize ad accounts',
      details: error?.response?.data?.error?.message || error.message
    });
  }
};


export const createFbAdCampaign = async (req, res) => {
  const userId = getOwnerId(req.user);
  let {
    fb_page_id, ad_account_id, name, objective,
    daily_budget, lifetime_budget, is_cbo = true, ad_sets
  } = req.body;

  try {
    if (typeof ad_sets === 'string') ad_sets = JSON.parse(ad_sets);
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Invalid JSON in ad_sets field.' });
  }

  let createdObjects = { campaign: null, ad_sets: [], ads: [] };

  try {
    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;

    if (!fb_page_id) fb_page_id = connection.default_page_id;

    if (!fb_page_id)    return res.status(400).json({ success: false, error: 'fb_page_id is required' });
    if (!ad_account_id) return res.status(400).json({ success: false, error: 'ad_account_id is required' });
    if (!name)          return res.status(400).json({ success: false, error: 'name is required' });

    let finalAdAccountId = ad_account_id;
    if (mongoose.Types.ObjectId.isValid(ad_account_id)) {
      const accDoc = await FacebookAdAccount.findOne({ _id: ad_account_id, user_id: userId }).lean();
      if (accDoc) finalAdAccountId = accDoc.ad_account_id;
    }
    const adAccountId = String(finalAdAccountId).replace(/^act_/, '');

    const page = await requirePage(fb_page_id, userId);
    const pageId = page.page_id;

    let metaObjective = objective || 'OUTCOME_ENGAGEMENT';
    if (metaObjective === 'OUTREACH') metaObjective = 'OUTCOME_AWARENESS';
    if (metaObjective === 'MESSAGING') metaObjective = 'OUTCOME_ENGAGEMENT';

    let uploadedImageHash = null;
    let uploadedVideoId = null;
    let localImagePath = null;
    let localVideoPath = null;
    const files = req.files || {};

    const imageFile = (files.image && files.image[0]) || req.file;
    if (imageFile) {
      uploadedImageHash = await uploadAdImage(adAccountId, imageFile.buffer, imageFile.mimetype, token);
      localImagePath = await saveAdMediaLocally(imageFile.buffer, imageFile.originalname);
    }

    if (files.video && files.video[0]) {
      uploadedVideoId = await uploadAdVideo(adAccountId, files.video[0].buffer, files.video[0].mimetype, token);
      localVideoPath = await saveAdMediaLocally(files.video[0].buffer, files.video[0].originalname);
    }

    const campaignMetaParams = {
      name,
      objective: metaObjective,
      status: 'PAUSED',
      special_ad_categories: JSON.stringify([]),
      access_token: token
    };

    if (is_cbo) {
      if (daily_budget) campaignMetaParams.daily_budget = String(Math.round(Number(daily_budget) * 100));
      if (lifetime_budget) campaignMetaParams.lifetime_budget = String(Math.round(Number(lifetime_budget) * 100));
      campaignMetaParams.bid_strategy = 'LOWEST_COST_WITHOUT_CAP';
    }

    const fbCampaignId = await internalCreateMetaCampaign(adAccountId, campaignMetaParams, token);
    const localCampaign = await FacebookAdCampaign.create({
      user_id: userId,
      ad_account_id: `act_${adAccountId}`,
      fb_campaign_id: fbCampaignId,
      fb_page_id: page._id,
      name,
      objective,
      is_cbo: !!is_cbo,
      daily_budget: daily_budget ? Number(daily_budget) : 0,
      lifetime_budget: lifetime_budget ? Number(lifetime_budget) : null,
      status: 'paused',
      last_synced_at: new Date()
    });
    createdObjects.campaign = localCampaign;

    if (Array.isArray(ad_sets) && ad_sets.length > 0) {
      for (const aset of ad_sets) {
        const { adsetParams } = await transformToMetaSpec({ ...aset, objective: metaObjective }, pageId, null, null, token);
        const metaAsetParams = {
          ...adsetParams,
          campaign_id: fbCampaignId,
          promoted_object: JSON.stringify({ page_id: pageId }),
          targeting: JSON.stringify(adsetParams.targeting),
          access_token: token
        };

        if (adsetParams.destination_type) {
          metaAsetParams.destination_type = adsetParams.destination_type;
        }

        if (!is_cbo) {
          if (aset.daily_budget) metaAsetParams.daily_budget = String(Math.round(Number(aset.daily_budget) * 100));
          if (aset.lifetime_budget) metaAsetParams.lifetime_budget = String(Math.round(Number(aset.lifetime_budget) * 100));
        }

        const fbAdsetId = await internalCreateMetaAdSet(adAccountId, metaAsetParams, token);
        const localAdSet = await FacebookAdSet.create({
          user_id: userId,
          campaign_id: localCampaign._id,
          fb_adset_id: fbAdsetId,
          name: aset.name,
          targeting: adsetParams.targeting,
          daily_budget: aset.daily_budget ? Number(aset.daily_budget) : 0,
          status: 'paused',
          last_synced_at: new Date()
        });
        createdObjects.ad_sets.push(localAdSet);

        if (Array.isArray(aset.ads)) {
          for (const adData of aset.ads) {
            let adImageHash = uploadedImageHash;
            let adVideoId = uploadedVideoId;
            let localMedia = {
              image: localImagePath,
              video: localVideoPath
            };

            const creativeType = adData.creative_type || 'IMAGE';
            const creativeData = adData.ad_creative || {};

            if (creativeType === 'VIDEO') {
              if (creativeData.video_url) {
                const downloadPath = await downloadRemoteMedia(creativeData.video_url, 'ads');
                if (downloadPath) {
                  const fullLocalPath = path.resolve(process.cwd(), downloadPath.replace(/^\//, ''));
                  const videoBuffer = fs.readFileSync(fullLocalPath);
                  adVideoId = await uploadAdVideo(adAccountId, videoBuffer, 'video/mp4', token);
                  localMedia.video = downloadPath;
                }
              }
              if (creativeData.image_url) {
                const downloadPath = await downloadRemoteMedia(creativeData.image_url, 'ads');
                if (downloadPath) {
                   const fullLocalPath = path.resolve(process.cwd(), downloadPath.replace(/^\//, ''));
                   const imageBuffer = fs.readFileSync(fullLocalPath);
                   adImageHash = await uploadAdImage(adAccountId, imageBuffer, 'image/jpeg', token);
                   localMedia.image = downloadPath;
                }
              }
            }

            let resolvedCarouselCards = [];
            if (creativeType === 'CAROUSEL' && Array.isArray(creativeData.carousel_cards)) {
              for (const card of creativeData.carousel_cards) {
                let cardHash = card.image_hash;
                if (!cardHash && card.image_url) {
                   const downloadPath = await downloadRemoteMedia(card.image_url, 'ads');
                   if (downloadPath) {
                      const fullLocalPath = path.resolve(process.cwd(), downloadPath.replace(/^\//, ''));
                      const imageBuffer = fs.readFileSync(fullLocalPath);
                      cardHash = await uploadAdImage(adAccountId, imageBuffer, 'image/jpeg', token);
                   }
                }
                resolvedCarouselCards.push({ ...card, image_hash: cardHash });
              }
            }

            if (!adImageHash && creativeData.image_url) {
                const downloadPath = await downloadRemoteMedia(creativeData.image_url, 'ads');
                if (downloadPath) {
                    const fullLocalPath = path.resolve(process.cwd(), downloadPath.replace(/^\//, ''));
                    const imageBuffer = fs.readFileSync(fullLocalPath);
                    adImageHash = await uploadAdImage(adAccountId, imageBuffer, 'image/jpeg', token);
                    localMedia.image = downloadPath;
                }
            }

            const { objectStorySpec } = await transformToMetaSpec(
              { ...adData, carousel_cards: resolvedCarouselCards, objective: metaObjective },
              pageId, adImageHash, adVideoId, token
            );
            const fbCreativeId = await internalCreateMetaAdCreative(adAccountId, adData.name, objectStorySpec, token);
            const fbAdId = await internalCreateMetaAd(adAccountId, adData.name, fbAdsetId, fbCreativeId, token);

            let automationTrigger = { type_name: 'none', id: null };
            if (adData.automation_flow_id) {
              automationTrigger = { type_name: 'workflow', id: adData.automation_flow_id };
            } else if (adData.reply_material_id) {
              automationTrigger = { type_name: 'reply_material', id: adData.reply_material_id };
            }

            const welcomeExperience = adData.welcome_experience || creativeData.welcome_experience || { text: '', type: 'none', questions: [] };

            const adRecord = await FacebookAd.create({
              user_id: userId,
              ad_set_id: localAdSet._id,
              fb_ad_id: fbAdId,
              fb_creative_id: fbCreativeId,
              name: adData.name,
              status: 'paused',
              creative_type: creativeType,
              local_media: localMedia,
              headline: creativeData.title || '',
              ad_message: creativeData.body || '',
              automation_trigger: automationTrigger,
              welcome_experience: welcomeExperience,
              last_synced_at: new Date()
            });
            createdObjects.ads.push(adRecord);
          }
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Full Ad Hierarchy created successfully (PAUSED)',
      data: createdObjects
    });

  } catch (error) {
    console.error('[createFbAdCampaign] Deep Error:', error?.response?.data || error.message);
    const fbError = error?.response?.data?.error;

    try {
      const token = (await requireConnection(userId)).long_lived_access_token;

      for (const ad of createdObjects.ads) {
        if (ad.fb_ad_id) {
          await tryArchiveFbObject(`${BASE}/${ad.fb_ad_id}`, token);
        }
        await FacebookAd.deleteOne({ _id: ad._id });
      }

      for (const adset of createdObjects.ad_sets) {
        if (adset.fb_adset_id) {
          await tryArchiveFbObject(`${BASE}/${adset.fb_adset_id}`, token);
        }
        await FacebookAdSet.deleteOne({ _id: adset._id });
      }

      if (createdObjects.campaign && createdObjects.campaign.fb_campaign_id) {
        await tryArchiveFbObject(`${BASE}/${createdObjects.campaign.fb_campaign_id}`, token);
        await FacebookAdCampaign.deleteOne({ _id: createdObjects.campaign._id });
      }
    } catch (rollbackErr) {
      console.error('[createFbAdCampaign] Rollback failed:', rollbackErr.message);
    }

    return res.status(500).json({
      success: false,
      error: 'Facebook ad creation failed',
      details: fbError?.message || error.message
    });
  }
};

export const syncRemoteCampaigns = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const { ad_account_id } = req.body;

    if (!ad_account_id) {
      return res.status(400).json({ success: false, error: 'ad_account_id is required' });
    }

    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;

    let targetActId = ad_account_id;

    if (mongoose.Types.ObjectId.isValid(ad_account_id)) {
      const accountRecord = await FacebookAdAccount.findOne({ _id: ad_account_id, user_id: userId });
      if (accountRecord && accountRecord.ad_account_id) {
        targetActId = accountRecord.ad_account_id;
      }
    }

    const normalizedActId = targetActId.startsWith('act_') ? targetActId : `act_${targetActId}`;

    const campaignsRes = await axios.get(`${BASE}/${normalizedActId}/campaigns`, {
      params: {
        fields: 'id,name,status,objective,start_time,stop_time,daily_budget,lifetime_budget',
        limit: 50,
        access_token: token
      }
    });

    const campaigns = campaignsRes.data.data || [];
    const results = { synced: 0, skipped: 0, errors: 0 };

    for (const camp of campaigns) {
      const campDailyBudget = camp.daily_budget ? (parseFloat(camp.daily_budget) / 100) : 0;
      const campLifetimeBudget = camp.lifetime_budget ? (parseFloat(camp.lifetime_budget) / 100) : null;

      let localCampaign = await FacebookAdCampaign.findOne({ fb_campaign_id: camp.id });
      const campData = {
        user_id: userId,
        ad_account_id: normalizedActId,
        fb_campaign_id: camp.id,
        name: camp.name,
        objective: camp.objective,
        daily_budget: campDailyBudget,
        lifetime_budget: campLifetimeBudget,
        status: (camp.status || 'paused').toLowerCase(),
        last_synced_at: new Date()
      };

      if (!localCampaign) {
        localCampaign = await FacebookAdCampaign.create(campData);
      } else {
        Object.assign(localCampaign, campData);
        await localCampaign.save();
      }

      try {
        const adsetRes = await axios.get(`${BASE}/${camp.id}/adsets`, {
          params: { fields: 'id,name,status,daily_budget,lifetime_budget,targeting,promoted_object,start_time,end_time', access_token: token }
        });
        const adsets = adsetRes.data.data || [];

        for (const adset of adsets) {
          let localAdSet = await FacebookAdSet.findOne({ fb_adset_id: adset.id });
          const adSetData = {
            user_id: userId,
            campaign_id: localCampaign._id,
            fb_adset_id: adset.id,
            name: adset.name,
            status: (adset.status || 'paused').toLowerCase(),
            daily_budget: adset.daily_budget ? (parseFloat(adset.daily_budget) / 100) : 0,
            lifetime_budget: adset.lifetime_budget ? (parseFloat(adset.lifetime_budget) / 100) : null,
            targeting: adset.targeting || {},
            start_time: adset.start_time,
            end_time: adset.end_time,
            last_synced_at: new Date()
          };

          if (!localAdSet) {
            localAdSet = await FacebookAdSet.create(adSetData);
          } else {
            Object.assign(localAdSet, adSetData);
            await localAdSet.save();
          }

          const adRes = await axios.get(`${BASE}/${adset.id}/ads`, {
            params: { fields: 'id,name,status,creative{id}', access_token: token }
          });
          const ads = adRes.data.data || [];

          for (const ad of ads) {
            let localAd = await FacebookAd.findOne({ fb_ad_id: ad.id });

            const creativeRes = await axios.get(`${BASE}/${ad.creative.id}`, {
              params: { fields: 'object_story_spec,object_type,image_url', access_token: token }
            });
            const creative = creativeRes.data;
            const spec = creative.object_story_spec || {};

            let adMessage = spec.message || '';
            let mediaUrl = creative.image_url;
            let cType = creative.object_type === 'VIDEO' ? 'VIDEO' : 'IMAGE';

            if (spec.link_data) {
              adMessage = spec.link_data.message || adMessage;
              mediaUrl = spec.link_data.image_url || mediaUrl;
            } else if (spec.video_data) {
              adMessage = spec.video_data.message || adMessage;
              cType = 'VIDEO';
              if (spec.video_data.video_id) {
                const vRes = await axios.get(`${BASE}/${spec.video_data.video_id}`, {
                  params: { fields: 'source', access_token: token }
                });
                mediaUrl = vRes.data.source || mediaUrl;
              }
            }

            const localMedia = { carousel: [] };
            if (mediaUrl) {
              const localPath = await downloadRemoteMedia(mediaUrl);
              if (cType === 'VIDEO') localMedia.video = localPath;
              else localMedia.image = localPath;
            }

            const adData = {
              user_id: userId,
              ad_set_id: localAdSet._id,
              fb_ad_id: ad.id,
              fb_creative_id: ad.creative.id,
              name: ad.name,
              status: (ad.status || 'paused').toLowerCase(),
              creative_type: cType,
              ad_message: adMessage,
              local_media: localMedia,
              last_synced_at: new Date()
            };

            if (!localAd) {
              await FacebookAd.create(adData);
              results.synced++;
            } else {
              Object.assign(localAd, adData);
              await localAd.save();
              results.synced++;
            }
          }
        }
      } catch (err) {
        console.error(`[syncRemoteCampaigns] Error in campaign ${camp.id}:`, err.message);
        results.errors++;
      }
    }

    return res.json({
      success: true,
      message: `Sync completed: ${results.synced} imported, ${results.skipped} skipped, ${results.errors} errors.`,
      data: results
    });
  } catch (error) {
    console.error('[syncRemoteCampaigns] Error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to sync remote campaigns', details: error.message });
  }
};


export const getFbAdCampaigns = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip    = (page - 1) * limit;
    const search  = req.query.search || '';
    const sortBy  = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const filter = { user_id: userId, deleted_at: null };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.ad_account_id) filter.ad_account_id = req.query.ad_account_id;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { fb_campaign_id: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, campaigns] = await Promise.all([
      FacebookAdCampaign.countDocuments(filter),
      FacebookAdCampaign
        .find(filter)
        .populate('fb_page_id', 'page_name page_id picture_url')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    return res.json({
      success: true,
      data: {
        campaigns,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('[getFbAdCampaigns] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch campaigns', details: error.message });
  }
};

export const getFbAdHierarchy = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const campaigns = await FacebookAdCampaign.find({ user_id: userId, deleted_at: null }).lean();

    const hierarchy = await Promise.all(campaigns.map(async (camp) => {
      const adsets = await FacebookAdSet.find({ campaign_id: camp._id, deleted_at: null }).lean();

      const adsetsWithAds = await Promise.all(adsets.map(async (as) => {
        const ads = await FacebookAd.find({ ad_set_id: as._id, deleted_at: null }).lean();
        return { ...as, ads };
      }));

      return { ...camp, adsets: adsetsWithAds };
    }));

    return res.json({
      success: true,
      data: hierarchy
    });
  } catch (error) {
    console.error('[getFbAdHierarchy] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch hierarchy', details: error.message });
  }
};


export const getAdSetsByCampaign = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const campaignId = req.params.id;
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip    = (page - 1) * limit;
    const search  = req.query.search || '';
    const sortBy  = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const filter = { campaign_id: campaignId, user_id: userId, deleted_at: null };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { fb_adset_id: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, adsets] = await Promise.all([
      FacebookAdSet.countDocuments(filter),
      FacebookAdSet
        .find(filter)
        .populate({
          path: 'campaign_id',
          select: 'ad_account_id'
        })
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const formattedAdsets = adsets.map(aset => ({
      ...aset,
      ad_account_id: aset.campaign_id?.ad_account_id,
      campaign_id: aset.campaign_id?._id || aset.campaign_id
    }));

    return res.json({
      success: true,
      data: {
        adsets: formattedAdsets,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('[getAdSetsByCampaign] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch ad sets' });
  }
};

export const getAdSetById = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const adset = await FacebookAdSet.findOne({ _id: req.params.id, user_id: userId, deleted_at: null })
      .populate('campaign_id')
      .lean();
    if (!adset) return res.status(404).json({ success: false, error: 'Ad Set not found' });

    const result = {
      ...adset,
      ad_account_id: adset.campaign_id?.ad_account_id,
      campaign_id: adset.campaign_id?._id || adset.campaign_id
    };

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch ad set' });
  }
};

export const getAdsByAdSet = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const adsetId = req.params.id;
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const skip    = (page - 1) * limit;
    const search  = req.query.search || '';
    const sortBy  = req.query.sortBy || 'created_at';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const filter = { ad_set_id: adsetId, user_id: userId, deleted_at: null };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { fb_ad_id: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, ads] = await Promise.all([
      FacebookAd.countDocuments(filter),
      FacebookAd
        .find(filter)
        .populate({
          path: 'ad_set_id',
          populate: {
            path: 'campaign_id',
            select: 'ad_account_id'
          }
        })
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const formattedAds = ads.map(ad => ({
      ...ad,
      ad_account_id: ad.ad_set_id?.campaign_id?.ad_account_id,
      campaign_id: ad.ad_set_id?.campaign_id?._id || ad.ad_set_id?.campaign_id,
      ad_set_id: ad.ad_set_id?._id || ad.ad_set_id
    }));

    return res.json({
      success: true,
      data: {
        ads: formattedAds,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('[getAdsByAdSet] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch ads' });
  }
};

export const getAdById = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const ad = await FacebookAd.findOne({ _id: req.params.id, user_id: userId, deleted_at: null })
      .populate({
        path: 'ad_set_id',
        populate: { path: 'campaign_id' }
      })
      .lean();
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });

    const result = {
      ...ad,
      ad_account_id: ad.ad_set_id?.campaign_id?.ad_account_id,
      campaign_id: ad.ad_set_id?.campaign_id?._id || ad.ad_set_id?.campaign_id,
      ad_set_id: ad.ad_set_id?._id || ad.ad_set_id
    };

    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch ad' });
  }
};


export const createFbAdSet = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const {
      campaign_id, name, daily_budget, lifetime_budget,
      start_time, end_time, targeting, fb_page_id
    } = req.body;

    if (!campaign_id) return res.status(400).json({ success: false, error: 'campaign_id (local) is required' });
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const campaign = await FacebookAdCampaign.findOne({ _id: campaign_id, user_id: userId, deleted_at: null });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;
    const adAccountId = campaign.ad_account_id.replace(/^act_/, '');

    const page = await requirePage(fb_page_id || campaign.fb_page_id || connection.default_page_id, userId);

    const { adsetParams } = await transformToMetaSpec({
      name,
      targeting,
      objective: campaign.objective,
      optimization_goal: req.body.optimization_goal,
      billing_event: req.body.billing_event
    }, page.page_id, null, null, token);

    const metaParams = {
      ...adsetParams,
      campaign_id: campaign.fb_campaign_id,
      promoted_object: JSON.stringify({ page_id: page.page_id }),
      targeting: JSON.stringify(adsetParams.targeting),
    };
    if (!campaign.is_cbo) {
      if (daily_budget) metaParams.daily_budget = String(Math.round(Number(daily_budget) * 100));
      if (lifetime_budget) metaParams.lifetime_budget = String(Math.round(Number(lifetime_budget) * 100));
    } else {
      console.log(`[createFbAdSet] Campaign ${campaign.fb_campaign_id} has CBO enabled. Skipping adset-level budget.`);
    }

    if (start_time) metaParams.start_time = new Date(start_time).toISOString();
    if (end_time) metaParams.end_time = new Date(end_time).toISOString();

    const fbAdsetId = await internalCreateMetaAdSet(adAccountId, metaParams, token);

    const localAdSet = await FacebookAdSet.create({
      user_id: userId,
      campaign_id: campaign._id,
      fb_adset_id: fbAdsetId,
      name,
      status: 'paused',
      daily_budget: daily_budget ? Number(daily_budget) : 0,
      lifetime_budget: lifetime_budget ? Number(lifetime_budget) : null,
      targeting: adsetParams.targeting,
      start_time: start_time ? new Date(start_time) : null,
      end_time: end_time ? new Date(end_time) : null,
      last_synced_at: new Date()
    });

    return res.status(201).json({ success: true, message: 'Ad Set created successfully', data: localAdSet });
  } catch (error) {
    console.error('[createFbAdSet] Error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to create Ad Set', details: error?.response?.data?.error?.message || error.message });
  }
};


export const updateFbAdSet = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const { name, daily_budget, lifetime_budget, targeting } = req.body;
    const adset = await FacebookAdSet.findOne({ _id: req.params.id, user_id: userId, deleted_at: null });

    if (!adset) return res.status(404).json({ success: false, error: 'Ad Set not found' });

    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;

    const metaUpdate = {};
    if (name) metaUpdate.name = name;
    if (daily_budget) metaUpdate.daily_budget = String(Math.round(Number(daily_budget) * 100));
    if (lifetime_budget) metaUpdate.lifetime_budget = String(Math.round(Number(lifetime_budget) * 100));
    if (targeting) metaUpdate.targeting = JSON.stringify(targeting);

    if (Object.keys(metaUpdate).length > 0) {
      await axios.post(`${BASE}/${adset.fb_adset_id}`, null, { params: { ...metaUpdate, access_token: token } });
    }

    if (name) adset.name = name;
    if (daily_budget) adset.daily_budget = Number(daily_budget);
    if (lifetime_budget) adset.lifetime_budget = Number(lifetime_budget);
    if (targeting) adset.targeting = targeting;

    await adset.save();
    return res.json({ success: true, message: 'Ad Set updated successfully', data: adset });
  } catch (error) {
    console.error('[updateFbAdSet] Error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to update Ad Set' });
  }
};


export const deleteFbAdSet = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const adset = await FacebookAdSet.findOne({ _id: req.params.id, user_id: userId, deleted_at: null });

    if (!adset) return res.status(404).json({ success: false, error: 'Ad Set not found' });

    const connection = await requireConnection(userId);
    if (connection && adset.fb_adset_id) {
       await axios.delete(`${BASE}/${adset.fb_adset_id}`, { params: { access_token: connection.long_lived_access_token } });
    }

    const now = new Date();
    adset.deleted_at = now;
    adset.status = 'deleted';
    await adset.save();

    await FacebookAd.updateMany({ ad_set_id: adset._id }, { $set: { deleted_at: now, status: 'deleted' } });

    return res.json({ success: true, message: 'Ad Set and its ads deleted successfully' });
  } catch (error) {
    console.error('[deleteFbAdSet] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete Ad Set' });
  }
};


export const createFbAd = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);

    let {
      ad_set_id, name, creative_type, headline,
      ad_message, description, prefilled_message,
      carousel_cards, welcome_message, ad_creative,
      automation_flow_id, reply_material_id, welcome_experience
    } = req.body;

    try {
      if (typeof ad_creative === 'string') ad_creative = JSON.parse(ad_creative);
      if (typeof carousel_cards === 'string') carousel_cards = JSON.parse(carousel_cards);
      if (typeof welcome_message === 'string') welcome_message = JSON.parse(welcome_message);
      if (typeof welcome_experience === 'string') welcome_experience = JSON.parse(welcome_experience);
    } catch (e) {
      console.warn('[createFbAd] Failed to parse JSON strings from form-data');
    }

    const baseCreative = ad_creative || {};
    if (!carousel_cards && baseCreative.carousel_cards) {
      carousel_cards = baseCreative.carousel_cards;
    }
    const finalCreativeType = creative_type || baseCreative.creative_type || 'IMAGE';

    if (!ad_set_id) return res.status(400).json({ success: false, error: 'ad_set_id (local) is required' });
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const adset = await FacebookAdSet.findOne({ _id: ad_set_id, user_id: userId, deleted_at: null });
    if (!adset) return res.status(404).json({ success: false, error: 'Ad Set not found' });

    const campaign = await FacebookAdCampaign.findById(adset.campaign_id);
    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;
    const adAccountId = campaign.ad_account_id.replace(/^act_/, '');

    const page = await requirePage(campaign.fb_page_id, userId);

    const files = req.files || {};
    let imageHash = null;
    let videoId = null;
    const localMedia = { carousel: [] };

    if (creative_type === 'VIDEO' && files.video) {
      videoId = await uploadAdVideo(adAccountId, files.video[0].buffer, files.video[0].mimetype, token);
      localMedia.video = await saveAdMediaLocally(files.video[0].buffer, files.video[0].originalname);
    }
    if (files.image) {
      imageHash = await uploadAdImage(adAccountId, files.image[0].buffer, files.image[0].mimetype, token);
      localMedia.image = await saveAdMediaLocally(files.image[0].buffer, files.image[0].originalname);
    }

    if (carousel_cards && Array.isArray(carousel_cards)) {
      const pluralFiles = files.carousel_images || [];
      let pluralIdx = 0;
      
      for (let i = 0; i < carousel_cards.length; i++) {
        const fileKey = `carousel_image_${i}`;
        let cardFile = files[fileKey] ? files[fileKey][0] : null;

        // If not found in individual keys, check the plural array if card needs a file
        if (!cardFile && (carousel_cards[i]._has_local_file || !carousel_cards[i].image_hash) && pluralFiles[pluralIdx]) {
          cardFile = pluralFiles[pluralIdx];
          pluralIdx++;
        }

        if (cardFile) {
          const hash = await uploadAdImage(adAccountId, cardFile.buffer, cardFile.mimetype, token);
          const localPath = await saveAdMediaLocally(cardFile.buffer, cardFile.originalname);

          carousel_cards[i].image_hash = hash;
          localMedia.carousel.push({ index: i, path: localPath, hash });
        }
      }
    }

    const { objectStorySpec } = await transformToMetaSpec(
      {
        name,
        creative_type: finalCreativeType,
        headline,
        ad_message,
        description,
        prefilled_message,
        carousel_cards,
        welcome_message,
        welcome_experience,
        ad_creative
      },
      page.page_id, imageHash, videoId, token
    );

    const creativeId = await internalCreateMetaAdCreative(adAccountId, name, objectStorySpec, token);
    const fbAdId = await internalCreateMetaAd(adAccountId, name, adset.fb_adset_id, creativeId, token);

    let finalAutomationTrigger = { type_name: 'none', id: null };
    if (automation_flow_id) {
      finalAutomationTrigger = { type_name: 'workflow', id: automation_flow_id };
    } else if (reply_material_id) {
      finalAutomationTrigger = { type_name: 'reply_material', id: reply_material_id };
    }

    const localAd = await FacebookAd.create({
      user_id: userId,
      ad_set_id: adset._id,
      fb_ad_id: fbAdId,
      fb_creative_id: creativeId,
      name,
      status: 'paused',
      creative_type: finalCreativeType,
      local_media: localMedia,
      headline: headline || baseCreative.title || '',
      ad_message: ad_message || baseCreative.body || '',
      automation_trigger: finalAutomationTrigger,
      welcome_experience: welcome_experience || baseCreative.welcome_experience || { text: '', type: 'none', questions: [] },
      last_synced_at: new Date()
    });

    return res.status(201).json({ success: true, message: 'Ad created successfully', data: localAd });
  } catch (error) {
    console.error('[createFbAd] Error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to create Ad' });
  }
};


export const updateFbAd = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const { name, status } = req.body;
    const ad = await FacebookAd.findOne({ _id: req.params.id, user_id: userId, deleted_at: null });

    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });

    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;

    const metaUpdate = {};
    if (name) metaUpdate.name = name;
    if (status) metaUpdate.status = status.toUpperCase();

    if (Object.keys(metaUpdate).length > 0) {
      await axios.post(`${BASE}/${ad.fb_ad_id}`, null, { params: { ...metaUpdate, access_token: token } });
    }

    if (name) ad.name = name;
    if (status) ad.status = status.toLowerCase();

    await ad.save();
    return res.json({ success: true, message: 'Ad updated successfully', data: ad });
  } catch (error) {
    console.error('[updateFbAd] Error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to update Ad' });
  }
};


export const deleteFbAd = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const ad = await FacebookAd.findOne({ _id: req.params.id, user_id: userId, deleted_at: null });

    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });

    const connection = await requireConnection(userId);
    if (connection && ad.fb_ad_id) {
       await axios.delete(`${BASE}/${ad.fb_ad_id}`, { params: { access_token: connection.long_lived_access_token } });
    }

    ad.deleted_at = new Date();
    ad.status = 'deleted';
    await ad.save();

    return res.json({ success: true, message: 'Ad deleted successfully' });
  } catch (error) {
    console.error('[deleteFbAd] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete Ad' });
  }
};

export const getFbAdInsights = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const { id, level } = req.params;
    const { days } = req.query;
    const period = parseInt(days) || 7;
    const datePreset = period === 30 ? 'last_30d' : period === 90 ? 'last_90d' : 'last_7d';

    let targetFbId = null;
    let localDoc = null;
    if (level === 'campaign') {
      localDoc = await FacebookAdCampaign.findOne({ _id: id, user_id: userId });
      targetFbId = localDoc?.fb_campaign_id;
    } else if (level === 'adset') {
      localDoc = await FacebookAdSet.findOne({ _id: id, user_id: userId });
      targetFbId = localDoc?.fb_adset_id;
    } else if (level === 'ad') {
      localDoc = await FacebookAd.findOne({ _id: id, user_id: userId });
      targetFbId = localDoc?.fb_ad_id;
    }

    if (!targetFbId) return res.status(404).json({ success: false, error: `${level} not found or not synced` });

    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;

    const [mainRes, summaryRes, demoRes, platformRes, adBreakdownRes] = await Promise.all([
      axios.get(`${BASE}/${targetFbId}/insights`, {
        params: { fields: 'date_start,date_stop,spend,impressions,reach,inline_link_clicks,actions', date_preset: datePreset, time_increment: 1, access_token: token }
      }),
      axios.get(`${BASE}/${targetFbId}/insights`, {
        params: { fields: 'spend,impressions,reach,inline_link_clicks,actions', date_preset: datePreset, access_token: token }
      }),
      axios.get(`${BASE}/${targetFbId}/insights`, {
        params: { fields: 'spend,impressions,reach,actions', date_preset: datePreset, breakdowns: 'age,gender', access_token: token }
      }),
      axios.get(`${BASE}/${targetFbId}/insights`, {
        params: { fields: 'spend,impressions,reach,actions', date_preset: datePreset, breakdowns: 'publisher_platform', access_token: token }
      }),
      (level !== 'ad')
        ? axios.get(`${BASE}/${targetFbId}/insights`, { params: { fields: 'ad_id,spend,impressions,reach,inline_link_clicks,actions', date_preset: datePreset, level: 'ad', access_token: token } })
        : Promise.resolve({ data: { data: [] } })
    ]);

    const dailyData = (mainRes.data.data || []).map(day => {
      const conversions = (day.actions || []).reduce((acc, action) => acc + parseInt(action.value || 0), 0);
      return { date: day.date_start, spend: parseFloat(day.spend || 0), impressions: parseInt(day.impressions || 0), reach: parseInt(day.reach || 0), clicks: parseInt(day.inline_link_clicks || 0), conversions };
    });

    const rawSummary = summaryRes.data.data?.[0] || {};
    const msgActionsSummary = (rawSummary.actions || []).find(a => a.action_type === 'onsite_conversion.messaging_first_reply');
    const startActionsSummary = (rawSummary.actions || []).find(a => a.action_type === 'messaging_conversation_started_7d');
    const totalConversions = msgActionsSummary ? parseInt(msgActionsSummary.value || 0) : (startActionsSummary ? parseInt(startActionsSummary.value || 0) : 0);
    const totalSpend = Math.round(parseFloat(rawSummary.spend || 0) * 100) / 100;

    const summary = {
      total_spend: totalSpend,
      total_impressions: parseInt(rawSummary.impressions || 0),
      total_reach: parseInt(rawSummary.reach || 0),
      total_clicks: parseInt(rawSummary.inline_link_clicks || 0),
      total_conversions: totalConversions,
      cost_per_result: totalConversions > 0 ? (totalSpend / totalConversions) : 0
    };

    const demographics = (demoRes.data.data || []).map(row => {
      const msgActions = (row.actions || []).find(a => a.action_type === 'onsite_conversion.messaging_first_reply');
      const startActions = (row.actions || []).find(a => a.action_type === 'messaging_conversation_started_7d');
      const results = msgActions ? parseInt(msgActions.value || 0) : (startActions ? parseInt(startActions.value || 0) : 0);

      const spend = Math.round(parseFloat(row.spend || 0) * 100) / 100;
      return { age: row.age, gender: row.gender, spend, reach: parseInt(row.reach || 0), results, cpr: results > 0 ? (spend / results) : 0 };
    });

    const platforms = (platformRes.data.data || []).map(row => {
      const msgActions = (row.actions || []).find(a => a.action_type === 'onsite_conversion.messaging_first_reply');
      const startActions = (row.actions || []).find(a => a.action_type === 'messaging_conversation_started_7d');
      const results = msgActions ? parseInt(msgActions.value || 0) : (startActions ? parseInt(startActions.value || 0) : 0);

      const spend = Math.round(parseFloat(row.spend || 0) * 100) / 100;
      return { platform: row.publisher_platform, spend, reach: parseInt(row.reach || 0), results };
    });

    let creativePerformance = [];
    if (level !== 'ad') {
       const rawAds = adBreakdownRes.data.data || [];
       const localAds = await FacebookAd.find({ fb_ad_id: { $in: rawAds.map(ra => ra.ad_id) } }).lean();

       creativePerformance = rawAds.map(ra => {
         const local = localAds.find(la => la.fb_ad_id === ra.ad_id);
         const msgActions = (ra.actions || []).find(a => a.action_type === 'onsite_conversion.messaging_first_reply');
         const startActions = (ra.actions || []).find(a => a.action_type === 'messaging_conversation_started_7d');
         const results = msgActions ? parseInt(msgActions.value || 0) : (startActions ? parseInt(startActions.value || 0) : 0);

         const spend = Math.round(parseFloat(ra.spend || 0) * 100) / 100;
         return {
           ad_id: ra.ad_id,
           name: local?.name || 'Unknown Ad',
           image: local?.local_media?.image || null,
           spend,
           results,
           cost_per_result: results > 0 ? (spend / results) : 0
         };
       });
    }

    return res.json({
      success: true,
      data: {
        summary,
        chart: dailyData,
        demographics,
        platforms,
        creative_performance: creativePerformance,
        period_days: period,
        target_id: id
      }
    });
  } catch (error) {
    console.error('[getFbAdInsights] Error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch advanced insights' });
  }
};


export const getFbAdCampaignById = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const campaign = await FacebookAdCampaign.findOne({ _id: req.params.id, user_id: userId, deleted_at: null })
      .populate('fb_page_id', 'page_name page_id picture_url')
      .lean();

    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const adsets = await FacebookAdSet.find({ campaign_id: campaign._id, deleted_at: null }).lean();
    const adsetsWithAds = await Promise.all(adsets.map(async (as) => {
      const ads = await FacebookAd.find({ ad_set_id: as._id, deleted_at: null }).lean();
      return { ...as, ads };
    }));

    return res.json({
      success: true,
      data: { ...campaign, adsets: adsetsWithAds }
    });
  } catch (error) {
    console.error('[getFbAdCampaignById] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch campaign details', details: error.message });
  }
};


export const syncFbAdCampaignStatus = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const campaign = await FacebookAdCampaign.findOne({
      _id: req.params.id, user_id: userId, deleted_at: null
    });

    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;

    const campRes = await axios.get(`${BASE}/${campaign.fb_campaign_id}`, {
      params: { fields: 'id,name,status,effective_status', access_token: token }
    });

    const fbStatus = (campRes.data.effective_status || campRes.data.status || '').toLowerCase();
    const statusMap = {
      active: 'active',
      paused: 'paused',
      deleted: 'deleted',
      archived: 'archived'
    };
    campaign.status = statusMap[fbStatus] || 'paused';
    campaign.last_synced_at = new Date();
    await campaign.save();

    return res.json({
      success: true,
      message: 'Campaign status synced from Facebook',
      data: {
        _id: campaign._id,
        fb_campaign_id: campaign.fb_campaign_id,
        status: campaign.status,
        fb_effective_status: fbStatus
      }
    });
  } catch (error) {
    console.error('[syncFbAdCampaignStatus] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to sync campaign status' });
  }
};

export const updateFbAdCampaign = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const { name, daily_budget, targeting } = req.body;
    const record = await FacebookAdCampaign.findOne({ _id: req.params.id, user_id: userId, deleted_at: null });

    if (!record) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;

    if (name) {
      if (record.fb_campaign_id) await axios.post(`${BASE}/${record.fb_campaign_id}`, null, { params: { name, access_token: token } });
      if (record.fb_adset_id) await axios.post(`${BASE}/${record.fb_adset_id}`, null, { params: { name: `${name} - AdSet`, access_token: token } });
      if (record.fb_creative_id) await axios.post(`${BASE}/${record.fb_creative_id}`, null, { params: { name: `${name} - Creative`, access_token: token } });
      if (record.fb_ad_id) await axios.post(`${BASE}/${record.fb_ad_id}`, null, { params: { name: `${name} - Ad`, access_token: token } });
      record.name = name;
    }

    if (daily_budget) {
      const budgetValue = String(Math.round(Number(daily_budget) * 100));
      if (record.is_cbo && record.fb_campaign_id) {
        await axios.post(`${BASE}/${record.fb_campaign_id}`, null, {
          params: { daily_budget: budgetValue, access_token: token }
        });
      } else if (record.fb_adset_id) {
        await axios.post(`${BASE}/${record.fb_adset_id}`, null, {
          params: { daily_budget: budgetValue, access_token: token }
        });
      }
      record.daily_budget = Number(daily_budget);
    }

    if (targeting && record.fb_adset_id) {
       await axios.post(`${BASE}/${record.fb_adset_id}`, null, {
         params: {
           targeting: JSON.stringify(targeting),
           access_token: token
         }
       });
       record.targeting = targeting;
    }


    await record.save();
    return res.json({ success: true, message: 'Campaign updated on Meta and locally', data: record });
  } catch (error) {
    console.error('[updateFbAdCampaign] Error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to update campaign', details: error?.response?.data?.error?.message || error.message });
  }
};


export const deleteFbAdCampaign = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const campaign = await FacebookAdCampaign.findOne({
      _id: req.params.id, user_id: userId, deleted_at: null
    });

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    try {
      const connection = await FacebookConnection.findOne({ user_id: userId, is_active: true }).lean();
      if (connection && campaign.fb_campaign_id) {
        const token = connection.long_lived_access_token;

        try {
          await axios.delete(`${BASE}/${campaign.fb_campaign_id}`, { params: { access_token: token } });
        } catch (e) {
          console.log('[deleteFbAdCampaign] Hard delete failed (likely spend), falling back to ARCHIVE');
          await axios.post(`${BASE}/${campaign.fb_campaign_id}`, null, {
            params: { status: 'ARCHIVED', access_token: token }
          });
        }
      }
    } catch (metaErr) {
      console.error('[deleteFbAdCampaign] Meta cleanup warning:', metaErr.message);
    }

    const now = new Date();
    campaign.deleted_at = now;
    campaign.status = 'deleted';
    await campaign.save();

    await FacebookAdSet.updateMany({ campaign_id: campaign._id }, { $set: { deleted_at: now, status: 'deleted' } });
    const adsets = await FacebookAdSet.find({ campaign_id: campaign._id }).select('_id');
    const adsetIds = adsets.map(as => as._id);
    await FacebookAd.updateMany({ ad_set_id: { $in: adsetIds } }, { $set: { deleted_at: now, status: 'deleted' } });

    return res.json({ success: true, message: 'Campaign and all linked ads deleted locally and processed on Meta' });
  } catch (error) {
    console.error('[deleteFbAdCampaign] Error:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to delete campaign', details: error.message });
  }
};


export const updateFbAdCampaignStatus = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const { status } = req.body;

    if (!status) return res.status(400).json({ success: false, error: 'Status field is required.' });

    let targetStatus = status.toUpperCase();
    if (targetStatus === 'PUBLISH') targetStatus = 'ACTIVE';
    if (targetStatus === 'DEACTIVATE') targetStatus = 'PAUSED';

    const validStatuses = ['ACTIVE', 'PAUSED'];
    if (!validStatuses.includes(targetStatus)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Use ACTIVE, PAUSED, PUBLISH, or DEACTIVATE.' });
    }

    const campaign = await FacebookAdCampaign.findOne({ _id: req.params.id, user_id: userId, deleted_at: null });
    if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;

    await axios.post(`${BASE}/${campaign.fb_campaign_id}`, null, {
      params: { status: targetStatus, access_token: token }
    });

    const localStat = targetStatus.toLowerCase();
    campaign.status = localStat;
    campaign.last_synced_at = new Date();
    await campaign.save();

    await FacebookAdSet.updateMany({ campaign_id: campaign._id }, { $set: { status: localStat } });
    const adsets = await FacebookAdSet.find({ campaign_id: campaign._id }).select('_id');
    await FacebookAd.updateMany({ ad_set_id: { $in: adsets.map(as => as._id) } }, { $set: { status: localStat } });

    return res.json({
      success: true,
      message: `Campaign and all linked ads successfully updated to ${targetStatus}`,
      data: campaign
    });
  } catch (error) {
    console.error('[updateFbAdCampaignStatus] Error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to update campaign status' });
  }
};


export const updateFbAdBudget = async (req, res) => {
  try {
    const userId = getOwnerId(req.user);
    const { id, level } = req.params;
    const { daily_budget, lifetime_budget } = req.body;

    const connection = await requireConnection(userId);
    const token = connection.long_lived_access_token;

    let fbId = null;
    let localDoc = null;

    if (level === 'campaign') {
      localDoc = await FacebookAdCampaign.findOne({ _id: id, user_id: userId });
      fbId = localDoc?.fb_campaign_id;
    } else if (level === 'adset') {
      localDoc = await FacebookAdSet.findOne({ _id: id, user_id: userId });
      fbId = localDoc?.fb_adset_id;
    }

    if (!fbId) return res.status(404).json({ success: false, error: 'Target not found' });

    const metaParams = {};
    if (daily_budget) metaParams.daily_budget = String(Math.round(Number(daily_budget) * 100));
    if (lifetime_budget) metaParams.lifetime_budget = String(Math.round(Number(lifetime_budget) * 100));

    await axios.post(`${BASE}/${fbId}`, null, { params: { ...metaParams, access_token: token } });

    if (daily_budget) localDoc.daily_budget = Number(daily_budget);
    if (lifetime_budget) localDoc.lifetime_budget = Number(lifetime_budget);
    await localDoc.save();

    return res.json({ success: true, message: 'Budget updated successfully', data: localDoc });
  } catch (error) {
    console.error('[updateFbAdBudget] Error:', error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Failed to update budget' });
  }
};
