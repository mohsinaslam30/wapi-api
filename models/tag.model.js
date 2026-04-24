import mongoose from 'mongoose';

const tagSchema = new mongoose.Schema({

  label: {
    type: String,
    required: true,
    trim: true
  },
  color: {
    type: String,
    default: '#007bff',
    trim: true
  },

  usage_count: {
    type: Number,
    default: 0
  },

  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'tags'
});

tagSchema.index({ created_by: 1 });
tagSchema.index({ label: 1, created_by: 1 }, { unique: true });
tagSchema.index({ deleted_at: 1 });

tagSchema.methods.softDelete = function() {
  this.deleted_at = new Date();
  return this.save();
};

tagSchema.methods.incrementUsage = function() {
  this.usage_count += 1;
  return this.save();
};

tagSchema.methods.decrementUsage = function() {
  if (this.usage_count > 0) {
    this.usage_count -= 1;
  }
  return this.save();
};

tagSchema.query.active = function() {
  return this.where({ deleted_at: null });
};

tagSchema.query.forUser = function(userId) {
  return this.where({ created_by: userId, deleted_at: null });
};

tagSchema.statics.forUser = function(userId) {
  return this.find({ created_by: userId, deleted_at: null });
};

export default mongoose.model('Tag', tagSchema);
