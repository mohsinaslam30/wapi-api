import mongoose from 'mongoose';

const customFieldSchema = new mongoose.Schema({

  name: {
    type: String,
    required: true,
    trim: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['text', 'number', 'date', 'boolean', 'select', 'textarea', 'email', 'phone'],
    required: true
  },
  options: [{
    type: String,
    trim: true
  }],
  required: {
    type: Boolean,
    default: false
  },
  min_length: {
    type: Number,
    default: null
  },
  max_length: {
    type: Number,
    default: null
  },
  min_value: {
    type: Number,
    default: null
  },
  max_value: {
    type: Number,
    default: null
  },
  placeholder: {
    type: String,
    trim: true,
    default: null
  },
  description: {
    type: String,
    trim: true,
    default: null
  },
  is_active: {
    type: Boolean,
    default: true
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
  collection: 'custom_fields'
});

customFieldSchema.index({ created_by: 1 });
customFieldSchema.index({ name: 1, created_by: 1 }, { unique: true });
customFieldSchema.index({ deleted_at: 1 });

customFieldSchema.methods.softDelete = function() {
  this.deleted_at = new Date();
  return this.save();
};

customFieldSchema.query.active = function() {
  return this.where({ deleted_at: null });
};

customFieldSchema.query.forUser = function(userId) {
  return this.where({ created_by: userId, deleted_at: null });
};

customFieldSchema.statics.forUser = function(userId) {
  return this.find({ created_by: userId, deleted_at: null });
};

export default mongoose.model('CustomField', customFieldSchema);
