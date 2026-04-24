import mongoose from 'mongoose';

const teamSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      trim: true
    },

    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },

    sort_order: {
      type: Number,
      default: 0,
    },

    deleted_at: {
      type: Date,
      default: null,
      index: true
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'teams'
  }
);


export default mongoose.model('Team', teamSchema);