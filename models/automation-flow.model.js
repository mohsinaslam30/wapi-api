import mongoose from 'mongoose';

const automationFlowSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  is_public: {
    type: Boolean,
    default: false
  },
  nodes: {
    type: [
      {
        id: { type: String, required: true },
        type: {
          type: String,
          required: true,
          enum: [
            'trigger',
            'condition',
            'action',
            'delay',
            'filter',
            'transform',
            'webhook',
            'ai_response',
            'send_message',
            'send_template',
            'add_tag',
            'cta_button',
            'assign_chatbot',
            'update_contact',
            'response_saver',
            'save_to_google_sheet',
            'create_calendar_event',
            'appointment_flow',
            'api',
            'wait_for_reply',
            'custom'
          ]
        },
        position: {
          x: { type: Number, default: 0 },
          y: { type: Number, default: 0 }
        },
        parameters: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        },
        name: { type: String, default: '' },
        description: { type: String, default: '' }
      }
    ],
    default: []
  },
  connections: {
    type: [
      {
        id: { type: String, required: true },
        source: { type: String, required: true },
        target: { type: String, required: true },
        sourceHandle: { type: String, required: true },
        targetHandle: { type: String, required: true }
      }
    ],
    default: []
  },
  triggers: {
    type: [
      {
        event_type: {
          type: String,
          required: true,
          enum: [
            'message_received', 'message_sent', 'contact_joined',
            'contact_left', 'status_update', 'webhook_received',
            'time_based', 'custom_event', 'order_received'
          ]
        },
        conditions: {
          type: mongoose.Schema.Types.Mixed,
          default: {}
        }
      }
    ],
    default: []
  },
  settings: {
    execution_timeout: { type: Number, default: 50000 },
    max_executions: { type: Number, default: 1000 },
    error_handling: { type: String, default: 'stop' }, 
    retry_attempts: { type: Number, default: 3 }
  },
  statistics: {
    total_executions: { type: Number, default: 0 },
    successful_executions: { type: Number, default: 0 },
    failed_executions: { type: Number, default: 0 },
    last_execution: { type: Date },
    average_execution_time: { type: Number, default: 0 }
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'automation_flows'
});

automationFlowSchema.index({ user_id: 1, is_active: 1 });
automationFlowSchema.index({ is_active: 1 });
automationFlowSchema.index({ created_at: -1 });

automationFlowSchema.index({ user_id: 1, deleted_at: 1 });
automationFlowSchema.index({ user_id: 1, name: 1 });
automationFlowSchema.index({ user_id: 1, created_at: -1 });
automationFlowSchema.index({ triggers: 1 });
automationFlowSchema.index({ 'triggers.event_type': 1 });
automationFlowSchema.index({ deleted_at: 1 });

export default mongoose.model('AutomationFlow', automationFlowSchema);
