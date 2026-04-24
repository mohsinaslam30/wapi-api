import { AutomationFlow, AutomationExecution } from '../models/index.js';
import automationEngine from '../utils/automation-engine.js';
import automationCache from '../utils/automation-cache.js';

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};


const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'sort_order';
const ALLOWED_SORT_FIELDS = ['name', 'nodes', 'is_active', 'created_at', 'updated_at'];

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
      { description: { $regex: sanitizedSearch, $options: 'i' } },
    ]
  };
};

export const getAutomationFlows = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchQuery = buildSearchQuery(req.query.search);

    const { is_active = '' } = req.query;

    if (searchQuery) {
      searchQuery.user_id = userId;
      searchQuery.deleted_at = null;
    }

    if (is_active !== '') {
      searchQuery.is_active = is_active === 'true';
    }


    const flows = await AutomationFlow.find(searchQuery)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user_id', 'name email');

    const total = await AutomationFlow.countDocuments(searchQuery);

    res.json({
      success: true,
      data: flows,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Error getting automation flows:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation flows',
      error: error.message
    });
  }
};


export const getAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      deleted_at: null
    }).populate('user_id', 'name email');

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found'
      });
    }

    res.json({
      success: true,
      data: flow
    });
  } catch (error) {
    console.error('Error getting automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation flow',
      error: error.message
    });
  }
};


export const createAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { name, description, nodes, connections, triggers, settings } = req.body;

    if (!name || !nodes || !Array.isArray(nodes)) {
      return res.status(400).json({
        success: false,
        message: 'Name and nodes are required'
      });
    }

    const flow = await AutomationFlow.create({
      name,
      description: description || '',
      user_id: userId,
      nodes: nodes || [],
      connections: connections || [],
      triggers: triggers || [],
      settings: settings || {}
    });

    automationCache.clearUserCache(userId);

    res.status(201).json({
      success: true,
      message: 'Automation flow created successfully',
      data: flow
    });
  } catch (error) {
    console.error('Error creating automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create automation flow',
      error: error.message
    });
  }
};


export const updateAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;
    const { name, description, nodes, connections, triggers, settings, is_active } = req.body;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      deleted_at: null
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found'
      });
    }

    if (name !== undefined) flow.name = name;
    if (description !== undefined) flow.description = description;
    if (nodes !== undefined) flow.nodes = nodes;
    if (connections !== undefined) flow.connections = connections;
    if (triggers !== undefined) flow.triggers = triggers;
    if (settings !== undefined) flow.settings = settings;
    if (is_active !== undefined) flow.is_active = is_active;

    await flow.save();

    automationCache.invalidateFlowCache(flowId, userId);

    res.json({
      success: true,
      message: 'Automation flow updated successfully',
      data: flow
    });
  } catch (error) {
    console.error('Error updating automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update automation flow',
      error: error.message
    });
  }
};


export const deleteAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      deleted_at: null
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found'
      });
    }

    flow.deleted_at = new Date();
    await flow.save();

    automationCache.invalidateFlowCache(flowId, userId);

    res.json({
      success: true,
      message: 'Automation flow deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete automation flow',
      error: error.message
    });
  }
};


export const toggleAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;
    const { is_active } = req.body;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      deleted_at: null
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found'
      });
    }

    flow.is_active = is_active;
    await flow.save();

    automationCache.invalidateFlowCache(flowId, userId);

    res.json({
      success: true,
      message: `Automation flow ${is_active ? 'activated' : 'deactivated'} successfully`,
      data: flow
    });
  } catch (error) {
    console.error('Error toggling automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle automation flow',
      error: error.message
    });
  }
};


export const testAutomationFlow = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;

    const { test_data } = req.body;
    test_data.userId = userId;

    const flow = await AutomationFlow.findOne({
      _id: flowId,
      user_id: userId,
      is_active: true,
      deleted_at: null
    });

    if (!flow) {
      return res.status(404).json({
        success: false,
        message: 'Automation flow not found or not active'
      });
    }

    const result = await automationEngine.executeFlow(flow, {
      ...test_data,
      event_type: 'test',
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Automation flow test completed',
      data: result
    });
  } catch (error) {
    console.error('Error testing automation flow:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test automation flow',
      error: error.message
    });
  }
};


export const getAutomationExecutions = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { flowId } = req.params;
    const { page = 1, limit = 10, status = '' } = req.query;

    const filter = { user_id: userId };
    if (flowId) {
      filter.flow_id = flowId;
    }
    if (status) {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    const executions = await AutomationExecution.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('flow_id', 'name description')
      .populate('user_id', 'name email');

    const total = await AutomationExecution.countDocuments(filter);

    res.json({
      success: true,
      data: executions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting automation executions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation executions',
      error: error.message
    });
  }
};


export const getAutomationExecution = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { executionId } = req.params;

    const execution = await AutomationExecution.findOne({
      _id: executionId,
      user_id: userId
    }).populate('flow_id', 'name description')
      .populate('user_id', 'name email');

    if (!execution) {
      return res.status(404).json({
        success: false,
        message: 'Automation execution not found'
      });
    }

    res.json({
      success: true,
      data: execution
    });
  } catch (error) {
    console.error('Error getting automation execution:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation execution',
      error: error.message
    });
  }
};


export const getAutomationStatistics = async (req, res) => {
  try {
    const userId = req.user.owner_id;

    const [totalFlows, activeFlows, totalExecutions, successfulExecutions] = await Promise.all([
      AutomationFlow.countDocuments({ user_id: userId, deleted_at: null }),
      AutomationFlow.countDocuments({ user_id: userId, is_active: true, deleted_at: null }),
      AutomationExecution.countDocuments({ user_id: userId }),
      AutomationExecution.countDocuments({ user_id: userId, status: 'success' })
    ]);

    const recentExecutions = await AutomationExecution.find({
      user_id: userId
    })
      .sort({ created_at: -1 })
      .limit(10)
      .select('flow_id status created_at execution_time');

    res.json({
      success: true,
      data: {
        total_flows: totalFlows,
        active_flows: activeFlows,
        total_executions: totalExecutions,
        successful_executions: successfulExecutions,
        success_rate: totalExecutions > 0 ? (successfulExecutions / totalExecutions * 100).toFixed(2) : 0,
        recent_executions: recentExecutions
      }
    });
  } catch (error) {
    console.error('Error getting automation statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get automation statistics',
      error: error.message
    });
  }
};


export const getAvailableNodeTypes = async (req, res) => {
  try {
    const nodeTypes = [
      {
        id: 'trigger',
        name: 'Trigger',
        description: 'Starts the automation workflow',
        category: 'input',
        icon: 'trigger',
        inputs: 0,
        outputs: 1,
        parameters: [
          {
            name: 'event_type',
            type: 'select',
            options: [
              { value: 'message_received', label: 'Message Received' },
              { value: 'message_sent', label: 'Message Sent' },
              { value: 'contact_joined', label: 'Contact Joined' },
              { value: 'status_update', label: 'Status Update' },
              { value: 'order_received', label: 'Order Received' },
              { value: 'webhook_received', label: 'Webhook Received' },
              { value: 'time_based', label: 'Time Based' },
              { value: 'custom_event', label: 'Custom Event' }
            ]
          }
        ]
      },
      {
        id: 'wait_for_reply',
        name: 'Wait for Reply',
        description: 'Pause the flow and wait for the user to reply',
        category: 'logic',
        icon: 'wait',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'variable_name', type: 'text', label: 'Store reply in variable (default: last_user_message)', default: 'last_user_message' },
          { name: 'timeout_hours', type: 'number', label: 'Timeout after (hours)', default: 24 }
        ]
      },
      {
        id: 'condition',
        name: 'Condition',
        description: 'Branch the workflow based on conditions',
        category: 'logic',
        icon: 'condition',
        inputs: 1,
        outputs: 10,
        parameters: [
          {
            name: 'conditions',
            type: 'array',
            label: 'Conditions',
            item_fields: [
              { name: 'id', type: 'text', label: 'Condition ID (optional)' },
              { name: 'field', type: 'text', label: 'Field (e.g. message.messageContext.text.body)' },
              {
                name: 'operator',
                type: 'select',
                label: 'Operator',
                options: [
                  { value: 'equals', label: 'Equals' },
                  { value: 'not_equals', label: 'Not Equals' },
                  { value: 'contains', label: 'Contains' },
                  { value: 'not_contains', label: 'Not Contains' },
                  { value: 'starts_with', label: 'Starts With' },
                  { value: 'ends_with', label: 'Ends With' },
                  { value: 'greater_than', label: 'Greater Than' },
                  { value: 'less_than', label: 'Less Than' },
                  { value: 'greater_than_or_equal', label: 'Greater Than Or Equal' },
                  { value: 'less_than_or_equal', label: 'Less Than Or Equal' },
                  { value: 'is_empty', label: 'Is Empty' },
                  { value: 'is_not_empty', label: 'Is Not Empty' },
                  { value: 'contains_any', label: 'Contains Any (list)' }
                ]
              },
              { name: 'value', type: 'text', label: 'Value' },
              { name: 'sourceHandle', type: 'text', label: 'Branch Handle (maps to connection handle)' }
            ]
          },
          {
            name: 'no_match_handle',
            type: 'text',
            label: 'No-match Branch Handle (optional)'
          }
        ]
      },
      {
        id: 'action',
        name: 'Action',
        description: 'Perform an action in the workflow',
        category: 'action',
        icon: 'action',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'action_type',
            type: 'select',
            options: [
              { value: 'log', label: 'Log Message' },
              { value: 'set_variable', label: 'Set Variable' },
              { value: 'wait', label: 'Wait/Delay' }
            ]
          }
        ]
      },
      {
        id: 'send_message',
        name: 'Send Message',
        description: 'Send a WhatsApp message',
        category: 'action',
        icon: 'message',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'recipient', type: 'text', label: 'Recipient Number' },
          { name: 'message_template', type: 'textarea', label: 'Message Template' },
          { name: 'media_url', type: 'text', label: 'Media URL (Optional)' }
        ]
      },
      {
        id: 'send_template',
        name: 'Send Template',
        description: 'Send an approved WhatsApp template message with variables, media, carousel, coupon, or catalog',
        category: 'action',
        icon: 'template',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'recipient',
            type: 'text',
            label: 'Recipient Number (supports {{variable}})',
            required: true,
            placeholder: '{{senderNumber}}'
          },
          {
            name: 'template_id',
            type: 'text',
            label: 'Template ID (MongoDB _id) — use this OR template_name',
            placeholder: '664abc123...'
          },
          {
            name: 'template_name',
            type: 'text',
            label: 'Template Name (lowercase) — used if template_id is not set',
            placeholder: 'order_confirmation'
          },
          {
            name: 'language_code',
            type: 'text',
            label: 'Language Code (default: from template)',
            placeholder: 'en_US'
          },
          {
            name: 'body_variables',
            type: 'object',
            label: 'Body Variables — key = positional index (1,2,3) or named param, value supports {{variable}}',
            placeholder: '{ "1": "{{contact_name}}", "2": "ORDER-001" }'
          },
          {
            name: 'header_media_url',
            type: 'text',
            label: 'Header Media URL (image / video / document) — overrides template default',
            placeholder: 'https://example.com/banner.jpg'
          },
          {
            name: 'coupon_code',
            type: 'text',
            label: 'Coupon Code — for templates with copy_code button (supports {{variable}})',
            placeholder: 'SAVE20'
          },
          {
            name: 'offer_expiration_minutes',
            type: 'number',
            label: 'Limited-Time Offer expiry (minutes from now) — for LTO templates',
            placeholder: '60'
          },
          {
            name: 'url_button_value',
            type: 'text',
            label: 'Dynamic URL Value — appended to buttons with {{1}} in URL',
            placeholder: 'promo2025'
          },
          {
            name: 'product_retailer_id',
            type: 'text',
            label: 'Product Retailer ID — for catalog button templates',
            placeholder: 'SKU-001'
          },
          {
            name: 'carousel_cards_data',
            type: 'array',
            label: 'Carousel Cards Data — for carousel_media templates',
            item_fields: [
              {
                name: 'header',
                type: 'object',
                label: 'Card header — { type: "image"|"video", link: "URL" or id: "media_id" }'
              },
              {
                name: 'buttons',
                type: 'array',
                label: 'Card buttons — [{ type: "quick_reply", payload: "..." } | { type: "url", url_value: "..." }]'
              }
            ]
          },
          {
            name: 'carousel_products',
            type: 'array',
            label: 'Carousel Products — for carousel_product templates',
            item_fields: [
              { name: 'product_retailer_id', type: 'text', label: 'Product Retailer ID' },
              { name: 'catalog_id', type: 'text', label: 'Catalog ID' }
            ]
          },
          {
            name: 'provider_type',
            type: 'select',
            label: 'Provider (default: business_api)',
            options: [
              { value: 'business_api', label: 'Business API (Meta)' },
              { value: 'baileys', label: 'Baileys (QR)' }
            ]
          }
        ]
      },
      {
        id: 'add_tag',
        name: 'Add Tag',
        description: 'Assign a tag to the contact',
        category: 'action',
        icon: 'tag',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'tag_id',
            type: 'text',
            label: 'Tag ID (MongoDB _id) — if not provided, use tag_name',
            placeholder: '664abc123...'
          },
          {
            name: 'tag_name',
            type: 'text',
            label: 'Tag Name — used if tag_id is empty, will create if not exists',
            placeholder: 'Premium Customer'
          }
        ]
      },
      {
        id: 'cta_button',
        name: 'CTA Button',
        description: 'Send a message with a single URL call-to-action button',
        category: 'action',
        icon: 'link',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'recipient',
            type: 'text',
            label: 'Recipient Number (supports {{variable}})',
            placeholder: '{{senderNumber}}',
            default: '{{senderNumber}}'
          },
          {
            name: 'text',
            type: 'textarea',
            label: 'Message Text (supports {{variable}})',
            placeholder: 'Check out our new dashboard!'
          },
          {
            name: 'button_text',
            type: 'text',
            label: 'Button Label',
            placeholder: 'Visit Dashboard'
          },
          {
            name: 'url',
            type: 'text',
            label: 'URL (supports {{variable}})',
            placeholder: 'https://example.com/user/{{userId}}'
          }
        ]
      },
      {
        id: 'assign_chatbot',
        name: 'Assign Chatbot',
        description: 'Automatically answer all messages from this contact using a specific AI chatbot for a set duration',
        category: 'action',
        icon: 'robot',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'chatbot_id',
            type: 'text',
            label: 'Chatbot ID (MongoDB _id)',
            required: true,
            placeholder: '664abc123...'
          },
          {
            name: 'duration_hours',
            type: 'number',
            label: 'Duration (hours) — set to 0 for unlimited',
            placeholder: '1',
            default: 1
          }
        ]
      },
      {
        id: 'response_saver',
        name: 'Response Saver',
        description: 'Save message parts into contact custom fields and variables',
        category: 'action',
        icon: 'save',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'mappings',
            type: 'array',
            label: 'Variable Mappings',
            item_fields: [
              {
                name: 'source_path',
                type: 'text',
                label: 'Source path (e.g. message.messageContext.text.body)'
              },
              {
                name: 'variable_name',
                type: 'text',
                label: 'Runtime variable name (e.g. message_received)'
              },
              {
                name: 'custom_field_key',
                type: 'text',
                label: 'Contact custom field key (e.g. message_received)'
              }
            ]
          }
        ]
      },
      {
        id: 'save_to_google_sheet',
        name: 'Save to Google Sheet',
        description: 'Append contact information to a Google Spreadsheet',
        category: 'action',
        icon: 'spreadsheet',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'google_account_id',
            type: 'text',
            label: 'Google Account ID (MongoDB _id)',
            required: true,
            placeholder: '664abc123...'
          },
          {
            name: 'spreadsheet_id',
            type: 'text',
            label: 'Spreadsheet ID (from URL)',
            required: true,
            placeholder: '1aBcD-EfgHiJkLmNoP...'
          },
          {
            name: 'sheet_name',
            type: 'text',
            label: 'Sheet Name (e.g. Sheet1)',
            default: 'Sheet1'
          },
          {
            name: 'column_mappings',
            type: 'array',
            label: 'Column Mappings (Column -> Value)',
            item_fields: [
              { name: 'column', type: 'text', label: 'Column Name (e.g. Name, Phone)' },
              { name: 'value', type: 'text', label: 'Value (supports {{variable}})', placeholder: '{{contact.name}}' }
            ]
          }
        ]
      },
      {
        id: 'create_calendar_event',
        name: 'Create Calendar Event',
        description: 'Create a new event in Google Calendar',
        category: 'action',
        icon: 'calendar',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'google_account_id',
            type: 'text',
            label: 'Google Account ID (MongoDB _id)',
            required: true,
            placeholder: '664abc123...'
          },
          {
            name: 'calendar_id',
            type: 'text',
            label: 'Calendar ID (e.g. primary or email)',
            required: true,
            default: 'primary'
          },
          {
            name: 'summary',
            type: 'text',
            label: 'Event Title',
            placeholder: 'Meeting with {{contact.name}}'
          },
          {
            name: 'description',
            type: 'textarea',
            label: 'Description',
            placeholder: 'Scheduled via WhatsApp'
          },
          {
            name: 'start_time',
            type: 'text',
            label: 'Start Time (ISO format)',
            placeholder: '2026-04-10T15:00:00Z'
          },
          {
            name: 'end_time',
            type: 'text',
            label: 'End Time (ISO format)',
            placeholder: '2026-04-10T16:00:00Z'
          }
        ]
      },
      {
        id: 'appointment_flow',
        name: 'Appointment Flow',
        description: 'Start an automated appointment booking using WhatsApp Flows',
        category: 'action',
        icon: 'calendar_check',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'appointment_config_id',
            type: 'text',
            label: 'Appointment Config ID (MongoDB _id)',
            required: true
          },
          {
            name: 'intro_message',
            type: 'textarea',
            label: 'Intro Message (Conversational)',
            default: 'Hello! I need to ask a few questions before we book your appointment.'
          },
          {
            name: 'flow_id',
            type: 'text',
            label: 'WhatsApp Flow ID (from Meta Console)',
            required: true
          },
          {
            name: 'flow_cta',
            type: 'text',
            label: 'Button Label',
            default: 'Select Date & Time'
          },
          {
            name: 'success_template_id',
            type: 'text',
            label: 'Booking Success Template ID'
          },
          {
            name: 'cancel_template_id',
            type: 'text',
            label: 'Booking Cancel Template ID'
          },
          {
            name: 'reschedule_template_id',
            type: 'text',
            label: 'Reschedule Template ID'
          },
          {
            name: 'reminder_template_id',
            type: 'text',
            label: 'Reminder Template ID'
          },
          {
            name: 'reminder_hours',
            type: 'number',
            label: 'Send Reminder (Hours before)',
            default: 24
          },
          {
            name: 'appointment_fees',
            type: 'number',
            label: 'Base Appointment Fee',
            default: 0
          },
          {
            name: 'tax_percentage',
            type: 'number',
            label: 'Tax Percentage (%)',
            default: 0
          },
          {
            name: 'pre_paid_fees',
            type: 'number',
            label: 'Pre-paid Amount Required',
            default: 0
          }
        ]
      },
      {
        id: 'api',
        name: 'API',
        description: 'Call an external API and map response to variables/custom fields',
        category: 'action',
        icon: 'api',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'url', type: 'text', label: 'API URL' },
          {
            name: 'method',
            type: 'select',
            label: 'Method',
            options: [
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'DELETE', label: 'DELETE' }
            ]
          },
          { name: 'headers', type: 'object', label: 'Headers' },
          { name: 'body', type: 'object', label: 'Request Body (for non-GET)' },
          {
            name: 'response_mapping',
            type: 'array',
            label: 'Response Mappings',
            item_fields: [
              {
                name: 'response_path',
                type: 'text',
                label: 'Response JSON path (e.g. data.value)'
              },
              {
                name: 'variable_name',
                type: 'text',
                label: 'Runtime variable name'
              },
              {
                name: 'custom_field_key',
                type: 'text',
                label: 'Contact custom field key'
              }
            ]
          }
        ]
      },
      {
        id: 'webhook',
        name: 'Webhook',
        description: 'Call an external API',
        category: 'action',
        icon: 'webhook',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'url', type: 'text', label: 'Webhook URL' },
          {
            name: 'method', type: 'select', options: [
              { value: 'GET', label: 'GET' },
              { value: 'POST', label: 'POST' },
              { value: 'PUT', label: 'PUT' },
              { value: 'DELETE', label: 'DELETE' }
            ]
          },
          { name: 'headers', type: 'object', label: 'Headers' },
          { name: 'body', type: 'object', label: 'Request Body' }
        ]
      },
      {
        id: 'ai_response',
        name: 'AI Response',
        description: 'Generate response using AI',
        category: 'ai',
        icon: 'ai',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'ai_model', type: 'text', label: 'AI Model' },
          { name: 'prompt_template', type: 'textarea', label: 'Prompt Template' },
          { name: 'api_key', type: 'text', label: 'API Key' }
        ]
      },
      {
        id: 'delay',
        name: 'Delay',
        description: 'Wait for a specified time',
        category: 'utility',
        icon: 'delay',
        inputs: 1,
        outputs: 1,
        parameters: [
          { name: 'delay_ms', type: 'number', label: 'Delay (milliseconds)', default: 1000 }
        ]
      },
      {
        id: 'filter',
        name: 'Filter',
        description: 'Filter data based on conditions',
        category: 'logic',
        icon: 'filter',
        inputs: 1,
        outputs: 1,
        parameters: [
          {
            name: 'filter_condition',
            type: 'object',
            fields: [
              { name: 'field', type: 'text', label: 'Field' },
              {
                name: 'operator',
                type: 'select',
                label: 'Operator',
                options: [
                  { value: 'equals', label: 'Equals' },
                  { value: 'not_equals', label: 'Not Equals' },
                  { value: 'contains', label: 'Contains' },
                  { value: 'not_contains', label: 'Not Contains' },
                  { value: 'starts_with', label: 'Starts With' },
                  { value: 'ends_with', label: 'Ends With' },
                  { value: 'greater_than', label: 'Greater Than' },
                  { value: 'less_than', label: 'Less Than' },
                  { value: 'is_empty', label: 'Is Empty' },
                  { value: 'is_not_empty', label: 'Is Not Empty' }
                ]
              },
              { name: 'value', type: 'text', label: 'Value' }
            ]
          }
        ]
      }
    ];

    res.json({
      success: true,
      data: nodeTypes
    });
  } catch (error) {
    console.error('Error getting node types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get node types',
      error: error.message
    });
  }
};


export const preloadUserFlows = async (userId) => {
  return await automationCache.preloadUserFlows(userId);
};

export default {
  getAutomationFlows,
  getAutomationFlow,
  createAutomationFlow,
  updateAutomationFlow,
  deleteAutomationFlow,
  toggleAutomationFlow,
  testAutomationFlow,
  getAutomationExecutions,
  getAutomationExecution,
  getAutomationStatistics,
  getAvailableNodeTypes,
  preloadUserFlows
};
