import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
    {
        form_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Form",
            required: true,
            index: true
        },

        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        waba_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WhatsappWaba",
            required: true
        },

        data: {
            type: Object,
            required: true
        },

        fields: [
            {
                field_id: String,
                label: String,
                value: mongoose.Schema.Types.Mixed
            }
        ],

        meta: {
            phone_number: String,
            flow_id: String,
            flow_token: String,
            source: String
        },

        status: {
            type: String,
            enum: ["new", "viewed", "in_progress", "contacted", "qualified", "closed", "failed"],
            default: "new"
        },

        submitted_at: {
            type: Date,
            default: Date.now
        }

    }, { timestamps: true });

submissionSchema.index({ "meta.phone_number": 1, "meta.flow_id": 1 });
submissionSchema.index({ "meta.flow_token": 1 });

export default mongoose.model("Submission", submissionSchema);