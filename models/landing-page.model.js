import mongoose from 'mongoose';

const floatingImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  position: { type: String, required: true }
});

const primaryButtonSchema = new mongoose.Schema({
  text: { type: String, required: true },
  link: { type: String, required: true }
});

const featureSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  icon: { type: String },
  image: { type: String }
});

const platformItemSchema = new mongoose.Schema({
  step: { type: Number, required: true },
  tagline: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  bullets: [{ type: String }],
  image: { type: String }
});

const pricingPlanSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  name: { type: String },
  price: { type: Number },
  features: [{ type: String }]
}, { _id: false });

const testimonialSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Testimonial' },
  name: { type: String },
  company: { type: String },
  content: { type: String },
  rating: { type: Number }
}, { _id: false });

const faqSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Faq' },
  question: { type: String },
  answer: { type: String }
}, { _id: false });

const socialLinksSchema = new mongoose.Schema({
  twitter: { type: String },
  linkedin: { type: String },
  facebook: { type: String },
  instagram: { type: String }
});

const ctaButtonSchema = new mongoose.Schema({
  text: { type: String, required: true },
  link: { type: String, required: true }
});

const heroSectionSchema = new mongoose.Schema({
  badge: { type: String },
  title: { type: String },
  description: { type: String },
  primary_button: primaryButtonSchema,
  hero_image: { type: String },
  floating_images: [floatingImageSchema]
});

const featuresSectionSchema = new mongoose.Schema({
  badge: { type: String },
  title: { type: String },
  description: { type: String },
  cta_button: primaryButtonSchema,
  features: [featureSchema]
});

const platformSectionSchema = new mongoose.Schema({
  badge: { type: String },
  title: { type: String },
  items: [platformItemSchema]
});

const pricingSectionSchema = new mongoose.Schema({
  title: { type: String },
  badge: { type: String },
  description: { type: String },
  subscribed_count: { type: String },
  subscribed_user: { type: String },
  plans: [pricingPlanSchema]
});

const testimonialsSectionSchema = new mongoose.Schema({
  title: { type: String },
  badge: { type: String },
  testimonials: [testimonialSchema]
});

const faqSectionSchema = new mongoose.Schema({
  title: { type: String },
  faqs: [faqSchema],
  description: {type: String},
  badge: { type: String }
});

const contactSectionSchema = new mongoose.Schema({
  title: { type: String },
  subtitle: { type: String },
  form_enabled: { type: Boolean, default: true },
  phone_no: { type: String },
  description: {type: String},
  email: { type: String }
});

const footerSectionSchema = new mongoose.Schema({
  cta_title: { type: String },
  cta_description: { type: String },
  cta_buttons: [ctaButtonSchema],
  social_links: [socialLinksSchema],
  copy_rights_text: { type: String }
});

const landingPageSchema = new mongoose.Schema({
  hero_section: heroSectionSchema,
  features_section: featuresSectionSchema,
  platform_section: platformSectionSchema,
  pricing_section: pricingSectionSchema,
  testimonials_section: testimonialsSectionSchema,
  faq_section: faqSectionSchema,
  contact_section: contactSectionSchema,
  footer_section: footerSectionSchema
}, {
  timestamps: true
});

export default mongoose.model('LandingPage', landingPageSchema);
