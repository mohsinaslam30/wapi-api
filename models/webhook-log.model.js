import mongoose from "mongoose";

const WebhookLogSchema = new mongoose.Schema(
  {
    webhook_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Webhook",
      required: true,
      index: true
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    log_type: {
      type: String,
      enum: ["trigger", "message"],
      required: true,
      index: true
    },
    recipient_type: {
      type: String,
      enum: ["customer", "owner"],
      required: false,
      index: true
    },
    method: {
      type: String,
      enum: ["GET", "POST"]
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: false
    },
    status: {
      type: String,
      enum: ["success", "failed"],
      required: true,
      index: true
    },
    error_message: {
      type: String,
      trim: true
    },
    phone_number: {
      type: String,
      trim: true
    },
    template_name: {
      type: String,
      trim: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: false }
  }
);

// Index for fast retrieval of latest logs for a specific webhook
WebhookLogSchema.index({ webhook_id: 1, created_at: -1 });
WebhookLogSchema.index({ webhook_id: 1, log_type: 1, created_at: -1 });

export default mongoose.model("WebhookLog", WebhookLogSchema);
