import mongoose from 'mongoose';

const KanbanItemSchema = new mongoose.Schema({
  funnelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'KanbanFunnel',
    required: true,
    index: true
  },

  globalItemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  stageId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  position: { type: Number, default: 0 },

  data: { type: Map, of: mongoose.Schema.Types.Mixed },

  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  isArchived: { type: Boolean, default: false },

  history: [{
    action: {
      type: String,
      enum: ['created', 'moved', 'updated', 'archived', 'restored'],
      required: true
    },
    fromStageId: { type: mongoose.Schema.Types.ObjectId },
    toStageId: { type: mongoose.Schema.Types.ObjectId },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    details: { type: String },
    timestamp: { type: Date, default: Date.now }
  }],

  movedAt: { type: Date, default: Date.now }
}, { timestamps: true });

KanbanItemSchema.index({ funnelId: 1, globalItemId: 1 });

export default mongoose.model('KanbanItem', KanbanItemSchema);
