import mongoose from "mongoose";

const VariableSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    example: { type: String, required: true }
  },
  { _id: false }
);

const HeaderSchema = new mongoose.Schema(
  {
    format: {
      type: String,
      enum: ["none", "text", "media"],
      default: "none"
    },
    text: { type: String },
    media_type: {
      type: String,
      enum: ["image", "video", "document"]
    },
    media_url: { type: String },
    handle: { type: String },
    original_filename: { type: String },
  },
  { _id: false }
);

const ButtonSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["phone_call", "website", "quick_reply", "catalog", "copy_code", "url"],
      required: true
    },
    url: { type: String },
    example: { type: Array, default: undefined },
    text: { type: String, required: true },

    phone_number: { type: String },

    website_url: { type: String },

  },
  { _id: false }
);

const SupportedAppSchema = new mongoose.Schema(
  {
    package_name: { type: String, required: true },
    signature_hash: { type: String, required: true }
  },
  { _id: false }
);

const AuthOtpButtonSchema = new mongoose.Schema(
  {
    otp_type: {
      type: String,
      enum: ["COPY_CODE", "ONE_TAP"],
      required: true
    },
    copy_button_text: { type: String },
    supported_apps: [SupportedAppSchema]
  },
  { _id: false }
);

const AuthenticationOptionsSchema = new mongoose.Schema(
  {
    add_security_recommendation: { type: Boolean, default: true },
    code_expiration_minutes: { type: Number, min: 1, max: 90 },
    otp_code_length: { type: Number, min: 4, max: 8, default: 6 },
    otp_buttons: [AuthOtpButtonSchema]
  },
  { _id: false }
);

const CarouselCardButtonSchema = new mongoose.Schema(
  {
    type: { type: String },
    text: { type: String },
    url: { type: String },
    example: { type: Array, default: undefined }
  },
  { _id: false }
);

const CarouselCardComponentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    format: { type: String },
    text: { type: String },
    example: { type: mongoose.Schema.Types.Mixed },
    buttons: [CarouselCardButtonSchema],
    media_url: { type: String },
    original_filename: { type: String }
  },
  { _id: false }
);

const CarouselCardSchema = new mongoose.Schema(
  {
    components: [CarouselCardComponentSchema]
  },
  { _id: false }
);

const TemplateSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    waba_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsappWaba"
    },
    template_id: {
      type: String,
      default: null
    },
    template_name: {
      type: String,
      required: true,
      lowercase: true
    },
    language: {
      type: String,
      default: "en_US"
    },
    category: {
      type: String,
      enum: ["UTILITY", "MARKETING", "AUTHENTICATION"],
      required: true
    },
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "draft"
    },

    header: HeaderSchema,
    message_body: {
      type: String
    },

    body_variables: [VariableSchema],

    footer_text: {
      type: String
    },
    call_permission: {
      type: Boolean,
      default: false
    },
    is_limited_time_offer: {
      type: Boolean,
      default: false
    },
    offer_text: {
      type: String
    },
    has_expiration: {
      type: Boolean,
      default: false
    },
    coupon_code: {
      type: String,
      default: null
    },
    parameter_format: {
      type: String,
      enum: ["positional", "named"],
      default: "positional"
    },
    buttons: [ButtonSchema],
    is_admin_template: {
      type: Boolean,
      default: false
    },
    template_type: {
      type: String,
      enum: [
        "limited_time_offer",
        "catalog",
        "call_permission",
        "coupon",
        "carousel_product",
        "carousel_media",
        "authentication",
        "standard"
      ],
      default: "standard"
    },
    sector: {
      type: String,
      enum: ["healthcare", "ecommerce", "fashion", "financial_service", "general"],
      default: null
    },
    template_category: {
      type: String,
      default: null
    },
    carousel_cards: [CarouselCardSchema],

    authentication_options: AuthenticationOptionsSchema,

    meta_template_id: { type: String },
    rejection_reason: { type: String },
    deleted_at: { type: Date, default: null },
    deleted_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" }
  }
);

export default mongoose.model("Template", TemplateSchema);
