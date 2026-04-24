import mongoose from 'mongoose';

const appointmentBookingSchema = new mongoose.Schema({
  config_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AppointmentConfig',
    required: true
  },
  contact_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  start_time: { type: Date, required: true },
  end_time: { type: Date, required: true },

  answers: { type: Map, of: String },

  google_event_id: { type: String },
  google_meet_link: { type: String },
  sheet_row: { type: Number },

  status: {
    type: String,
    enum: ['pending', 'confirmed', 'canceled', 'rescheduled' , 'booked'],
    default: 'pending'
  },

  cancel_reason: { type: String },

  reminder_sent: { type: Boolean, default: false },

  payment_status: {
    type: String,
    enum: ['unpaid', 'paid', 'partially_paid'],
    default: 'unpaid'
  },

  // Payment tracking
  payment_link: { type: String },
  payment_transaction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentTransaction' },
  amount_due: { type: Number, default: 0 },
  amount_paid: { type: Number, default: 0 },

  deleted_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'appointment_bookings'
});

appointmentBookingSchema.index({ config_id: 1, start_time: 1 });
appointmentBookingSchema.index({ contact_id: 1, status: 1 });

export default mongoose.model('AppointmentBooking', appointmentBookingSchema);
