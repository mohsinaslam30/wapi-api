import mongoose from 'mongoose';

const chatTagSchema = new mongoose.Schema({
  contact_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  tag_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag',
    required: true
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'contact_tags'
});

chatTagSchema.index({ contact_id: 1, tag_id: 1 }, { unique: true });
chatTagSchema.index({ contact_id: 1 });
chatTagSchema.index({ tag_id: 1 });
chatTagSchema.index({ deleted_at: 1 });

chatTagSchema.query.active = function() {
  return this.where({ deleted_at: null });
};

export default mongoose.model('ContactTag', chatTagSchema);
