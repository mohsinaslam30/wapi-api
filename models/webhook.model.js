import mongoose from "mongoose";


const WebhookSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    webhook_name: {
      type: String,
      required: true,
      trim: true
    },

    webhook_token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    description: {
      type: String,
      trim: true
    },

    platform: {
      type: String,
      enum: ["shopify", "woocommerce", "custom", "other"],
      default: "custom"
    },

    event_type: {
      type: String,
      trim: true
    },

    template_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Template",
      required: false
    },

    field_mapping: {
      phone_number_field: {
        type: String,
        required: false,
        default: "customer.phone"
      },

      variables: {
        type: Map,
        of: String,
        default: {}
      }
    },

    first_payload: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },

    is_template_mapped: {
      type: Boolean,
      default: false
    },

    config: {
      is_active: {
        type: Boolean,
        default: true
      },

      require_auth: {
        type: Boolean,
        default: false
      },

      secret_key: {
        type: String
      },

      verified_numbers_only: {
        type: Boolean,
        default: false
      }
    },

    stats: {
      total_triggers: {
        type: Number,
        default: 0
      },
      successful_sends: {
        type: Number,
        default: 0
      },
      failed_sends: {
        type: Number,
        default: 0
      },
      last_triggered_at: {
        type: Date
      }
    },

    recent_logs: [
      {
        triggered_at: {
          type: Date,
          default: Date.now
        },
        status: {
          type: String,
          enum: ["success", "failed"],
          required: true
        },
        phone_number: String,
        error_message: String,
        payload_preview: String
      }
    ],

    created_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" }
  }
);

WebhookSchema.index({ user_id: 1, created_at: -1 });
// WebhookSchema.index({ webhook_token: 1 });

WebhookSchema.statics.generateWebhookToken = function() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15) +
    Date.now().toString(36)
  );
};

WebhookSchema.methods.addLog = function(logEntry) {
  this.recent_logs.unshift(logEntry);
  if (this.recent_logs.length > 10) {
    this.recent_logs = this.recent_logs.slice(0, 10);
  }
};

WebhookSchema.statics.getNestedValue = function(obj, path) {
  return path.split('.').reduce((current, key) => {
    return current?.[key];
  }, obj);
};

export default mongoose.model("Webhook", WebhookSchema);
