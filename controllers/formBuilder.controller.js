import axios from "axios";
import FormData from "form-data";
import { Form, WhatsappWaba } from "../models/index.js";
import { v4 as uuidv4 } from "uuid";



const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'sort_order';
const DEFAULT_SORT_ORDER = 1;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = [
    'name',
    'slug',
    'category',
    'is_active',
    'is_multi_step',
    'enable_recaptcha',
    'created_at',
    'meta_status',
    'flow.sync_status'
];

const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};

const parsePaginationParams = (query) => {
    const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
    const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

const parseSortParams = (query) => {
    const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
        ? query.sort_by
        : DEFAULT_SORT_FIELD;

    const sortOrder = query.sort_order?.toUpperCase() === 'DESC'
        ? SORT_ORDER.DESC
        : SORT_ORDER.ASC;

    return { sortField, sortOrder };
};

const buildSearchQuery = (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
        return {};
    }

    const sanitizedSearch = searchTerm.trim();

    return {
        $or: [
            { name: { $regex: sanitizedSearch, $options: 'i' } },
            { slug: { $regex: sanitizedSearch, $options: 'i' } },
            { description: { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};

const validateFormData = (formData) => {
    const errors = [];
    if (!formData.name || !formData.name.trim()) {
        errors.push("Name is required");
    }
    if (!formData.waba_id || !formData.waba_id.trim()) {
        errors.push("WABA ID is required");
    }
    if (!formData.category || !formData.category.trim()) {
        errors.push("Category is required");
    }
    return { isValid: errors.length === 0, errors };
}

export const getAllForms = async (req, res) => {
    try {
        const { meta_status, category, waba_id, search, is_active } = req.query;
        const userId = req.user.id;

        const { skip, limit, page } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const searchQuery = buildSearchQuery(search);

        if (meta_status !== undefined) {
            searchQuery.meta_status = meta_status;
        }
        if (is_active !== undefined) {
            searchQuery.is_active = is_active;
        }

        if (category !== undefined) {
            searchQuery.category = category;
        }

        if (!waba_id) {
            return res.status(400).json({ error: "WABA ID is required" });
        }

        const waba = await WhatsappWaba.findOne({ _id: waba_id, user_id: userId, deleted_at: null, });
        if (!waba) {
            return res.status(404).json({ error: "WABA not found" });
        }

        searchQuery.user_id = userId;
        searchQuery.waba_id = waba_id;
        searchQuery.deleted_at = null;

        const formCount = await Form.countDocuments(searchQuery);
        const forms = await Form.find(searchQuery)
            .skip(skip)
            .limit(limit)
            .sort({ [sortField]: sortOrder })
            .select("-__v");

        res.status(200).json({
            success: true,
            data: forms,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(formCount / limit),
                totalForms: formCount,
                limit: limit,
                skip: skip
            }
        });

    } catch (error) {
        console.error("Error fetching forms:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

export const createForm = async (req, res) => {
    try {
        let { waba_id, name, description, slug, category, is_active, submit_settings, fields } = req.body;
        const userId = req.user.id;

        const validation = validateFormData(req.body);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Form validation failed',
                errors: validation.errors
            });
        }

        if (!waba_id || !name) {
            return res.status(400).json({ error: "WABA ID and Name are required" });
        }

        if (!fields || !Array.isArray(fields)) {
            return res.status(400).json({ message: "fields must be an array" });
        }

        fields = fields.map((f) => ({
            id: f.id || uuidv4(),
            ...f
        }));


        const waba = await WhatsappWaba.findOne({
            _id: waba_id,
            user_id: userId,
            deleted_at: null
        });
        if (!waba) return res.status(404).json({ error: "WhatsApp WABA not found" });

        const finalSlug = slug || name.toLowerCase().replace(/\s+/g, "-");

        const form = await Form.create({
            user_id: userId,
            waba_id,
            name,
            description,
            slug: finalSlug,
            category: category ?? "CUSTOM",
            meta_status: "DRAFT",
            is_active: is_active ?? true,
            submit_settings,
            fields
        });

        const { access_token, whatsapp_business_account_id } = waba;

        if (form.waba_id) {
            try {
                const metaFlow = await createMetaFlow(whatsapp_business_account_id, access_token, form);

                form.flow = {
                    flow_id: metaFlow.id,
                }

                await form.save();

            } catch (metaError) {
                console.error("Meta Flow sync failed:", metaError.message);
            }
        }

        res.status(201).json({ success: true, data: form });

    } catch (error) {
        console.error("Error creating form:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

const getMetaType = (fieldType) => {
    switch (fieldType) {
        case 'number':
            return { type: 'number', __example__: 0 };
        case 'checkbox':
        case 'multiselect':
            return { type: 'array', items: { type: 'string' }, __example__: [] };
        default:
            return { type: 'string', __example__: "test" };
    }
};

export const buildMetaFlowPayload = (form) => {
    const STEP_NAMES = [
        'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE',
        'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'
    ];

    const stepMap = {};
    const fieldMapByName = {};

    (form.fields || []).forEach(f => {
        const step = f.step || 1;
        if (!stepMap[step]) stepMap[step] = [];
        stepMap[step].push(f);

        const name = f.name || generateName(f.label);
        fieldMapByName[name] = f;
    });

    const sortedSteps = Object.keys(stepMap).map(Number).sort((a, b) => a - b);
    const successScreenId = "SUCCESS_SCREEN";

    const allFieldNames = (form.fields || [])
        .filter(f => f.type !== 'heading')
        .map(f => f.name || generateName(f.label));

    const screens = sortedSteps.map((step, index) => {
        const isLastStep = index === sortedSteps.length - 1;

        const screenId = `STEP_${STEP_NAMES[index] || `EXTRA_${index}`}`;
        const nextScreenId = isLastStep
            ? successScreenId
            : `STEP_${STEP_NAMES[index + 1] || `EXTRA_${index + 1}`}`;

        const incomingFields = [];
        for (let i = 0; i < index; i++) {
            const s = sortedSteps[i];
            (stepMap[s] || []).forEach(f => {
                if (f.type !== 'heading') {
                    incomingFields.push(f.name || generateName(f.label));
                }
            });
        }

        const currentStepFields = (stepMap[step] || [])
            .filter(f => f.type !== 'heading')
            .map(f => f.name || generateName(f.label));

        const payload = {
            flow_token: "${data.flow_token}"
        };

        incomingFields.forEach(name => {
            payload[name] = `\${data.${name}}`;
        });

        currentStepFields.forEach(name => {
            payload[name] = `\${form.${name}}`;
        });

        return {
            id: screenId,
            title: form.name || `Step ${index + 1}`,
            terminal: false,
            data: incomingFields.reduce((acc, name) => {
                const field = fieldMapByName[name];
                acc[name] = getMetaType(field?.type);
                return acc;
            }, { flow_token: { type: "string", __example__: "test" } }),
            layout: {
                type: "SingleColumnLayout",
                children: [
                    {
                        type: "Form",
                        name: `form_step_${step}`,
                        children: (stepMap[step] || [])
                            .sort((a, b) => (a.order || 0) - (b.order || 0))
                            .map(mapFieldToMetaComponent)
                            .filter(Boolean)
                    },
                    {
                        type: "Footer",
                        label: isLastStep
                            ? (form.submit_settings?.button_text || "Submit")
                            : "Next",
                        "on-click-action": {
                            name: "navigate",
                            next: {
                                type: "screen",
                                name: nextScreenId
                            },
                            payload
                        }
                    }
                ]
            }
        };
    });

    const completePayload = {
        flow_token: "${data.flow_token}"
    };

    allFieldNames.forEach(name => {
        completePayload[name] = `\${data.${name}}`;
    });

    const successScreen = {
        id: successScreenId,
        title: "Success",
        terminal: true,
        success: true,
        data: allFieldNames.reduce((acc, name) => {
            const field = fieldMapByName[name];
            acc[name] = getMetaType(field?.type);
            return acc;
        }, { flow_token: { type: "string", __example__: "test" } }),
        layout: {
            type: "SingleColumnLayout",
            children: [
                {
                    type: "TextBody",
                    text: form.submit_settings?.success_message || "Thank you!"
                },
                {
                    type: "Footer",
                    label: "Done",
                    "on-click-action": {
                        name: "complete",
                        payload: completePayload
                    }
                }
            ]
        }
    };

    return {
        version: "7.3",
        screens: [...screens, successScreen]
    };
};

const mapDataSource = (options) => {
    if (!options) return [];

    if (!Array.isArray(options)) {
        options = [options];
    }

    return options
        .filter(o => o && (o.label || o.value))
        .map(o => ({
            id: String(o.id || o.value),
            title: String(o.label || o.value)
        }));
};

const generateName = (label = 'field') => {
    return label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || 'field';
};

const mapFieldToMetaComponent = (field) => {
    if (!field || !field.type) return null;

    if (field.type === 'heading') {
        return {
            type: 'TextHeading',
            text: field.meta?.text || field.label || ''
        };
    }

    const name = field.name || generateName(field.label);

    const base = {
        label: field.label || name,
        name,
        required: !!field.required
    };

    switch (field.type) {
        case 'text':
            return {
                ...base,
                type: 'TextInput',
                ...(field.helper_text && { 'helper-text': field.helper_text })
            };
        case 'number':
            return {
                ...base,
                type: 'TextInput',
                'input-type': 'number',
                ...(field.helper_text && { 'helper-text': field.helper_text })
            };
        case 'email':
            return {
                ...base,
                type: 'TextInput',
                'input-type': 'email',
                ...(field.helper_text && { 'helper-text': field.helper_text })
            };

        case 'phone':
            return {
                ...base,
                type: 'TextInput',
                'input-type': 'phone',
                ...(field.helper_text && { 'helper-text': field.helper_text })
            };

        case 'password':
        case 'passcode':
            return {
                ...base,
                type: 'TextInput',
                'input-type': 'password',
                ...(field.helper_text && { 'helper-text': field.helper_text })
            };

        case 'textarea':
            return {
                ...base,
                type: 'TextArea',
                ...(field.helper_text && { 'helper-text': field.helper_text })
            };

        case 'select': {
            const ds = mapDataSource(field.options);
            if (!ds.length) return null;

            return {
                ...base,
                type: 'Dropdown',
                'data-source': ds
            };
        }

        case 'radio': {
            const ds = mapDataSource(field.options);
            if (!ds.length) return null;

            return {
                ...base,
                type: 'RadioButtonsGroup',
                'data-source': ds
            };
        }

        case 'checkbox':
        case 'multiselect': {
            const ds = mapDataSource(field.options);
            if (!ds.length) return null;

            return {
                ...base,
                type: 'CheckboxGroup',
                'data-source': ds
            };
        }

        case 'date':
        case 'datetime':
        case 'time':
            return {
                ...base,
                type: 'DatePicker'
            };

        case 'submit':
            return null;

        default:
            return {
                ...base,
                type: 'TextInput'
            };
    }
};

const formatMetaFlowName = (name) => {
    if (!name) return "Untitled Flow";
    const cleaned = name.replace(/_[a-f0-9]{24}$/i, '').replace(/_\d{10,18}$/, '');
    return cleaned.replace(/_/g, ' ').trim() || "Untitled Flow";
};

const getMetaFlowJson = async (flowId, accessToken) => {
    try {
        const API_VERSION = "v21.0";
        const assetsResp = await axios.get(
            `https://graph.facebook.com/${API_VERSION}/${flowId}/assets?fields=id,name,asset_type,download_url`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const flowJsonAsset = (assetsResp.data.data || []).find(a => a.asset_type === 'FLOW_JSON');
        if (!flowJsonAsset) return null;

        let downloadUrl = flowJsonAsset.download_url;
        if (!downloadUrl && flowJsonAsset.id) {
            const assetResp = await axios.get(
                `https://graph.facebook.com/${API_VERSION}/${flowJsonAsset.id}?fields=download_url`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            downloadUrl = assetResp.data.download_url;
        }

        if (downloadUrl) {
            const contentResp = await axios.get(downloadUrl);
            return contentResp.data;
        }
        return null;
    } catch (err) {
        const errorMessage = err.response?.data?.error?.message || err.response?.data?.message || err.message;
        console.error(`Error fetching flow JSON for ${flowId}:`, errorMessage);
        return null;
    }
};

const transformMetaPayloadToFields = (payload) => {
    if (!payload || !payload.screens) return [];

    const fields = [];
    const processChildren = (children, currentFields, stepNum) => {
        children.forEach((comp) => {
            if (['TextInput', 'TextArea', 'Dropdown', 'RadioButtonsGroup', 'CheckboxGroup', 'DatePicker', 'TextHeading'].includes(comp.type)) {
                const field = {
                    id: uuidv4(),
                    step: stepNum,
                    order: currentFields.length + 1,
                    label: comp.label || comp.text || comp.name || "Field",
                    name: comp.name || (comp.label ? generateName(comp.label) : `field_${currentFields.length + 1}`),
                    required: !!comp.required,
                };

                switch (comp.type) {
                    case 'TextInput':
                        const it = comp['input-type'];
                        field.type = it === 'number' ? 'number' :
                            it === 'email' ? 'email' :
                                it === 'phone' ? 'phone' :
                                    it === 'password' ? 'password' : 'text';
                        if (comp['helper-text']) field.helper_text = comp['helper-text'];
                        break;
                    case 'TextArea':
                        field.type = 'textarea';
                        if (comp['helper-text']) field.helper_text = comp['helper-text'];
                        break;
                    case 'Dropdown':
                        field.type = 'select';
                        field.options = (comp['data-source'] || []).map(opt => ({
                            id: String(opt.id || opt.value),
                            label: opt.title || opt.label,
                            value: String(opt.id || opt.value)
                        }));
                        break;
                    case 'RadioButtonsGroup':
                        field.type = 'radio';
                        field.options = (comp['data-source'] || []).map(opt => ({
                            id: String(opt.id || opt.value),
                            label: opt.title || opt.label,
                            value: String(opt.id || opt.value)
                        }));
                        break;
                    case 'CheckboxGroup':
                        field.type = 'checkbox';
                        field.options = (comp['data-source'] || []).map(opt => ({
                            id: String(opt.id || opt.value),
                            label: opt.title || opt.label,
                            value: String(opt.id || opt.value)
                        }));
                        break;
                    case 'DatePicker':
                        field.type = 'date';
                        break;
                    case 'TextHeading':
                        field.type = 'heading';
                        field.meta = { text: comp.text };
                        break;
                }
                currentFields.push(field);
            }

            if (comp.children && Array.isArray(comp.children)) {
                processChildren(comp.children, currentFields, stepNum);
            }
            if (comp.layout && comp.layout.children && Array.isArray(comp.layout.children)) {
                processChildren(comp.layout.children, currentFields, stepNum);
            }
        });
    };

    payload.screens.forEach((screen, screenIdx) => {
        const stepNum = screenIdx + 1;
        if (screen.layout && screen.layout.children) {
            processChildren(screen.layout.children, fields, stepNum);
        }
    });

    return fields;
};

const createMetaFlow = async (wabaAccountId, accessToken, form) => {
    const API_VERSION = "v21.0";

    const flowName = `${form.name}_${form._id}`
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .substring(0, 64);

    const category = form.category || "OTHER";

    try {
        const createResponse = await axios.post(
            `https://graph.facebook.com/${API_VERSION}/${wabaAccountId}/flows`,
            {
                name: flowName,
                categories: [category]
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const flowId = createResponse.data.id;

        const payload = buildMetaFlowPayload(form);
        const jsonBuffer = Buffer.from(JSON.stringify(payload), 'utf-8');

        const formData = new FormData();
        formData.append('name', 'flow.json');
        formData.append('asset_type', 'FLOW_JSON');
        formData.append('file', jsonBuffer, {
            filename: 'flow.json',
            contentType: 'application/json'
        });

        await axios.post(
            `https://graph.facebook.com/${API_VERSION}/${flowId}/assets`,
            formData,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    ...formData.getHeaders()
                }
            }
        );

        return { id: flowId, payload };

    } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message;
        console.error("Meta Flow Creation Error:", errorMessage);

        throw new Error("Failed to create Meta Flow");
    }
};

const uploadFlowAssets = async (flowId, accessToken, payload) => {
    const API_VERSION = "v21.0";
    const jsonBuffer = Buffer.from(JSON.stringify(payload), 'utf-8');

    const formData = new FormData();
    formData.append('name', 'flow.json');
    formData.append('asset_type', 'FLOW_JSON');
    formData.append('file', jsonBuffer, {
        filename: 'flow.json',
        contentType: 'application/json'
    });

    try {
        await axios.post(
            `https://graph.facebook.com/${API_VERSION}/${flowId}/assets`,
            formData,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    ...formData.getHeaders()
                }
            }
        );
    } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message;
        console.error("Meta Flow Asset Upload Error:", errorMessage);
        throw new Error("Failed to upload Meta Flow assets");
    }
};

export const syncMetaFlow = async (req, res) => {
    try {
        const userId = req.user.id;
        const { waba_id, meta_flow_ids } = req.body;

        if (!waba_id) {
            return res.status(400).json({
                success: false,
                error: "waba_id is required",
            });
        }

        const idsToSync = Array.isArray(meta_flow_ids) ? meta_flow_ids : [];
        if (idsToSync.length === 0) {
            return res.status(400).json({
                success: false,
                error: "meta_flow_ids is required and must be a non-empty array of Meta flow IDs",
            });
        }

        const waba = await WhatsappWaba.findOne({
            _id: waba_id,
            user_id: userId,
            deleted_at: null,
        });

        if (!waba) {
            return res.status(404).json({
                success: false,
                error: "WhatsApp WABA not found",
            });
        }

        const API_VERSION = "v21.0";
        let allMetaFlows = [];

        try {
            const response = await axios.get(
                `https://graph.facebook.com/${API_VERSION}/${waba.whatsapp_business_account_id}/flows?fields=id,name,status,categories,validation_errors`,
                {
                    headers: {
                        Authorization: `Bearer ${waba.access_token}`
                    }
                }
            );
            allMetaFlows = response.data.data || [];
        } catch (metaError) {
            const errorMessage = metaError.response?.data?.error?.message || metaError.response?.data?.message || metaError.message;
            console.error("Meta API Fetch Error:", errorMessage);
            return res.status(502).json({
                success: false,
                error: errorMessage
            });
        }

        const idSet = new Set(idsToSync.map((id) => String(id).trim()).filter(Boolean));
        const metaFlowsToSync = allMetaFlows.filter((f) => idSet.has(String(f.id)));

        let syncedCount = 0;
        let updatedCount = 0;
        const errors = [];

        const validCategories = ["SIGN_UP", "SIGN_IN", "CONTACT_US", "CUSTOMER_SUPPORT", "SURVEY", "LEAD_GENERATION", "APPOINTMENT_BOOKING", "OTHER"];

        for (const metaFlow of metaFlowsToSync) {
            try {
                const formattedName = formatMetaFlowName(metaFlow.name);
                const payload = await getMetaFlowJson(metaFlow.id, waba.access_token);
                const extractedFields = payload ? transformMetaPayloadToFields(payload) : [];

                const existingForm = await Form.findOne({
                    user_id: userId,
                    "flow.flow_id": metaFlow.id
                });

                let dbStatus = "DRAFT";
                switch (metaFlow.status) {
                    case "PUBLISHED": dbStatus = "PUBLISHED"; break;
                    case "DEPRECATED": dbStatus = "DEPRECATED"; break;
                    case "BLOCKED": dbStatus = "BLOCKED"; break;
                    case "THROTTLED": dbStatus = "THROTTLED"; break;
                    default: dbStatus = "DRAFT";
                }

                if (metaFlow.validation_errors && metaFlow.validation_errors.length > 0) {
                    dbStatus = "ERROR";
                }

                if (existingForm) {
                    existingForm.name = formattedName;
                    existingForm.meta_status = dbStatus;
                    existingForm.fields = extractedFields.length > 0 ? extractedFields : existingForm.fields;
                    existingForm.flow.sync_status = "success";
                    existingForm.flow.template_name = metaFlow.name;
                    existingForm.flow.meta_payload = payload || existingForm.flow.meta_payload;
                    existingForm.flow.last_synced_at = new Date();

                    await existingForm.save();
                    updatedCount++;
                } else {
                    let category = "OTHER";
                    if (metaFlow.categories && metaFlow.categories.length > 0) {
                        const metaCat = metaFlow.categories[0].toUpperCase();
                        if (validCategories.includes(metaCat)) {
                            category = metaCat;
                        }
                    }

                    const baseSlug = (metaFlow.name || "flow").toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                    const newFormObj = {
                        user_id: userId,
                        waba_id: waba_id,
                        name: formattedName,
                        slug: `${baseSlug}-${metaFlow.id}`,
                        category: category,
                        is_active: dbStatus === "PUBLISHED",
                        meta_status: dbStatus,
                        fields: extractedFields,
                        flow: {
                            flow_id: metaFlow.id,
                            meta_status: dbStatus,
                            sync_status: "success",
                            template_name: metaFlow.name,
                            meta_payload: payload,
                            last_synced_at: new Date(),
                            is_flow_enabled: dbStatus === "PUBLISHED"
                        }
                    };

                    await Form.create(newFormObj);
                    syncedCount++;
                }
            } catch (err) {
                errors.push({
                    meta_flow_id: metaFlow.id,
                    flow_name: metaFlow.name,
                    error: err.message,
                });
            }
        }

        const notFoundIds = idsToSync.filter((id) => !metaFlowsToSync.some((f) => String(f.id) === String(id)));

        return res.json({
            success: true,
            message: "Sync completed",
            stats: {
                requested: idsToSync.length,
                found_on_meta: metaFlowsToSync.length,
                not_found_on_meta: notFoundIds,
                newly_synced: syncedCount,
                updated: updatedCount,
                errors: errors.length,
            },
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error) {
        console.error("Error syncing meta flows:", error);
        return res.status(500).json({
            success: false,
            error: error.message,
        });
    }
};

export const syncFlowsStatusFromMeta = async (req, res) => {
    try {
        const userId = req.user.id;
        const { waba_id } = req.body;

        if (!waba_id) {
            return res.status(400).json({ success: false, error: "waba_id is required" });
        }

        const waba = await WhatsappWaba.findOne({ _id: waba_id, user_id: userId, deleted_at: null });
        if (!waba) {
            return res.status(404).json({ success: false, error: "WhatsApp WABA not found" });
        }

        const API_VERSION = "v21.0";
        let allMetaFlows = [];
        try {
            const response = await axios.get(
                `https://graph.facebook.com/${API_VERSION}/${waba.whatsapp_business_account_id}/flows?fields=id,name,status,categories,validation_errors`,
                {
                    headers: { Authorization: `Bearer ${waba.access_token}` }
                }
            );
            allMetaFlows = response.data.data || [];
        } catch (metaError) {
            const errorMessage = metaError.response?.data?.error?.message || metaError.response?.data?.message || metaError.message;
            console.error("Meta API Fetch Error:", errorMessage);
            return res.status(502).json({
                success: false,
                error: errorMessage
            });
        }

        let updatedCount = 0;
        const errors = [];
        const validCategories = ["SIGN_UP", "SIGN_IN", "CONTACT_US", "CUSTOMER_SUPPORT", "SURVEY", "LEAD_GENERATION", "APPOINTMENT_BOOKING", "OTHER"];

        for (const metaF of allMetaFlows) {
            try {
                const formattedName = formatMetaFlowName(metaF.name);
                const payload = await getMetaFlowJson(metaF.id, waba.access_token);
                const extractedFields = payload ? transformMetaPayloadToFields(payload) : [];

                let dbStatus = "DRAFT";
                switch (metaF.status) {
                    case "PUBLISHED": dbStatus = "PUBLISHED"; break;
                    case "DEPRECATED": dbStatus = "DEPRECATED"; break;
                    case "BLOCKED": dbStatus = "BLOCKED"; break;
                    case "THROTTLED": dbStatus = "THROTTLED"; break;
                    default: dbStatus = "DRAFT";
                }
                if (metaF.validation_errors && metaF.validation_errors.length > 0) {
                    dbStatus = "ERROR";
                }

                const existingForm = await Form.findOne({
                    user_id: userId,
                    waba_id: waba_id,
                    "flow.flow_id": metaF.id
                });

                const flowUpdates = {
                    meta_status: dbStatus,
                    last_synced_at: new Date(),
                    sync_status: "success",
                    template_name: metaF.name,
                    meta_payload: payload,
                    is_flow_enabled: (dbStatus === "PUBLISHED")
                };


                if (existingForm) {
                    existingForm.name = formattedName;
                    existingForm.meta_status = dbStatus;
                    existingForm.fields = extractedFields.length > 0 ? extractedFields : existingForm.fields;
                    existingForm.flow = { ...existingForm.flow, ...flowUpdates };
                    await existingForm.save();
                    updatedCount++;
                }
            } catch (err) {
                errors.push({ flow_id: metaF.id, name: metaF.name, error: err.message });
            }
        }

        return res.json({
            success: true,
            message: "Full flow sync completed",
            stats: {
                total_from_meta: allMetaFlows.length,
                updated: updatedCount,
                errors: errors.length
            },
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (error) {
        console.error("Error syncing flows from meta:", error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

export const publishForm = async (req, res) => {
    try {
        const formId = req.params.id;
        const userId = req.user.id;

        const form = await Form.findOne({ _id: formId, user_id: userId, deleted_at: null });
        if (!form) return res.status(404).json({ error: "Form not found" });

        if (!form.flow || !form.flow.flow_id) {
            return res.status(400).json({ error: "No Meta Flow associated with this form yet." });
        }

        const waba = await WhatsappWaba.findOne({
            _id: form.waba_id,
            user_id: userId,
            deleted_at: null
        });

        if (!waba) return res.status(404).json({ error: "WhatsApp WABA not found" });

        const flowId = form.flow.flow_id;
        const accessToken = waba.access_token;
        const API_VERSION = "v21.0";
        try {
            const response = await axios.post(
                `https://graph.facebook.com/${API_VERSION}/${flowId}/publish`,
                {},
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    }
                }
            );

            const metaData = response.data;

            form.meta_status = "PUBLISHED";
            form.is_active = true;
            if (form.flow) {
                form.flow.is_flow_enabled = true;
                form.flow.last_synced_at = new Date();
                form.flow.sync_status = "success";
            }
            await form.save();

            return res.status(200).json({
                success: true,
                message: "Form published successfully",
                data: metaData
            });

        } catch (error) {
            const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message;
            return res.status(500).json({
                success: false,
                error: errorMessage
            });
        }
    } catch (error) {
        console.error("Error publishing form:", error);
        return res.status(500).json({ message: "Server Error", error: error.message });
    }
}

export const retriveMetaFlow = async (flow_id, accessToken) => {
    try {
        const API_VERSION = "v21.0";
        const response = await axios.get(
            `https://graph.facebook.com/${API_VERSION}/${flow_id}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
        return response.data;
    } catch (err) {
        const errorMessage = err?.response?.data?.error?.message || err?.response?.data?.message || err.message;
        console.error("Retrieve Meta Flow Error:", errorMessage);
        return null;
    }
};

export const deleteMetaFlow = async (flow_id, accessToken) => {
    try {
        const API_VERSION = "v21.0";
        const response = await axios.delete(
            `https://graph.facebook.com/${API_VERSION}/${flow_id}`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
        return response.data;
    } catch (err) {
        const errorMessage = err?.response?.data?.error?.message || err?.response?.data?.message || err.message;
        console.error("Delete Meta Flow Error:", errorMessage);
        return null;
    }
};

export const deprecateMetaFlow = async (flow_id, accessToken) => {
    try {
        const API_VERSION = "v21.0";
        const response = await axios.post(
            `https://graph.facebook.com/${API_VERSION}/${flow_id}/deprecate`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            }
        );
        return response.data;
    } catch (err) {
        const errorMessage = err?.response?.data?.error?.message || err?.response?.data?.message || err.message;
        console.error("Deprecate Meta Flow Error:", errorMessage);
        return null;
    }
};

export const getAllMetaFlows = async (req, res) => {
    try {
        const { waba_id } = req.params;
        const userId = req.user.id;

        const waba = await WhatsappWaba.findOne({
            _id: waba_id,
            user_id: userId,
            deleted_at: null
        });

        if (!waba) {
            return res.status(404).json({ success: false, error: "WhatsApp WABA not found" });
        }

        const API_VERSION = "v21.0";
        const response = await axios.get(
            `https://graph.facebook.com/${API_VERSION}/${waba.whatsapp_business_account_id}/flows`,
            {
                headers: {
                    Authorization: `Bearer ${waba.access_token}`
                }
            }
        );

        return res.status(200).json({
            success: true,
            data: response.data.data
        });

    } catch (error) {
        console.error("Get All Meta Flows Error:", error?.response?.data || error.message);
        return res.status(500).json({
            success: false,
            error: error?.response?.data?.error?.message || "Failed to retrieve Meta flows"
        });
    }
};

export const deleteForm = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const form = await Form.findOne({ _id: id, user_id: userId, deleted_at: null }).populate("waba_id");
        if (!form) {
            return res.status(404).json({ success: false, error: "Form not found" });
        }

        const metaStatus = (form.meta_status || "DRAFT").toUpperCase();
        const flowId = form.flow?.flow_id;
        const accessToken = form.waba_id?.access_token;

        if (flowId && accessToken) {
            try {
                if (metaStatus === "DRAFT") {
                    await deleteMetaFlow(flowId, accessToken);
                } else if (metaStatus === "PUBLISHED") {
                    await deprecateMetaFlow(flowId, accessToken);
                }
            } catch (metaErr) {
                console.error(`Meta Flow operation failed for form ${id}:`, metaErr.message);
            }
        }

        form.deleted_at = new Date();
        await form.save();

        return res.status(200).json({
            success: true,
            message: `Form deleted successfully. (Meta Status: ${metaStatus})`
        });

    } catch (error) {
        console.error("Error deleting form:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};


export const getFormById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const form = await Form.findOne({
            _id: id,
            user_id: userId,
            deleted_at: null,
        })
            .select("-__v")
            .lean();

        if (!form) {
            return res.status(404).json({
                success: false,
                error: "Form not found",
            });
        }

        return res.json({
            success: true,
            data: form,
        });
    } catch (error) {
        console.error("Error getting form:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to get form",
            details: error.message,
        });
    }
};

export const updateForm = async (req, res) => {
    try {
        const formId = req.params.id;
        const userId = req.user.id;
        const updateData = req.body;

        const form = await Form.findOne({ _id: formId, user_id: userId, deleted_at: null });
        if (!form) return res.status(404).json({ error: "Form not found" });

        const currentMetaStatus = form.meta_status || 'DRAFT';
        if (currentMetaStatus !== 'DRAFT') {
            return res.status(403).json({
                success: false,
                message: `Cannot update form. Meta flow is already '${currentMetaStatus}'.`
            });
        }

        if (updateData.name) form.name = updateData.name;
        if (updateData.slug || updateData.name) {
            form.slug = updateData.slug || form.name.toLowerCase().replace(/\s+/g, "-");
        }
        if (updateData.description !== undefined) form.description = updateData.description;
        if (updateData.category) form.category = updateData.category;
        if (updateData.submit_settings) form.submit_settings = { ...form.submit_settings, ...updateData.submit_settings };

        if (updateData.fields && Array.isArray(updateData.fields)) {
            form.fields = updateData.fields.map(f => ({
                id: f.id || uuidv4(),
                ...f
            }));
        }

        await form.save();

        if (form.waba_id && form.flow?.flow_id) {
            const waba = await WhatsappWaba.findOne({ _id: form.waba_id, user_id: userId, deleted_at: null });
            if (waba) {
                try {
                    const payload = buildMetaFlowPayload(form);
                    await uploadFlowAssets(form.flow.flow_id, waba.access_token, payload);

                    form.flow.meta_payload = payload;
                    form.flow.last_synced_at = new Date();
                    form.flow.sync_status = "success";
                    await form.save();
                } catch (metaError) {
                    console.error("Meta Flow sync failed during update:", metaError.message);
                    form.flow.sync_status = "failed";
                    await form.save();
                }
            }
        }

        res.status(200).json({ success: true, data: form });

    } catch (error) {
        console.error("Error updating form:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

export const getFormTemplate = async (req, res) => {
    try {
        const FORM_TEMPLATES = {
            "SIGN_UP": [
                { type: "heading", label: "Create Your Account", name: "signup_heading", meta: { text: "Create Your Account" }, step: 1, order: 1 },
                { type: "text", label: "Full Name", name: "full_name", required: true, helper_text: "Enter your first and last name", step: 1, order: 2 },
                { type: "email", label: "Email Address", name: "email", required: true, helper_text: "We'll send updates to this email", step: 1, order: 3 },
                { type: "phone", label: "Phone Number", name: "phone", required: true, step: 1, order: 4 },
                {
                    type: "checkbox",
                    label: "Terms & Conditions",
                    name: "terms",
                    required: true,
                    options: [{ label: "I agree to the Terms of Service & Privacy Policy", value: "agreed" }],
                    step: 1,
                    order: 5
                }
            ],
            "SIGN_IN": [
                { type: "heading", label: "Welcome Back", name: "signin_heading", meta: { text: "Welcome Back" }, step: 1, order: 1 },
                { type: "email", label: "Email Address", name: "email", required: true, step: 1, order: 2 }
            ],
            "CONTACT_US": [
                { type: "text", label: "Name", name: "name", required: true, step: 1, order: 1 },
                { type: "email", label: "Email", name: "email", required: true, step: 1, order: 2 },
                { type: "textarea", label: "Message", name: "message", required: true, step: 1, order: 3 }
            ],
            "CUSTOMER_SUPPORT": [
                { type: "text", label: "Name", name: "name", required: true, step: 1, order: 1 },
                { type: "email", label: "Email", name: "email", required: true, step: 1, order: 2 },
                { type: "textarea", label: "Issue Description", name: "issue_description", required: true, step: 1, order: 3 },
                {
                    type: "select",
                    label: "Priority",
                    name: "priority",
                    required: true,
                    options: [
                        { label: "Low", value: "low" },
                        { label: "Medium", value: "medium" },
                        { label: "High", value: "high" }
                    ],
                    step: 1,
                    order: 4
                }
            ],
            "SURVEY": [
                { type: "text", label: "Name", name: "name", required: false, step: 1, order: 1 },
                { type: "email", label: "Email", name: "email", required: false, step: 1, order: 2 },
                { type: "textarea", label: "Feedback", name: "feedback", required: true, step: 1, order: 3 },
                {
                    type: "radio",
                    label: "Rating",
                    name: "rating",
                    required: true,
                    options: [
                        { label: "1 - Poor", value: "1" },
                        { label: "2 - Fair", value: "2" },
                        { label: "3 - Good", value: "3" },
                        { label: "4 - Very Good", value: "4" },
                        { label: "5 - Excellent", value: "5" }
                    ],
                    step: 1,
                    order: 4
                }
            ],
            "LEAD_GENERATION": [
                { type: "text", label: "Name", name: "name", required: true, step: 1, order: 1 },
                { type: "text", label: "Company", name: "company", required: false, step: 1, order: 2 },
                { type: "email", label: "Email", name: "email", required: true, step: 1, order: 3 },
                { type: "phone", label: "Phone", name: "phone", required: true, step: 1, order: 4 },
                {
                    type: "select",
                    label: "Interest",
                    name: "interest",
                    required: true,
                    options: [
                        { label: "Product Demo", value: "demo" },
                        { label: "Pricing", value: "pricing" },
                        { label: "General Inquiry", value: "general" }
                    ],
                    step: 1,
                    order: 5
                }
            ],
            "APPOINTMENT_BOOKING": [
                { type: "text", label: "Name", name: "name", required: true, step: 1, order: 1 },
                { type: "email", label: "Email", name: "email", required: true, step: 1, order: 2 },
                { type: "date", label: "Date", name: "date", required: true, step: 1, order: 3 },
                {
                    type: "select",
                    label: "Service",
                    name: "service",
                    required: true,
                    options: [
                        { label: "Consultation", value: "consultation" },
                        { label: "Support", value: "support" },
                        { label: "Sales", value: "sales" }
                    ],
                    step: 1,
                    order: 4
                }
            ],
            "OTHER": []
        };

        const templates = {};
        for (const [category, fields] of Object.entries(FORM_TEMPLATES)) {
            templates[category] = fields.map(f => ({
                id: uuidv4(),
                ...f
            }));
        }

        res.status(200).json({
            success: true,
            templates
        });

    } catch (error) {
        console.error("Error fetching form templates:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

const formBuilderController = {
    getAllForms,
    createForm,
    syncMetaFlow,
    syncFlowsStatusFromMeta,
    publishForm,
    getFormById,
    updateForm,
    deleteForm,
    getAllMetaFlows,
    getFormTemplate
};

export default formBuilderController;
