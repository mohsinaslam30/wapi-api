import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema({
  day: {
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    required: true
  },
  intervals: [{
    from: { type: String, required: true },
    to: { type: String, required: true }
  }],
  is_enabled: { type: Boolean, default: true }
}, { _id: false });

const customQuestionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['text', 'number', 'select'], default: 'text' },
  options: [String],
  required: { type: Boolean, default: false }
}, { _id: false });

const appointmentConfigSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  waba_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WabaConfiguration',
    required: true
  },
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  location: { type: String, trim: true },
  timezone: { type: String, default: 'UTC' },

  duration_minutes: { type: Number, default: 30 },
  max_daily_appointments: { type: Number, default: 10 },
  break_between_appointments_minutes: { type: Number, default: 0 },
  max_advance_booking_days: { type: Number, default: 30 },
  allow_overlap: { type: Boolean, default: false },
  send_confirmation_message: { type: Boolean, default: true },


  success_template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  confirm_template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  cancel_template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  reminder_template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  reschedule_template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  reminder_hours: { type: Number, default: 24 },


  variable_mappings: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      success: {},
      confirm: {},
      reminder: {},
      cancel: {},
      reschedule: {}
    }
  },

  appointment_fees: { type: Number, default: 0 },
  pre_paid_fees: { type: Number, default: 0 },
  tax_percentage: { type: Number, default: 0 },
  total_appointment_fees: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },

  payment_gateway_id: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentGatewayConfig' },
  accept_partial_payment: { type: Boolean, default: false },
  partial_payment_amount: { type: Number, default: 0 }, 

  send_payment_link_automatically: { type: Boolean, default: false },
  payment_link_template_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  payment_link_variable_mappings: { type: mongoose.Schema.Types.Mixed, default: {} },

  create_google_meet: { type: Boolean, default: false },
  google_account_id: { type: mongoose.Schema.Types.ObjectId, ref: 'GoogleAccount' },
  calendar_id: { type: String, default: 'primary' },
  sheet_id: { type: String },
  sheet_name: { type: String, default: 'Appointments' },

  whatsapp_flow_id: { type: String },

  slots: [slotSchema],

  intro_message: { type: String },
  series_of_questions: [customQuestionSchema],

  custom_fields_mapping: [{
    appointment_field: { type: String },
    contact_custom_field_key: { type: String }
  }],

  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  deleted_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'appointment_configs'
});

appointmentConfigSchema.index({ user_id: 1, deleted_at: 1 });

export default mongoose.model('AppointmentConfig', appointmentConfigSchema);
