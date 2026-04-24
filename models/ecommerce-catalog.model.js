import mongoose from 'mongoose';

const ecommerceCatalogSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  waba_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsappWaba',
    required: true
  },

  catalog_id: {
    type: String,
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true
  },

  currency: {
    type: String,
    default: 'USD'
  },

  country: {
    type: String,
    default: 'US'
  },

  is_linked: {
    type: Boolean,
    default: false
  },

  is_active: {
    type: Boolean,
    default: true
  },

  meta_data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'ecommerce_catalogs'
});

// ecommerceCatalogSchema.index({ user_id: 1 });
ecommerceCatalogSchema.index({ waba_id: 1 });
// ecommerceCatalogSchema.index({ catalog_id: 1 });

export default mongoose.model('EcommerceCatalog', ecommerceCatalogSchema);
