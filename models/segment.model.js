import mongoose from 'mongoose';

const segmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: null
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  member_count: {
    type: Number,
    default: 0
  },
  deleted_at: {
    type: Date,
    default: null
  },
  sort_order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'segments'
});

segmentSchema.index({ user_id: 1 });
segmentSchema.index({ deleted_at: 1 });

segmentSchema.methods.softDelete = function () {
  this.deleted_at = new Date();
  return this.save();
};

segmentSchema.methods.restore = function () {
  this.deleted_at = null;
  return this.save();
};

segmentSchema.virtual('is_deleted').get(function () {
  return this.deleted_at !== null;
});

segmentSchema.query.active = function () {
  return this.where({ deleted_at: null });
};

segmentSchema.query.forUser = function (userId) {
  return this.where({ user_id: userId, deleted_at: null });
};

export default mongoose.model('Segment', segmentSchema);
