import mongoose from 'mongoose';

const ecommerceProductSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  catalog_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EcommerceCatalog',
    required: true
  },

  product_external_id: {
    type: String,
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true
  },

  description: {
    type: String,
    default: ''
  },
  price: {
    type: String,
    required: true
  },
  sale_price: {
    type: String,
    required: true
  },
  currency: {
    type: String,
    default: 'USD'
  },

  availability: {
    type: String,
    enum: ['in stock', 'out of stock', 'preorder'],
    default: 'in stock'
  },

  condition: {
    type: String,
    default: 'new'
  },

  image_urls: [{
    type: String
  }],

  url: {
    type: String
  },

  category: {
    type: String
  },
  fb_product_category: {
    type: String
  },
  brand: {
    type: String
  },

  retailer_id: {
    type: String,
    required: true
  },

  additional_variant_attributes: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  is_active: {
    type: Boolean,
    default: true
  },
  is_variant: {
    type: Boolean,
    default: false
  },
  retailer_product_group_id: {
    type: String,
    default: null
  },
  parent_product_external_id: {
    type: String,
    default: null
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
  collection: 'ecommerce_products'
});


// ecommerceProductSchema.index({ user_id: 1 });
// ecommerceProductSchema.index({ catalog_id: 1 });
// ecommerceProductSchema.index({ product_external_id: 1 });
ecommerceProductSchema.index({ retailer_id: 1 });

export default mongoose.model('EcommerceProduct', ecommerceProductSchema);
