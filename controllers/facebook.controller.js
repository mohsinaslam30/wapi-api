import mongoose from 'mongoose';
import { Setting, FacebookConnection, FacebookPage, FacebookAdAccount, WhatsappPhoneNumber } from '../models/index.js';
import crypto from 'crypto';
import axios from 'axios';

const FB_API_VERSION = 'v22.0';


const fetchAllFacebookPages = async (accessToken, fbUserId, userId) => {
  let allPages = [];

  let pagesUrl = `https://graph.facebook.com/${FB_API_VERSION}/me/accounts?access_token=${accessToken}&fields=id,name,access_token,category,picture.type(large),is_verified,tasks,business&limit=100`;
  while (pagesUrl) {
    try {
      const response = await axios.get(pagesUrl);
      const batch = response.data.data || [];
      allPages = [...allPages, ...batch];
      pagesUrl = response.data.paging?.next || null;
    } catch (error) {
      console.error('Error fetching personal pages:', error?.response?.data || error.message);
      break;
    }
  }

  let businessesUrl = `https://graph.facebook.com/${FB_API_VERSION}/me/businesses?access_token=${accessToken}&fields=id,name&limit=100`;
  let businesses = [];
  while (businessesUrl) {
    try {
      const resp = await axios.get(businessesUrl);
      businesses = [...businesses, ...(resp.data.data || [])];
      businessesUrl = resp.data.paging?.next || null;
    } catch (error) {
      console.error('Error fetching businesses:', error?.response?.data || error.message);
      break;
    }
  }

  for (const biz of businesses) {
    let bizPagesUrl = `https://graph.facebook.com/${FB_API_VERSION}/${biz.id}/owned_pages?access_token=${accessToken}&fields=id,name,access_token,category,picture.type(large),is_verified,business&limit=100`;
    while (bizPagesUrl) {
      try {
        const bizResp = await axios.get(bizPagesUrl);
        allPages = [...allPages, ...(bizResp.data.data || [])];
        bizPagesUrl = bizResp.data.paging?.next || null;
      } catch (error) {
        console.warn(`Failed to fetch owned_pages for business ${biz.id}:`, error?.response?.data?.error?.message || error.message);
        break;
      }
    }
  }

  let foundWabaNo = false;
  try {
    const wabaRes = await axios.get(`https://graph.facebook.com/${FB_API_VERSION}/me/whatsapp_business_accounts`, {
      params: { fields: 'id', access_token: accessToken }
    });
    const wabas = wabaRes.data.data || [];
    foundWabaNo = (wabas.length > 0);
  } catch (err) {
  }

  if (!foundWabaNo && userId) {
    const localWaba = await WhatsappPhoneNumber.findOne({ user_id: userId, is_active: true, deleted_at: null }).lean();
    foundWabaNo = !!localWaba;
  }

  const uniquePages = [];
  const pageIds = new Set();

  for (const page of allPages) {
    if (!pageIds.has(page.id)) {
      page.is_whatsapp_connected = foundWabaNo;
      uniquePages.push(page);
      pageIds.add(page.id);
    }
  }

  return uniquePages;
};


export const handleFacebookCallback = async (req, res) => {
  try {
    const { access_token } = req.body;
    const userId = req.user.owner_id || req.user.id;

    if (!access_token) {
      return res.status(400).json({ success: false, error: 'Access token is required from FB SDK' });
    }

    const metaSettings = await Setting.findOne().lean();
    if (!metaSettings?.app_id || !metaSettings?.app_secret) {
      return res.status(500).json({
        success: false,
        error: 'Meta app configuration not found. Please update App ID and App Secret in Settings.'
      });
    }

    const { app_id, app_secret } = metaSettings;

    let accessToken = access_token;
    console.log("accessToken", accessToken);
    try {
      const longLivedTokenRes = await axios.get(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: app_id,
          client_secret: app_secret,
          fb_exchange_token: accessToken
        }
      });
      accessToken = longLivedTokenRes.data.access_token || accessToken;
    } catch (e) {
      console.warn('Could not exchange for long lived token:', e.message);
    }

    try {
      const appToken = `${app_id}|${app_secret}`;
      const debugRes = await axios.get(`https://graph.facebook.com/debug_token`, {
        params: { input_token: accessToken, access_token: appToken }
      });
      console.log("Granted Scopes:", debugRes.data?.data?.scopes);
      console.log("Granular Scopes:", debugRes.data?.data?.granular_scopes);
      console.log("Token Data Access:", debugRes.data?.data?.data_access_expires_at ? new Date(debugRes.data?.data?.data_access_expires_at * 1000) : "N/A");
    } catch (debugErr) {
      console.warn('Could not debug token:', debugErr?.response?.data || debugErr.message);
    }

    const meRes = await axios.get(`https://graph.facebook.com/${FB_API_VERSION}/me`, {
      params: { access_token: accessToken, fields: 'id,name,email' }
    });
    const fbUser = meRes.data;

    const connection = await FacebookConnection.findOneAndUpdate(
      { user_id: userId },
      {
        fb_user_id: fbUser.id,
        name: fbUser.name,
        email: fbUser.email,
        long_lived_access_token: accessToken,
        is_active: true
      },
      { upsert: true, new: true }
    );

    let pages = [];
    let adAccounts = [];
    try {
      pages = await fetchAllFacebookPages(accessToken, fbUser.id, userId);

      let accountsUrl = `https://graph.facebook.com/${FB_API_VERSION}/me/adaccounts?access_token=${accessToken}&fields=id,name,account_id,currency,account_status,funding_source_details,is_prepay_account,balance&limit=100`;
      while (accountsUrl) {
        try {
          const accResp = await axios.get(accountsUrl);
          adAccounts = [...adAccounts, ...(accResp.data.data || [])];
          accountsUrl = accResp.data.paging?.next || null;
        } catch (accErr) {
          console.error('Error fetching ad accounts during callback:', accErr?.response?.data || accErr.message);
          break;
        }
      }

        const validPages = pages.filter(p => !!p.access_token);
        const skippedCount = pages.length - validPages.length;
        if (skippedCount > 0) {
          console.warn(`Skipped ${skippedCount} pages because they were missing access_tokens.`);
        }

        if (validPages.length > 0) {
          await FacebookPage.deleteMany({ connection_id: connection._id });

          const pageDocs = validPages.map(p => ({
            user_id: userId,
            connection_id: connection._id,
            page_id: p.id,
            page_name: p.name,
            page_access_token: p.access_token,
            category: p.category,
            picture_url: p.picture?.data?.url,
            is_meta_verified: p.is_verified || false,
            business_id: p.business?.id || null,
            is_whatsapp_connected: !!p.is_whatsapp_connected,
            is_active: true
          }));

          await FacebookPage.insertMany(pageDocs);
        }

        if (adAccounts.length > 0) {
          const adAccountStatusMap = {
            1: 'Active', 2: 'Disabled', 3: 'Unsettled', 7: 'Pending Review',
            9: 'In Grace Period', 100: 'Pending Closure', 101: 'Test Account', 201: 'Closed'
          };

          const adDocs = adAccounts.map(acc => {
            const hasPaymentMethod = !!(acc.funding_source_details?.id);
            return {
              user_id: userId,
              connection_id: connection._id,
              ad_account_id: acc.id,
              name: acc.name,
              currency: acc.currency,
              account_status: acc.account_status,
              status_label: adAccountStatusMap[acc.account_status] || 'Unknown',
              has_payment_method: hasPaymentMethod,
              can_create_ads: acc.account_status === 1 && hasPaymentMethod,
              balance: acc.balance,
              is_active: true
            };
          });

          await FacebookAdAccount.deleteMany({ connection_id: connection._id });
          await FacebookAdAccount.insertMany(adDocs);
        }
    } catch (pageErr) {
      console.warn('Failed to fetch Facebook pages during connection:', pageErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Facebook account linked successfully!',
      pages: pages.length || 0,
      data: pages
    });

  } catch (error) {
    console.error('Error handling Facebook callback:', error?.response?.data || error);

    return res.status(500).json({
      success: false,
      error: 'Failed to complete Facebook setup',
      details: error?.response?.data?.error?.message || error.message
    });
  }
};

export const getFacebookPages = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;
    const connection = await FacebookConnection.findOne({ user_id: userId, is_active: true }).lean();
    let pages = await FacebookPage.find({ user_id: userId, is_active: true }).select('-page_access_token').lean();

    if (connection?.default_page_id) {
      pages = pages.map(page => ({
        ...page,
        is_default: page._id.toString() === connection.default_page_id.toString()
      }));
    }

    return res.status(200).json({
      success: true,
      isConnected: !!connection,
      data: pages
    });
  } catch (error) {
    console.error('Error fetching Facebook pages:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch Facebook pages',
      details: error.message
    });
  }
};

export const syncFacebookPages = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;


    const connection = await FacebookConnection.findOne({ user_id: userId, is_active: true });
    if (!connection) {
      return res.status(404).json({ success: false, error: 'No active Facebook connection found' });
    }


    const pages = await fetchAllFacebookPages(connection.long_lived_access_token, connection.fb_user_id, userId);


    const validPages = pages.filter(p => !!p.access_token);

    if (validPages.length > 0) {

      await FacebookPage.deleteMany({ connection_id: connection._id });

      const pageDocs = validPages.map(p => ({
        user_id: userId,
        connection_id: connection._id,
        page_id: p.id,
        page_name: p.name,
        page_access_token: p.access_token,
        category: p.category,
        picture_url: p.picture?.data?.url,
        is_meta_verified: p.is_verified || false,
        business_id: p.business?.id || null,
        is_whatsapp_connected: !!p.is_whatsapp_connected,
        is_active: true
      }));

      await FacebookPage.insertMany(pageDocs);
    } else {
      await FacebookPage.deleteMany({ connection_id: connection._id });
    }

    return res.status(200).json({
      success: true,
      message: 'Facebook pages synchronized successfully!',
      count: pages.length
    });

  } catch (error) {
    console.error('Error synchronizing Facebook pages:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to synchronize Facebook pages',
      details: error.message
    });
  }
};

export const syncLinkedSocialAccounts = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;

    const connection = await FacebookConnection.findOne({ user_id: userId, is_active: true });
    if (!connection) {
      return res.status(404).json({ success: false, error: 'No active Facebook connection found' });
    }

    const localPages = await FacebookPage.find({ connection_id: connection._id, is_active: true });
    if (localPages.length === 0) {
      return res.status(404).json({ success: false, error: 'No Facebook pages found to sync.' });
    }

    let updatedPages = 0;
    const activeWaba = await WhatsappPhoneNumber.findOne({ user_id: userId, is_active: true, deleted_at: null }).lean();

    let globalWhatsappConnected = false;
    try {
      const wabaRes = await axios.get(`https://graph.facebook.com/${FB_API_VERSION}/me/whatsapp_business_accounts`, {
        params: { fields: 'id', access_token: connection.long_lived_access_token }
      });
      globalWhatsappConnected = (wabaRes.data.data || []).length > 0;
    } catch (e) {
    }

    if (!globalWhatsappConnected && activeWaba) {
      globalWhatsappConnected = true;
    }

    for (const page of localPages) {
      try {
        const response = await axios.get(`https://graph.facebook.com/${FB_API_VERSION}/${page.page_id}`, {
          params: {
            fields: 'business,instagram_business_account{id,username}',
            access_token: page.page_access_token || connection.long_lived_access_token
          }
        });

        const pageData = response.data;
        const businessId = pageData.business?.id;
        const hasInstagram = !!pageData.instagram_business_account?.id;
        const instagramUsername = pageData.instagram_business_account?.username || null;

        await FacebookPage.findByIdAndUpdate(page._id, {
          is_instagram_connected: hasInstagram,
          instagram_username: instagramUsername,
          is_whatsapp_connected: globalWhatsappConnected,
          business_id: businessId
        });

        updatedPages++;
      } catch (err) {
        console.warn(`Failed to sync Instagram/Business for page ${page.page_id}:`, err?.response?.data || err.message);
      }
    }
    return res.status(200).json({
      success: true,
      message: 'Linked social accounts synced successfully',
      pages_checked: localPages.length,
      pages_updated: updatedPages
    });

  } catch (error) {
    console.error('Error syncing linked social accounts:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync linked social accounts',
      details: error.message
    });
  }
};

export const updateFacebookDefaults = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;
    const { default_page_id } = req.body;

    const connection = await FacebookConnection.findOneAndUpdate(
      { user_id: userId, is_active: true },
      {
        $set: {
          default_page_id: default_page_id || null
        }
      },
      { new: true }
    );

    if (!connection) {
      return res.status(404).json({ success: false, error: 'No active Facebook connection found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Facebook defaults updated successfully',
      data: {
        default_page_id: connection.default_page_id
      }
    });

  } catch (error) {
    console.error('Error updating Facebook defaults:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update Facebook defaults',
      details: error.message
    });
  }
};

