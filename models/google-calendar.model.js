import mongoose from 'mongoose';

const googleCalendarSchema = new mongoose.Schema({
  google_account_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GoogleAccount',
    required: true
  },
  calendar_id: {
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
  collection: 'google_calendars'
});

googleCalendarSchema.index({ google_account_id: 1, calendar_id: 1 }, { unique: true });
googleCalendarSchema.index({ deleted_at: 1 });

export default mongoose.model('GoogleCalendar', googleCalendarSchema);
