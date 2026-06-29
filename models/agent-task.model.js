import mongoose from 'mongoose';

const agentTaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['pending' , 'in_progress' , 'on_hold' , 'completed' , 'cancelled'],
    default: 'pending'
  },
  agent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  agent_comments: [
    {
      comment: {
        type: String,
        required: true
      },
      commented_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      commented_by_role: {
        type: String,
        enum: ['super_admin', 'user', 'agent'],
        required: true
      },
      created_at: {
        type: Date,
        default: Date.now
      },
      updated_at: {
        type: Date,
        default: Date.now
      }
    }
  ],
  task_priority: {
    type: String,
    default: null
  },
  due_date: {
    type: Date,
    default: null
  },
  assigned_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  started_at: {
    type: Date,
    default: null
  },
  completed_at: {
    type: Date,
    default: null
  },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'agent_tasks'
});

export default mongoose.model('AgentTask', agentTaskSchema);
