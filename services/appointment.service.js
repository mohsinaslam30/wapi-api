import { AppointmentConfig, AppointmentBooking, GoogleCalendar, Contact, Template } from '../models/index.js';
import { getCalendarClient, getSheetsClient, handleGoogleApiError } from '../utils/google-api-helper.js';
import moment from 'moment';

class AppointmentService {

  async getAvailableDates(configId, daysToLookAhead = 30) {
    const config = await AppointmentConfig.findById(configId);
    if (!config) throw new Error('Appointment configuration not found');

    const availableDates = [];
    const startDate = moment().startOf('day');
    const endDate = moment().add(Math.min(daysToLookAhead, config.max_advance_booking_days), 'days');

    let currentDate = moment(startDate);
    while (currentDate.isSameOrBefore(endDate)) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const slots = await this.getAvailableSlots(configId, dateStr);

      if (slots.length > 0) {
        availableDates.push({
          date: dateStr,
          formatted: currentDate.format('MMM D, YYYY'),
          slots_count: slots.length
        });
      }
      currentDate.add(1, 'day');
    }

    return availableDates;
  }


  async getAvailableSlots(configId, date) {
    const config = await AppointmentConfig.findById(configId);
    if (!config) return [];

    const dayName = moment(date).format('dddd').toLowerCase();
    const dayConfig = config.slots.find(s => s.day === dayName && s.is_enabled);
    if (!dayConfig) return [];

    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();
    const existingBookings = await AppointmentBooking.find({
      config_id: configId,
      start_time: { $gte: startOfDay, $lte: endOfDay },
      status: { $ne: 'canceled' }
    });

    if (existingBookings.length >= config.max_daily_appointments) {
      return [];
    }

    let googleBusyTimes = [];
    if (config.google_account_id && config.calendar_id) {
      try {
        const calendar = await getCalendarClient(config.google_account_id);
        const fbResponse = await calendar.freebusy.query({
          requestBody: {
            timeMin: startOfDay.toISOString(),
            timeMax: endOfDay.toISOString(),
            items: [{ id: config.calendar_id }]
          }
        });
        googleBusyTimes = fbResponse.data.calendars[config.calendar_id].busy || [];
      } catch (err) {
        console.error('[appointment_service] Google FreeBusy error:', err.message);
        await handleGoogleApiError(err, config.google_account_id);
      }
    }

    const availableSlots = [];
    const duration = config.duration_minutes;
    const breakTime = config.break_between_appointments_minutes;

    for (const interval of dayConfig.intervals) {
      let currentSlotStart = moment(`${date} ${interval.from}`, 'YYYY-MM-DD HH:mm');
      const intervalEnd = moment(`${date} ${interval.to}`, 'YYYY-MM-DD HH:mm');

      while (currentSlotStart.clone().add(duration, 'minutes').isSameOrBefore(intervalEnd)) {
        const slotEnd = currentSlotStart.clone().add(duration, 'minutes');

        const isBusyInDB = existingBookings.some(b =>
          moment(b.start_time).isBefore(slotEnd) && moment(b.end_time).isAfter(currentSlotStart)
        );

        const isBusyInGoogle = googleBusyTimes.some(b =>
          moment(b.start).isBefore(slotEnd) && moment(b.end).isAfter(currentSlotStart)
        );

        const isPast = currentSlotStart.isBefore(moment());

        if (!isBusyInDB && !isBusyInGoogle && !isPast) {
          availableSlots.push({
            start: currentSlotStart.toISOString(),
            end: slotEnd.toISOString(),
            display: `${currentSlotStart.format('h:mm A')} - ${slotEnd.format('h:mm A')}`,
            duration: `${duration} min`
          });
        }

        currentSlotStart.add(duration + breakTime, 'minutes');
      }
    }

    return availableSlots;
  }

  async createBooking({ configId, contactId, userId, startTime, endTime, answers = {}, whatsappPhoneNumberId = null }) {
    const config = await AppointmentConfig.findById(configId);
    if (!config) throw new Error('Configuration not found');

    const baseFee = config.appointment_fees || 0;
    const tax = config.tax_percentage || 0;
    const totalFee = baseFee + (baseFee * (tax / 100));
    const amountDuePaise = Math.round(totalFee * 100);

    const booking = await AppointmentBooking.create({
      config_id: configId,
      contact_id: contactId,
      user_id: userId,
      start_time: startTime,
      end_time: endTime,
      answers,
      status: 'booked',
      payment_status: config.pre_paid_fees > 0 ? 'partially_paid' : 'unpaid',
      amount_due: amountDuePaise
    });

    if (config.google_account_id) {
       try {
         const calendar = await getCalendarClient(config.google_account_id);
         const eventBody = {
           summary: `${config.name}: ${answers.name || 'New Booking'}`,
           description: `Location: ${config.location || 'N/A'}\nWhatsApp Booking\nDetails: ${JSON.stringify(answers)}`,
           location: config.location || '',
           start: { dateTime: startTime },
           end: { dateTime: endTime }
         };

         if (config.create_google_meet) {
           eventBody.conferenceData = {
             createRequest: { requestId: `meet-${booking._id}`, conferenceSolutionKey: { type: 'hangoutsMeet' } }
           };
         }

         const gEvent = await calendar.events.insert({
           calendarId: config.calendar_id || 'primary',
           requestBody: eventBody,
           conferenceDataVersion: 1
         });

         booking.google_event_id = gEvent.data.id;
         if (gEvent.data.hangoutLink) {
           booking.google_meet_link = gEvent.data.hangoutLink;
         }
         await booking.save();
         console.log(`[appointment_service] Google Calendar synced for booking: ${booking._id}`);
       } catch (err) {
         console.error('[appointment_service] Google Calendar Sync Error (Non-blocking):', err.message);
         await handleGoogleApiError(err, config.google_account_id);
       }
    }

    if (config.google_account_id && config.sheet_id) {
      try {
        const sheets = await getSheetsClient(config.google_account_id);
        const rowData = [
          moment(startTime).format('YYYY-MM-DD HH:mm'),
          answers.name || '',
          answers.phone || '',
          config.name,
          booking.google_meet_link || 'N/A',
          totalFee.toFixed(2)
        ];

        await sheets.spreadsheets.values.append({
          spreadsheetId: config.sheet_id,
          range: config.sheet_name ? `'${config.sheet_name}'!A1` : 'A1',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowData] }
        });
        console.log(`[appointment_service] Google Sheet synced for booking: ${booking._id}`);
      } catch (err) {
        console.error('[appointment_service] Google Sheet Sync Error (Non-blocking):', err.message);
        try {
           const sheets = await getSheetsClient(config.google_account_id);
           await sheets.spreadsheets.values.append({
             spreadsheetId: config.sheet_id,
             range: 'A1',
             valueInputOption: 'USER_ENTERED',
             requestBody: { values: [[...rowData, '(Fallback Sheet)']] }
           });
        } catch (innerErr) {
           console.error('[appointment_service] Fallback Sheet Sync Error:', innerErr.message);
           await handleGoogleApiError(innerErr, config.google_account_id);
        }
      }
    }

    if (config.success_template_id) {
       this.sendAppointmentTemplate(
         userId,
         contactId,
         config.success_template_id,
         booking,
         'success',
         whatsappPhoneNumberId || config.waba_id
       );
    }

    if (config.send_payment_link_automatically && config.payment_gateway_id && booking.amount_due > 0) {
      try {
        const { default: paymentLinkService } = await import('./payment-link.service.js');
        let payment_type = 'full';
        let amount = booking.amount_due;

        if (config.accept_partial_payment) {
          const partialAmt = config.partial_payment_amount > 0 ? config.partial_payment_amount : config.pre_paid_fees;
          amount = Math.round(partialAmt * 100);
          payment_type = 'partial';
        }

        const { transaction, payment_link } = await paymentLinkService.sendPaymentLink({
          context: 'appointment',
          context_id: booking._id,
          user_id: userId,
          contact_id: contactId,
          gateway_config_id: config.payment_gateway_id,
          amount,
          currency: config.currency || 'INR',
          payment_type,
          description: `Appointment: ${config.name}`,
          whatsapp_phone_number_id: whatsappPhoneNumberId || config.waba_id,
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
        await booking.save();
        console.log(`[appointment_service] Auto payment link sent for booking: ${booking._id}`);
      } catch (err) {
        console.error('[appointment_service] Auto payment link error (non-blocking):', err.message);
      }
    }

    return booking;
  }

  async cancelBooking(bookingId, whatsappPhoneNumberId = null) {
    const booking = await AppointmentBooking.findById(bookingId);
    if (!booking) throw new Error('Booking not found');

    booking.status = 'canceled';
    await booking.save();

    const config = await AppointmentConfig.findById(booking.config_id);

    if (config && config.google_account_id && booking.google_event_id) {
      try {
        const calendar = await getCalendarClient(config.google_account_id);
        await calendar.events.delete({
          calendarId: config.calendar_id || 'primary',
          eventId: booking.google_event_id
        });
      } catch (err) {
        console.error('[appointment_service] Calendar Delete Error:', err.message);
        await handleGoogleApiError(err, config.google_account_id);
      }
    }

    if (config && config.cancel_template_id) {
      this.sendAppointmentTemplate(
        booking.user_id,
        booking.contact_id,
        config.cancel_template_id,
        booking,
        'cancel',
        whatsappPhoneNumberId
      );
    }

    return booking;
  }

  async rescheduleBooking(bookingId, newStartTime, newEndTime, whatsappPhoneNumberId = null) {
    const booking = await AppointmentBooking.findById(bookingId);
    if (!booking) throw new Error('Booking not found');

    const { default: moment } = await import('moment');

    const sTime = moment(newStartTime, ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD h:mm A', moment.ISO_8601]).toDate();
    const eTime = moment(newEndTime,  ['YYYY-MM-DD HH:mm', 'YYYY-MM-DD h:mm A', moment.ISO_8601]).toDate();

    if (isNaN(sTime) || isNaN(eTime)) {
       throw new Error(`Invalid Date Format. Please provide YYYY-MM-DD HH:mm. Received: ${newStartTime}`);
    }

    booking.start_time = sTime;
    booking.end_time = eTime;
    booking.status = 'rescheduled';
    await booking.save();

    const config = await AppointmentConfig.findById(booking.config_id);

    if (config && config.google_account_id && booking.google_event_id) {
       try {
         const calendar = await getCalendarClient(config.google_account_id);
         await calendar.events.patch({
           calendarId: config.calendar_id || 'primary',
           eventId: booking.google_event_id,
           requestBody: {
             start: { dateTime: sTime.toISOString() },
             end: { dateTime: eTime.toISOString() }
           }
         });
       } catch (err) {
         console.error('[appointment_service] Calendar Update Error:', err.message);
         await handleGoogleApiError(err, config.google_account_id);
       }
    }

    if (config && config.reschedule_template_id) {
       this.sendAppointmentTemplate(
         booking.user_id,
         booking.contact_id,
         config.reschedule_template_id,
         booking,
         'reschedule',
         whatsappPhoneNumberId
       );
    }

    return booking;
  }

  async sendAppointmentTemplate(userId, contactId, templateId, booking, mappingType = 'success', whatsappPhoneNumberId = null) {
    try {
      console.log(`[appointment_service] Attempting to send template: ${templateId} (${mappingType})`);
      const { default: unifiedWhatsAppService } = await import('./whatsapp/unified-whatsapp.service.js');
      const contact = await Contact.findById(contactId);
      const config = await AppointmentConfig.findById(booking.config_id).lean();

      if (!contact || !config) {
        console.error('[appointment_service] Send Error: Contact or Config not found', { contactId, configId: booking.config_id });
        return;
      }

      let finalPhId = whatsappPhoneNumberId;
      if (!finalPhId || finalPhId.toString() === config.waba_id?.toString()) {
        const { WhatsappPhoneNumber } = await import('../models/index.js');
        const phone = await WhatsappPhoneNumber.findOne({ waba_id: config.waba_id });
        finalPhId = phone ? phone._id : config.waba_id;
      }

      let mappings = config.variable_mappings?.[mappingType] || {};
      if (Object.keys(mappings).length === 0 && mappingType !== 'success') {
        mappings = config.variable_mappings?.['success'] || {};
      }

      const variables = {};
      console.log(`[appointment_service] Resolving variables using mapping: ${JSON.stringify(mappings)}`);

      for (const [key, source] of Object.entries(mappings)) {
        let value = 'N/A';
        console.log(`[Flashlight] Mapping variable {{${key}}} from source: ${source}`);

        if (source === 'contact_name') {
          value = contact.name || 'Guest';
        } else if (source === 'appointment_time') {
          const fmt = 'MMM D, YYYY [at] h:mm A';
          value = moment(booking.start_time).format(fmt);
        } else if (source === 'appointment_date') {
          value = moment(booking.start_time).format('MMM D, YYYY');
        } else if (source === 'appointment_hour') {
          value = moment(booking.start_time).format('h:mm A');
        } else if (source === 'meet_link') {
          value = booking.google_meet_link || 'N/A';
        } else if (source === 'location') {
          value = config.location || 'N/A';
        } else if (source === 'config_name') {
          value = config.name || 'Appointment';
        } else if (source === 'payment_link') {
          value = booking.payment_link || 'N/A';
        } else if (source.startsWith('answer:')) {
          const questionId = source.replace('answer:', '');
          value = 'N/A';
          if (booking.answers) {
             value = typeof booking.answers.get === 'function'
               ? booking.answers.get(questionId)
               : booking.answers[questionId];
          }
          if (!value) value = 'N/A';
          console.log(`[Flashlight] Resolved answer for ${questionId}: ${value}`);
        }

        variables[key] = value;
      }

      console.log(`[Flashlight] Final resolved variables: ${JSON.stringify(variables)}`);

      if (Object.keys(variables).length === 0) {
        variables["1"] = contact.name || 'Guest';
        variables["2"] = moment(booking.start_time).format('MMM D, YYYY h:mm A');
        variables["3"] = booking.google_meet_link || 'N/A';
      }

      const { Template } = await import('../models/index.js');
      const templateDoc = await Template.findById(templateId).lean();
      if (!templateDoc) {
        console.error(`[appointment_service] Template not found in DB: ${templateId}`);
        return;
      }

      const templateComponents = [{
        type: 'body',
        parameters: Object.entries(variables)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0])) 
          .map(([_, val]) => ({
            type: 'text',
            text: val.toString()
          }))
      }];

      await unifiedWhatsAppService.sendMessage(userId, {
        recipientNumber: contact.phone_number,
        messageType: 'template',
        whatsappPhoneNumberId: finalPhId,
        templateName: templateDoc.template_name,
        languageCode: templateDoc.language || 'en_US',
        templateComponents,
        templateId
      });
    } catch (err) {
      console.error('[appointment_service] Error sending template:', err.message);
    }
  }

  async processPendingReminders() {
    try {
      const { AppointmentConfig, AppointmentBooking } = await import('../models/index.js');

      const configs = await AppointmentConfig.find({
        reminder_template_id: { $exists: true, $ne: null },
        deleted_at: null
      }).lean();

      for (const config of configs) {
        const reminderHours = config.reminder_hours || 24;
        const reminderTimeStart = moment().add(reminderHours, 'hours');
        const reminderTimeEnd = moment().add(reminderHours, 'hours').add(1, 'hour');

        const upcomingBookings = await AppointmentBooking.find({
          config_id: config._id,
          start_time: { $gte: reminderTimeStart.toDate(), $lte: reminderTimeEnd.toDate() },
          status: 'confirmed',
          reminder_sent: { $ne: true }
        });

        for (const booking of upcomingBookings) {
          console.log(`[ReminderService] Sending reminder for booking: ${booking._id}`);
          await this.sendAppointmentTemplate(
            booking.user_id,
            booking.contact_id,
            config.reminder_template_id,
            booking,
            'reminder',
            config.waba_id
          );

          booking.reminder_sent = true;
          await booking.save();
        }
      }
    } catch (err) {
      console.error('[appointment_service] Reminder processing error:', err.message);
    }
  }


  async startConversationalFlow({ userId, contactId, configId, whatsappPhoneNumberId, inputData = {} }) {
    try {
      const { AppointmentConfig, Contact } = await import('../models/index.js');

      const config = await AppointmentConfig.findById(configId).lean();
      if (!config) throw new Error('Appointment configuration not found');

      const questions = config.series_of_questions || [];
      const answers = inputData.appointment_answers || {};

      const nextQuestion = questions.find(q => !answers[q.id || q.label]);

      if (nextQuestion) {
        const contact = await Contact.findById(contactId);

        const isFirstQuestion = Object.keys(answers).length === 0;
        const messageContent = isFirstQuestion
          ? `${config.intro_message || 'Welcome to our appointment booking system. Please fill in the following information to proceed.'}\n\n${nextQuestion.label}`
          : nextQuestion.label;

        if (contact) {
          contact.metadata = {
            ...(contact.metadata || {}),
            automation_waiting_type: 'appointment_question',
            automation_waiting_config_id: configId,
            automation_current_question_id: nextQuestion.id || nextQuestion.label,
            automation_input_data: JSON.stringify({ ...inputData, contactId, senderNumber: contact.phone_number, whatsappPhoneNumberId, appointment_answers: answers })
          };
          contact.markModified('metadata');
          await contact.save();
        }

        const { default: unifiedWhatsAppService } = await import('./whatsapp/unified-whatsapp.service.js');
        await unifiedWhatsAppService.sendMessage(userId, {
          recipientNumber: contact.phone_number,
          messageType: 'text',
          messageText: messageContent,
          whatsappPhoneNumberId
        });
        return { status: 'question_sent' };
      }

      return await this.sendDateSelection(userId, contactId, configId, whatsappPhoneNumberId, inputData);

    } catch (err) {
      console.error('[appointment_service] Error starting flow:', err.message);
      throw err;
    }
  }


  async sendDateSelection(userId, contactId, configId, whatsappPhoneNumberId, inputData = {}) {
    const { AppointmentConfig, Contact } = await import('../models/index.js');
    const { default: unifiedWhatsAppService } = await import('./whatsapp/unified-whatsapp.service.js');

    const config = await AppointmentConfig.findById(configId).lean();
    const availableDates = await this.getAvailableDates(configId);

    const rows = availableDates.slice(0, 10).map(d => ({
      id: `date_${d.date}`,
      title: moment(d.date).format('ddd, MMM D'),
      description: `Slots: ${d.slot_count}`
    }));

    if (rows.length === 0) {
      await unifiedWhatsAppService.sendMessage(userId, {
        recipientNumber: inputData.senderNumber,
        messageType: 'text',
        messageText: "Sorry, there are no available dates at the moment.",
        whatsappPhoneNumberId
      });
      return { status: 'no_slots' };
    }

    const contact = await Contact.findById(contactId);
    if (contact) {
      contact.metadata = {
        ...(contact.metadata || {}),
        automation_waiting_type: 'appointment_date_selection',
        automation_waiting_config_id: configId,
        automation_input_data: JSON.stringify({ ...inputData, appointment_answers: inputData.appointment_answers || {} })
      };
      contact.markModified('metadata');
      await contact.save();
    }

    await unifiedWhatsAppService.sendMessage(userId, {
      recipientNumber: contact.phone_number,
      messageType: 'interactive',
      interactiveType: 'list',
      messageText: 'Please choose your preferred date from the available options:',
      listParams: {
        header: 'Select Appointment Date',
        buttonTitle: 'Available Dates',
        sectionTitle: 'Upcoming Dates',
        items: rows
      },
      whatsappPhoneNumberId
    });

    return { status: 'date_list_sent' };
  }


  async sendTimeSelection(userId, contactId, configId, date, whatsappPhoneNumberId, inputData = {}) {
    const { AppointmentConfig, Contact } = await import('../models/index.js');
    const { default: unifiedWhatsAppService } = await import('./whatsapp/unified-whatsapp.service.js');

    const config = await AppointmentConfig.findById(configId).lean();
    const slots = await this.getAvailableSlots(configId, date);

    const rows = slots.slice(0, 10).map(s => ({
      id: `slot_${s.start}`,
      title: moment(s.start).format('h:mm A'),
      description: `Ends at ${moment(s.end).format('h:mm A')}`
    }));

    const contact = await Contact.findById(contactId);
    if (contact) {
      contact.metadata = {
        ...(contact.metadata || {}),
        automation_waiting_type: 'appointment_time_selection',
        automation_waiting_config_id: configId,
        automation_selected_date: date,
        automation_input_data: JSON.stringify(inputData)
      };
      contact.markModified('metadata');
      await contact.save();
    }

    await unifiedWhatsAppService.sendMessage(userId, {
      recipientNumber: contact.phone_number,
      messageType: 'interactive',
      interactiveType: 'list',
      messageText: `Please choose your preferred time for ${moment(date).format('dddd, MMM D, YYYY')}:`,
      listParams: {
        header: 'Select Appointment Time',
        buttonTitle: 'Available Times',
        sectionTitle: 'Available Slots',
        items: rows
      },
      whatsappPhoneNumberId
    });

    return { status: 'time_list_sent' };
  }


  async sendBookingStatusOptions(userId, contactId, bookingId, whatsappPhoneNumberId) {
    const { Contact } = await import('../models/index.js');
    const { default: unifiedWhatsAppService } = await import('./whatsapp/unified-whatsapp.service.js');

    const contact = await Contact.findById(contactId);
    if (contact) {
      contact.metadata = {
        ...(contact.metadata || {}),
        automation_waiting_type: 'appointment_status_selection',
        automation_current_booking_id: bookingId ? bookingId.toString() : null
      };
      contact.markModified('metadata');
      await contact.save();
      console.log(`[PIVOTAL] Metadata confirmed for booking: ${bookingId ? bookingId.toString() : 'NONE'}`);
    }

    await unifiedWhatsAppService.sendMessage(userId, {
      recipientNumber: contact.phone_number,
      messageType: 'interactive',
      interactiveType: 'button',
      messageText: 'Booking confirmed! How would you like to proceed with this appointment?',
      buttonParams: [
        { id: 'status_confirm', title: 'Confirm ✅' },
        { id: 'status_reschedule', title: 'Reschedule 🔄' },
        { id: 'status_cancel', title: 'Cancel ❌' }
      ],
      whatsappPhoneNumberId
    });

    return { status: 'status_options_sent' };
  }
}

export default new AppointmentService();
