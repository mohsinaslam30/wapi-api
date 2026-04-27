import mongoose from 'mongoose';

const KanbanFunnelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  funnelType: {
    type: String,
    enum: [
      'contact',
      'form_submission',
      'agent',
      'ecommerce_product'
    ],
    required: true,
    index: true
  },

  stages: [{
    _id: { type: mongoose.Schema.Types.ObjectId, default: () => new mongoose.Types.ObjectId() },
    name: { type: String, required: true },
    color: { type: String, default: '#cbd5e0' },
    order: { type: Number, required: true }
  }],

  deletedAt: { type: Date, default: null },
  sort_order: {
    type: Number,
    default: 0
  }

}, { timestamps: true });


KanbanFunnelSchema.index({ userId: 1, funnelType: 1 });

export default mongoose.model('KanbanFunnel', KanbanFunnelSchema);
