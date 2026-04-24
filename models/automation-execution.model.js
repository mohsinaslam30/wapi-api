import mongoose from 'mongoose';

const automationExecutionSchema = new mongoose.Schema({
  flow_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AutomationFlow',
    required: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'waiting', 'success', 'failed', 'cancelled'],
    default: 'pending'
  },
  next_node_id: {
    type: String
  },
  waiting_for_node_id: {
    type: String
  },
  contact_identifier: {
    type: String
  },
  input_data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  output_data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  execution_log: {
    type: [
      {
        node_id: String,
        node_type: String,
        status: { type: String, enum: ['pending', 'running', 'success', 'failed'] },
        start_time: Date,
        end_time: Date,
        input: mongoose.Schema.Types.Mixed,
        output: mongoose.Schema.Types.Mixed,
        error: mongoose.Schema.Types.Mixed
      }
    ],
    default: []
  },
  started_at: {
    type: Date,
    default: Date.now
  },
  completed_at: {
    type: Date
  },
  execution_time: {
    type: Number
  },
  error: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'automation_executions'
});

automationExecutionSchema.index({ flow_id: 1, created_at: -1 });
automationExecutionSchema.index({ user_id: 1, created_at: -1 });
automationExecutionSchema.index({ status: 1 });
automationExecutionSchema.index({ created_at: -1 });

automationExecutionSchema.index({ flow_id: 1, status: 1 });
automationExecutionSchema.index({ user_id: 1, status: 1 });
automationExecutionSchema.index({ user_id: 1, flow_id: 1 });
automationExecutionSchema.index({ started_at: -1 });
automationExecutionSchema.index({ completed_at: -1 });
automationExecutionSchema.index({ user_id: 1, started_at: -1 });
automationExecutionSchema.index({ flow_id: 1, started_at: -1 });
automationExecutionSchema.index({ status: 1, created_at: -1 });

export default mongoose.model('AutomationExecution', automationExecutionSchema);
