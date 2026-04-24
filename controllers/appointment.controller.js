import { AppointmentConfig, AppointmentBooking, Contact } from '../models/index.js';
import mongoose from 'mongoose';
import appointmentService from '../services/appointment.service.js';
import paymentLinkService from '../services/payment-link.service.js';


export const createConfig = async (req, res) => {
  try {
    const { waba_id } = req.body;
    if (!waba_id) return res.status(400).json({ success: false, message: 'waba_id is required' });

    const config = await AppointmentConfig.create({
      ...req.body,
      user_id: req.user.owner_id,
      waba_id
    });
    res.status(201).json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getConfigs = async (req, res) => {
  try {
    const {
      waba_id,
      page = 1,
      limit = 10,
      search,
      sort_by,
      sort_order
    } = req.query;

    const query = {
      user_id: req.user.owner_id,
      deleted_at: null
    };

    if (waba_id) query.waba_id = waba_id;

    if (search && search.trim()) {
      query.name = { $regex: search.trim(), $options: 'i' };
    }

    let sort = { created_at: -1 };
    if (sort_by) {
      const order = sort_order?.toLowerCase() === 'desc' ? -1 : 1;
      sort = { [sort_by]: order };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AppointmentConfig.countDocuments(query);

    const configs = await AppointmentConfig.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('payment_gateway_id', 'gateway display_name is_active')
      .populate('payment_link_template_id', 'template_name language');

    return res.status(200).json({
      success: true,
      data: {
        configs,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getConfigById = async (req, res) => {
  try {
    const config = await AppointmentConfig.findOne({
      _id: req.params.id,
      user_id: req.user.owner_id,
      deleted_at: null
    })
      .populate('payment_gateway_id', 'gateway display_name is_active')
      .populate('payment_link_template_id', 'template_name language')
      .populate('google_account_id', 'email display_name');

    if (!config) return res.status(404).json({ success: false, message: 'Config not found' });
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAvailableDates = async (req, res) => {
  try {
    const { configId } = req.params;
    const dates = await appointmentService.getAvailableDates(configId);
    res.json({ success: true, dates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAvailableSlots = async (req, res) => {
  try {
    const { configId } = req.params;
    const { date } = req.query;

    if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

    const slots = await appointmentService.getAvailableSlots(configId, date);
    res.json({ success: true, slots });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createBooking = async (req, res) => {
  try {
    const booking = await appointmentService.createBooking({
      ...req.body,
      userId: req.user.owner_id
    });
    res.status(201).json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateConfig = async (req, res) => {
  try {
    const config = await AppointmentConfig.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.owner_id },
      req.body,
      { returnDocument: 'after' }
    );
    if (!config) return res.status(404).json({ success: false, message: 'Config not found' });
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteConfig = async (req, res) => {
  try {
    const config = await AppointmentConfig.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.owner_id },
      { deleted_at: new Date() },
      { returnDocument: 'after' }
    );
    if (!config) return res.status(404).json({ success: false, message: 'Config not found' });
    res.json({ success: true, message: 'Config deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const linkTemplates = async (req, res) => {
  try {
    const {
      success_template_id,
      status_update_template_id,
      cancel_template_id,
      reminder_template_id,
      reschedule_template_id,
      payment_link_template_id,
      reminder_hours
    } = req.body;

    const config = await AppointmentConfig.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user.owner_id },
      {
        success_template_id,
        status_update_template_id,
        cancel_template_id,
        reminder_template_id,
        reschedule_template_id,
        payment_link_template_id,
        reminder_hours
      },
      { returnDocument: 'after' }
    );
    if (!config) return res.status(404).json({ success: false, message: 'Config not found' });
    res.json({ success: true, message: 'Templates linked successfully', config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateBookingStatus = async (req, res) => {
  try {
    const { status, startTime, endTime } = req.body;
    const bookingId = req.params.id;

    if (!['confirmed', 'canceled', 'rescheduled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    if (status === 'canceled') {
      const booking = await appointmentService.cancelBooking(bookingId);
      return res.json({ success: true, booking });
    }

    if (status === 'rescheduled') {
      if (!startTime || !endTime) {
        return res.status(400).json({ success: false, message: 'startTime and endTime are required for rescheduling' });
      }
      const booking = await appointmentService.rescheduleBooking(bookingId, startTime, endTime);
      return res.json({ success: true, booking });
    }

    if (status === 'confirmed') {
      const booking = await AppointmentBooking.findByIdAndUpdate(bookingId, { status: 'confirmed' }, { returnDocument: 'after' });
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

      const config = await AppointmentConfig.findById(booking.config_id).lean();
      if (config && config.confirm_template_id) {
        await appointmentService.sendAppointmentTemplate(
          booking.user_id,
          booking.contact_id,
          config.confirm_template_id,
          booking,
          'confirm',
          null
        );
      }
      return res.json({ success: true, booking });
    }

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getBookings = async (req, res) => {
  try {
    const {
      config_id,
      status,
      payment_status,
      date_from,
      date_to,
      page = 1,
      limit = 20,
      search,
      sort_by,
      sort_order
    } = req.query;

    const query = {
      user_id: req.user.owner_id,
      deleted_at: null
    };

    const effectiveConfigId = config_id || req.params.id;

    if (effectiveConfigId && mongoose.Types.ObjectId.isValid(effectiveConfigId)) {
      query.config_id = new mongoose.Types.ObjectId(effectiveConfigId);
    }

    if (search && search.trim()) {
      const sanitizedSearch = search.trim();
      const matchingContacts = await Contact.find({
        user_id: req.user.owner_id,
        $or: [
          { name: { $regex: sanitizedSearch, $options: 'i' } },
          { phone_number: { $regex: sanitizedSearch, $options: 'i' } },
          { email: { $regex: sanitizedSearch, $options: 'i' } }
        ]
      }).select('_id').lean();

      const contactIds = matchingContacts.map(c => c._id);
      query.contact_id = { $in: contactIds };
    }

    if (status) query.status = status;
    if (payment_status) query.payment_status = payment_status;

    if (date_from || date_to) {
      query.start_time = {};
      if (date_from) query.start_time.$gte = new Date(date_from);
      if (date_to) query.start_time.$lte = new Date(date_to);
    }

    let sort = { start_time: -1 };
    if (sort_by) {
      const order = sort_order?.toLowerCase() === 'asc' ? 1 : -1;
      sort = { [sort_by]: order };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AppointmentBooking.countDocuments(query);

    const bookings = await AppointmentBooking.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('config_id', 'name location duration_minutes')
      .populate('contact_id', 'name phone_number email')
      .populate('payment_transaction_id', 'gateway status payment_link amount currency');

    res.json({
      success: true,
      bookings,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBookingById = async (req, res) => {
  try {
    const booking = await AppointmentBooking.findOne({
      _id: req.params.id,
      user_id: req.user.owner_id,
      deleted_at: null
    })
      .populate('config_id')
      .populate('contact_id', 'name phone_number email')
      .populate('payment_transaction_id');

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const bulkDeleteBookings = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids array is required' });
    }

    const result = await AppointmentBooking.updateMany(
      {
        _id: { $in: ids },
        user_id: req.user.owner_id,
        deleted_at: null
      },
      { deleted_at: new Date() }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} booking(s) deleted`,
      deleted_count: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const sendPaymentLink = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { gateway_config_id } = req.body;

    const booking = await AppointmentBooking.findOne({
      _id: bookingId,
      user_id: req.user.owner_id,
      deleted_at: null
    });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.payment_status === 'paid') {
      return res.status(400).json({ success: false, message: 'Booking is already fully paid' });
    }

    const config = await AppointmentConfig.findById(booking.config_id).lean();
    if (!config) return res.status(404).json({ success: false, message: 'Appointment config not found' });

    const resolvedGatewayId = gateway_config_id || config.payment_gateway_id;
    if (!resolvedGatewayId) {
      return res.status(400).json({ success: false, message: 'No payment gateway configured. Please set a payment_gateway_id on the appointment config or provide gateway_config_id in the request body.' });
    }

    let amount;
    let payment_type = 'full';

    if (config.accept_partial_payment) {
      const partialAmt = config.partial_payment_amount > 0 ? config.partial_payment_amount : config.pre_paid_fees;
      amount = partialAmt * 100; 
      payment_type = 'partial';
    } else {
      const base = config.appointment_fees || 0;
      const tax = config.tax_percentage || 0;
      const total = base + (base * (tax / 100));
      amount = Math.round(total * 100);
    }

    if (booking.payment_status === 'partially_paid' && booking.amount_paid > 0) {
      const totalDue = booking.amount_due || Math.round(amount);
      const remaining = totalDue - (booking.amount_paid * 100);
      if (remaining <= 0) {
        return res.status(400).json({ success: false, message: 'No outstanding balance' });
      }
      amount = remaining;
      payment_type = 'partial';
    }

    const { transaction, payment_link } = await paymentLinkService.sendPaymentLink({
      context: 'appointment',
      context_id: booking._id,
      user_id: req.user.owner_id,
      contact_id: booking.contact_id,
      gateway_config_id: resolvedGatewayId,
      amount,
      currency: config.currency || 'INR',
      payment_type,
      description: `Appointment: ${config.name}`,
      whatsapp_phone_number_id: config.waba_id,
      templateConfig: config.payment_link_template_id
        ? {
            templateId: config.payment_link_template_id,
            variableMappings: config.payment_link_variable_mappings || {},
            booking
          }
        : null
    });

    booking.payment_link = payment_link;
    booking.payment_transaction_id = transaction._id;
    booking.amount_due = Math.round(amount);
    await booking.save();

    res.json({
      success: true,
      message: 'Payment link sent successfully',
      payment_link,
      transaction_id: transaction._id
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  createConfig,
  getConfigs,
  getConfigById,
  updateConfig,
  deleteConfig,
  linkTemplates,
  getAvailableDates,
  getAvailableSlots,
  createBooking,
  updateBookingStatus,
  getBookings,
  getBookingById,
  bulkDeleteBookings,
  sendPaymentLink
};
