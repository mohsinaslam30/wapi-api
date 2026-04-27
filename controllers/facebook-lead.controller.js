import mongoose from 'mongoose';
import crypto from 'crypto';
import axios from 'axios';
import {
  Setting,
  FacebookConnection,
  FacebookPage,
  FacebookLeadForm,
  FacebookLead,
  Contact,
  CustomField,
  Tag,
} from '../models/index.js';

const FB_API_VERSION = 'v22.0';


const findPageWithToken = async (pageId) => {
  return FacebookPage.findOne({ page_id: pageId, is_active: true }).lean();
};


const flattenFieldData = (fieldData = []) => {
  const obj = {};
  for (const f of fieldData) {
    const key = f.name || f.field_name;
    if (key) {
      obj[key] = Array.isArray(f.values) ? f.values[0] : f.values;
    }
  }
  return obj;
};


const buildContactPayload = (leadForm, flatFields) => {
  const contactData = { custom_fields: {} };

  for (const mapping of leadForm.field_mapping) {
    const value = flatFields[mapping.fb_field_name];
    if (value === undefined || value === null || value === '') continue;

    if (mapping.contact_field === 'custom_field') {
      contactData._customFieldMappings = contactData._customFieldMappings || [];
      contactData._customFieldMappings.push({
        custom_field_id: mapping.custom_field_id,
        value
      });
    } else {
      contactData[mapping.contact_field] = value;
    }
  }

  return contactData;
};


const upsertContactFromLead = async (leadForm, flatFields, userId) => {
  try {
    const payload = buildContactPayload(leadForm, flatFields);

    if (payload._customFieldMappings?.length) {
      const cfIds = payload._customFieldMappings.map(m => m.custom_field_id).filter(Boolean);
      const customFields = await CustomField.find({ _id: { $in: cfIds } }).lean();
      const cfMap = {};
      for (const cf of customFields) cfMap[cf._id.toString()] = cf.name;

      for (const m of payload._customFieldMappings) {
        const fieldName = cfMap[m.custom_field_id?.toString()];
        if (fieldName) payload.custom_fields[fieldName] = m.value;
      }
    }
    delete payload._customFieldMappings;

    if (!payload.phone_number && !payload.email) {
      return { contact: null, error: 'No phone_number or email mapped — cannot create contact' };
    }

    if (payload.phone_number) {
      payload.phone_number = String(payload.phone_number).replace(/[\s\-()+]/g, '');
    }

    if (!payload.name) {
      payload.name = payload.email || payload.phone_number || 'Facebook Lead';
    }

    const phoneIdentifier = payload.phone_number || `email:${payload.email}`;

    let contact = await Contact.findOne({
      phone_number: phoneIdentifier,
      user_id: userId,
      deleted_at: null
    });

    const tagIds = (leadForm.tag_ids || []).map(id => new mongoose.Types.ObjectId(id));

    if (contact) {
      if (payload.email && !contact.email) contact.email = payload.email;
      if (payload.name && contact.name === 'Facebook Lead') contact.name = payload.name;
      if (tagIds.length) {
        const existingTagStrs = contact.tags.map(t => t.toString());
        for (const tid of tagIds) {
          if (!existingTagStrs.includes(tid.toString())) contact.tags.push(tid);
        }
      }
      for (const [k, v] of Object.entries(payload.custom_fields || {})) {
        contact.custom_fields.set(k, v);
      }
      await contact.save();
    } else {
      contact = await Contact.create({
        phone_number: phoneIdentifier,
        name: payload.name,
        email: payload.email || null,
        source: 'whatsapp',
        tags: tagIds,
        custom_fields: payload.custom_fields || {},
        user_id: userId,
        created_by: userId,
        status: 'lead',
        type: 'lead'
      });
    }

    if (tagIds.length) {
      await Tag.updateMany({ _id: { $in: tagIds } }, { $inc: { usage_count: 1 } });
    }

    return { contact, error: null };
  } catch (err) {
    return { contact: null, error: err.message };
  }
};


export const getInstantForms = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;
    const { page_id } = req.query;

    if (!page_id) {
      return res.status(400).json({ success: false, error: 'page_id query param is required' });
    }

    const page = await FacebookPage.findOne({ page_id, user_id: userId, is_active: true }).lean();
    if (!page) {
      return res.status(404).json({ success: false, error: 'Facebook page not found or not connected' });
    }

    const accessToken = page.page_access_token;
    let forms = [];
    let url = `https://graph.facebook.com/${FB_API_VERSION}/${page_id}/leadgen_forms?fields=id,name,status,created_time&limit=100&access_token=${accessToken}`;

    while (url) {
      const resp = await axios.get(url);
      forms = [...forms, ...(resp.data.data || [])];
      url = resp.data.paging?.next || null;
    }

    return res.status(200).json({ success: true, count: forms.length, data: forms });
  } catch (error) {
    console.error('Error fetching instant forms:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch instant forms',
      details: error?.response?.data?.error?.message || error.message
    });
  }
};


export const connectLeadForm = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;
    const { page_id, form_id, form_name, tag_ids = [] } = req.body;

    if (!page_id || !form_id) {
      return res.status(400).json({ success: false, error: 'page_id and form_id are required' });
    }

    const page = await FacebookPage.findOne({ page_id, user_id: userId, is_active: true }).lean();
    if (!page) {
      return res.status(404).json({ success: false, error: 'Facebook page not found or not connected' });
    }

    if (tag_ids.length) {
      const validIds = tag_ids.filter(id => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length !== tag_ids.length) {
        return res.status(400).json({ success: false, error: 'One or more tag_ids are invalid' });
      }
      const tagCount = await Tag.countDocuments({ _id: { $in: validIds }, created_by: userId, deleted_at: null });
      if (tagCount !== validIds.length) {
        return res.status(400).json({ success: false, error: 'One or more tags not found or do not belong to you' });
      }
    }

    let webhookSubscribed = false;
    let subscriptionError = null;
    try {
      const subResp = await axios.post(
        `https://graph.facebook.com/${FB_API_VERSION}/${page_id}/subscribed_apps`,
        null,
        {
          params: {
            subscribed_fields: 'leadgen',
            access_token: page.page_access_token
          }
        }
      );
      webhookSubscribed = subResp.data?.success === true;
      console.log(`[LeadGen] Page ${page_id} subscription response:`, subResp.data);
    } catch (subErr) {
      subscriptionError = subErr?.response?.data?.error?.message || subErr.message;
      console.error('[LeadGen] Could not subscribe page to leadgen webhook:', subErr?.response?.data || subErr.message);
    }

    let samplePayload = null;
    try {
      const sampleResp = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/${form_id}/leads`,
        { params: { fields: 'field_data', limit: 1, access_token: page.page_access_token } }
      );
      const sampleLead = sampleResp.data?.data?.[0];
      if (sampleLead?.field_data) {
        samplePayload = sampleLead.field_data;
      }
    } catch (sampleErr) {
    }

    const leadForm = await FacebookLeadForm.findOneAndUpdate(
      { user_id: userId, form_id },
      {
        user_id: userId,
        facebook_page_id: page._id,
        page_id,
        form_id,
        form_name: form_name || form_id,
        tag_ids: tag_ids.map(id => new mongoose.Types.ObjectId(id)),
        webhook_subscribed: webhookSubscribed,
        sample_payload: samplePayload,
        is_active: true
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: webhookSubscribed
        ? 'Lead form connected and page subscribed successfully'
        : 'Lead form connected but page subscription failed — see subscription_error',
      data: leadForm,
      webhook_subscribed: webhookSubscribed,
      subscription_error: subscriptionError || undefined,
      sample_payload_available: !!samplePayload
    });
  } catch (error) {
    console.error('Error connecting lead form:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to connect lead form',
      details: error?.response?.data?.error?.message || error.message
    });
  }
};


export const getConnectedForms = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;

    const forms = await FacebookLeadForm.find({ user_id: userId, is_active: true })
      .populate('tag_ids', 'label color')
      .populate('facebook_page_id', 'page_name picture_url page_id')
      .lean();

    return res.status(200).json({ success: true, count: forms.length, data: forms });
  } catch (error) {
    console.error('Error fetching connected forms:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch connected forms', details: error.message });
  }
};

export const getFormById = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid form ID' });
    }

    const form = await FacebookLeadForm.findOne({ _id: id, user_id: userId })
      .populate('tag_ids', 'label color')
      .populate('field_mapping.custom_field_id', 'name label type')
      .lean();

    if (!form) {
      return res.status(404).json({ success: false, error: 'Connected form not found' });
    }

    return res.status(200).json({ success: true, data: form });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch form', details: error.message });
  }
};

export const updateFormMapping = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;
    const { id } = req.params;
    const { field_mapping = [], tag_ids = [] } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid form ID' });
    }

    const form = await FacebookLeadForm.findOne({ _id: id, user_id: userId });
    if (!form) {
      return res.status(404).json({ success: false, error: 'Connected form not found' });
    }

    const allowedContactFields = ['name', 'email', 'phone_number', 'custom_field'];
    for (const m of field_mapping) {
      if (!m.fb_field_name || !m.contact_field) {
        return res.status(400).json({ success: false, error: 'Each mapping must have fb_field_name and contact_field' });
      }
      if (!allowedContactFields.includes(m.contact_field)) {
        return res.status(400).json({
          success: false,
          error: `contact_field must be one of: ${allowedContactFields.join(', ')}`
        });
      }
      if (m.contact_field === 'custom_field' && !m.custom_field_id) {
        return res.status(400).json({
          success: false,
          error: 'custom_field_id is required when contact_field is "custom_field"'
        });
      }
    }

    const customMappings = field_mapping.filter(m => m.contact_field === 'custom_field');
    if (customMappings.length > 0) {
      const userCustomFields = await CustomField.find({ created_by: userId, deleted_at: null }).lean();

      for (const m of customMappings) {
        const rawId = m.custom_field_id;

        if (mongoose.Types.ObjectId.isValid(rawId)) {
          const exists = userCustomFields.find(cf => cf._id.toString() === rawId.toString());
          if (!exists) {
            return res.status(400).json({
              success: false,
              error: `Custom field with ID "${rawId}" not found or does not belong to you`
            });
          }
          m.custom_field_id = new mongoose.Types.ObjectId(rawId);
        } else {
          const matched = userCustomFields.find(
            cf => cf.name === rawId || cf.label === rawId
          );
          if (!matched) {
            return res.status(400).json({
              success: false,
              error: `Custom field "${rawId}" not found. Use a valid name, label, or ObjectId.`,
              available_fields: userCustomFields.map(cf => ({
                id: cf._id,
                name: cf.name,
                label: cf.label,
                type: cf.type
              }))
            });
          }
          m.custom_field_id = matched._id;
        }
      }
    }

    if (tag_ids.length) {
      const invalidTags = tag_ids.filter(t => !mongoose.Types.ObjectId.isValid(t));
      if (invalidTags.length) {
        return res.status(400).json({ success: false, error: `Invalid tag_ids: ${invalidTags.join(', ')}` });
      }
    }

    form.field_mapping = field_mapping;
    form.tag_ids = tag_ids.map(t => new mongoose.Types.ObjectId(t));
    await form.save();

    const pendingLeads = await FacebookLead.find({ lead_form_id: form._id, status: 'pending' });
    let retried = 0;
    for (const lead of pendingLeads) {
      const flatFields = flattenFieldData(lead.raw_payload);
      const { contact, error } = await upsertContactFromLead(form, flatFields, userId);
      if (contact) {
        lead.status = 'created';
        lead.contact_id = contact._id;
        lead.error_message = null;
      } else {
        lead.status = 'failed';
        lead.error_message = error;
      }
      await lead.save();
      retried++;
    }

    return res.status(200).json({
      success: true,
      message: 'Mapping saved successfully',
      data: form,
      pending_leads_retried: retried
    });
  } catch (error) {
    console.error('Error updating form mapping:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update mapping', details: error.message });
  }
};


export const subscribePageToApp = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;
    const { page_id } = req.params;

    const page = await FacebookPage.findOne({ page_id, user_id: userId, is_active: true }).lean();
    if (!page) {
      return res.status(404).json({ success: false, error: 'Facebook page not found or not connected' });
    }

    let currentSubs = [];
    try {
      const currentResp = await axios.get(
        `https://graph.facebook.com/${FB_API_VERSION}/${page_id}/subscribed_apps`,
        { params: { access_token: page.page_access_token } }
      );
      currentSubs = currentResp.data?.data || [];
      console.log(`[LeadGen] Current page subscriptions for ${page_id}:`, JSON.stringify(currentSubs));
    } catch (e) {
      console.warn('[LeadGen] Could not fetch current subscriptions:', e?.response?.data || e.message);
    }

    const subResp = await axios.post(
      `https://graph.facebook.com/${FB_API_VERSION}/${page_id}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields: 'leadgen',
          access_token: page.page_access_token
        }
      }
    );

    console.log(`[LeadGen] Subscription response for page ${page_id}:`, subResp.data);

    await FacebookLeadForm.updateMany({ page_id, user_id: userId }, { webhook_subscribed: true });

    return res.status(200).json({
      success: true,
      message: 'Page successfully subscribed to leadgen webhook events',
      meta_response: subResp.data,
      previous_subscriptions: currentSubs
    });
  } catch (error) {
    console.error('[LeadGen] subscribePageToApp error:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to subscribe page to app',
      details: error?.response?.data?.error?.message || error.message,
      meta_error: error?.response?.data || null
    });
  }
};


export const disconnectForm = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid form ID' });
    }

    const form = await FacebookLeadForm.findOneAndUpdate(
      { _id: id, user_id: userId },
      { is_active: false },
      { new: true }
    );

    if (!form) {
      return res.status(404).json({ success: false, error: 'Connected form not found' });
    }

    return res.status(200).json({ success: true, message: 'Form disconnected successfully' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to disconnect form', details: error.message });
  }
};


export const getLeadsForForm = async (req, res) => {
  try {
    const userId = req.user.owner_id || req.user.id;
    const { id } = req.params;
    const { page = 1, limit = 20, status } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'Invalid form ID' });
    }

    const form = await FacebookLeadForm.findOne({ _id: id, user_id: userId }).lean();
    if (!form) return res.status(404).json({ success: false, error: 'Connected form not found' });

    const query = { lead_form_id: form._id };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [leads, total] = await Promise.all([
      FacebookLead.find(query)
        .populate('contact_id', 'name phone_number email')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      FacebookLead.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      data: leads,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch leads', details: error.message });
  }
};


export const verifyLeadgenWebhook = async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.FACEBOOK_LEAD_WEBHOOK_VERIFY_TOKEN;

  console.log(`[LeadGen Verify] mode=${mode} token=${token} expected=${verifyToken}`);

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[LeadGen] Facebook leadgen webhook verified successfully');
    return res.status(200).send(challenge);
  }

  console.warn('[LeadGen] Verification failed — token mismatch');
  return res.status(403).json({ error: 'Verification failed' });
};


export const handleLeadgenWebhook = async (req, res) => {
  res.sendStatus(200);

  try {
    console.log('[LeadGen Webhook] Received POST:', JSON.stringify(req.body, null, 2));

    const appSecret = process.env.FACEBOOK_APP_SECRET || (await Setting.findOne().select('app_secret').lean())?.app_secret;
    if (appSecret) {
      const signature = req.headers['x-hub-signature-256'];
      if (signature) {
        const expectedSig = 'sha256=' + crypto
          .createHmac('sha256', appSecret)
          .update(JSON.stringify(req.body))
          .digest('hex');
        if (signature !== expectedSig) {
          console.warn('[LeadGen Webhook] Signature mismatch — ignoring payload');
          return;
        }
      }
    }

    const body = req.body;
    if (body.object !== 'page') {
      console.warn('[LeadGen Webhook] Unexpected object type:', body.object);
      return;
    }

    for (const entry of (body.entry || [])) {
      const pageId = entry.id;

      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen') continue;

        const { leadgen_id, form_id, page_id: changePageId } = change.value || {};
        const resolvedPageId = changePageId || pageId;

        const page = await findPageWithToken(resolvedPageId);
        if (!page) {
          console.warn(`Leadgen webhook: no page found for page_id=${resolvedPageId}`);
          continue;
        }

        const leadForm = await FacebookLeadForm.findOne({
          page_id: resolvedPageId,
          form_id,
          is_active: true
        }).lean();

        if (!leadForm) {
          console.warn(`Leadgen webhook: no connected form found for form_id=${form_id}`);
          continue;
        }

        const exists = await FacebookLead.findOne({ lead_gen_id: leadgen_id }).lean();
        if (exists) continue;

        let fieldData = [];
        try {
          const leadResp = await axios.get(
            `https://graph.facebook.com/${FB_API_VERSION}/${leadgen_id}`,
            { params: { fields: 'field_data,created_time,form_id', access_token: page.page_access_token } }
          );
          fieldData = leadResp.data?.field_data || [];
          console.log(`[LeadGen Webhook] ✅ Raw field_data from Meta for lead ${leadgen_id}:`, JSON.stringify(fieldData, null, 2));
        } catch (fetchErr) {
          console.error(`[LeadGen Webhook] ❌ Failed to fetch lead ${leadgen_id} from Meta:`, fetchErr?.response?.data || fetchErr.message);
        }

        const leadLog = await FacebookLead.create({
          user_id: leadForm.user_id,
          lead_form_id: leadForm._id,
          lead_gen_id: leadgen_id,
          form_id,
          raw_payload: fieldData,
          status: 'pending'
        });

        if (!leadForm.sample_payload && fieldData.length) {
          await FacebookLeadForm.findByIdAndUpdate(leadForm._id, { sample_payload: fieldData });
        }

        if (!leadForm.field_mapping || leadForm.field_mapping.length === 0) {
          console.log(`[LeadGen Webhook] ⚠️  No field mapping for form ${form_id} — lead ${leadgen_id} stored as pending`);
          continue;
        }

        const flatFields = flattenFieldData(fieldData);
        console.log(`[LeadGen Webhook] 🔍 Flat fields from Meta:`, JSON.stringify(flatFields));
        console.log(`[LeadGen Webhook] 🔍 Your field_mapping fb_field_names:`, leadForm.field_mapping.map(m => m.fb_field_name));
        const unmapped = leadForm.field_mapping.filter(m => flatFields[m.fb_field_name] === undefined);
        if (unmapped.length) {
          console.warn(`[LeadGen Webhook] ⚠️  These mapped fb_field_names have NO value in Meta response:`,
            unmapped.map(m => m.fb_field_name));
          console.warn(`[LeadGen Webhook] ⚠️  Available field names from Meta:`, Object.keys(flatFields));
        }

        const { contact, error } = await upsertContactFromLead(leadForm, flatFields, leadForm.user_id.toString());

        if (contact) {
          leadLog.status = 'created';
          leadLog.contact_id = contact._id;
          console.log(`[LeadGen Webhook] ✅ Contact created/updated: ${contact._id} (${contact.name})`);
        } else {
          leadLog.status = 'failed';
          leadLog.error_message = error;
          console.error(`[LeadGen Webhook] ❌ Failed to create contact for lead ${leadgen_id}:`, error);
        }
        await leadLog.save();
      }
    }
  } catch (err) {
    console.error('Unhandled error in leadgen webhook handler:', err.message);
  }
};
