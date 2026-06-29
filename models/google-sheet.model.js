import mongoose from 'mongoose';

const googleSheetSchema = new mongoose.Schema({
  google_account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GoogleAccount',
    required: true
  },
  sheet_id: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  is_linked: {
    type: Boolean,
    default: false
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'google_sheets'
});

googleSheetSchema.index({ google_account_id: 1, sheet_id: 1 }, { unique: true });
googleSheetSchema.index({ deleted_at: 1 });

export default mongoose.model('GoogleSheet', googleSheetSchema);
