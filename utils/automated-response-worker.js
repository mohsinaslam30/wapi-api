import { Contact, WabaConfiguration, WhatsappPhoneNumber, ChatAssignment } from '../models/index.js';
import { isWithinWorkingHours, sendAutomatedReply } from './automated-response.service.js';
import mongoose from 'mongoose';

class AutomatedResponseWorker {
    constructor() {
        this.interval = null;
        this.checkIntervalMs = 60000;
        this.running = false;
    }

    start() {
        if (this.running) return;
        this.running = true;
        console.log('Starting Automated Response Worker...');

        this.process();
        this.interval = setInterval(() => this.process(), this.checkIntervalMs);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.running = false;
        console.log('Automated Response Worker stopped.');
    }

    async process() {
        try {
            const configs = await WabaConfiguration.find({
                $or: [
                    { 'delayed_reply.id': { $ne: null } },
                    { 'reengagement_message.id': { $ne: null } }
                ]
            });

            for (const config of configs) {
                await this.handleDelayedReplies(config);
                await this.handleReengagements(config);
            }
        } catch (error) {
            console.error('Error in AutomatedResponseWorker process:', error);
        }
    }

    async handleDelayedReplies(config) {
        try {
            const { waba_id, delayed_reply } = config;
            if (!delayed_reply || !delayed_reply.id) return;

            const delayMinutes = delayed_reply.delay_minutes || 15;
            const delayMs = delayMinutes * 60 * 1000;
            const now = new Date();

            const phone = await WhatsappPhoneNumber.findOne({ waba_id }).lean();
            if (!phone) return;

            const open = await isWithinWorkingHours(waba_id);
            if (!open) return;

            const waitingContacts = await Contact.find({
                created_by: phone.user_id,
                deleted_at: null,
                last_incoming_message_at: { $ne: null },
                $or: [
                    { last_outgoing_message_at: null },
                    { $expr: { $gt: ["$last_incoming_message_at", "$last_outgoing_message_at"] } }
                ],
                last_incoming_message_at: { $lt: new Date(now - delayMs) }
            });

            for (const contact of waitingContacts) {
                console.log(`Sending delayed reply to ${contact.phone_number} (waiting ${delayMinutes}m)`);
                await sendAutomatedReply({
                    wabaId: waba_id,
                    contactId: contact._id,
                    replyType: delayed_reply.type,
                    replyId: delayed_reply.id,
                    senderNumber: contact.phone_number,
                    incomingText: '',
                    userId: phone.user_id,
                    whatsappPhoneNumberId: phone._id
                });
            }
        } catch (error) {
            console.error(`Error handling delayed replies for WABA ${config.waba_id}:`, error);
        }
    }

    async handleReengagements(config) {
        try {
            const { waba_id, reengagement_message } = config;
            if (!reengagement_message || !reengagement_message.id) return;

            const now = new Date();
            const reengageStart = new Date(now - 23.9 * 60 * 60 * 1000);
            const reengageEnd = new Date(now - 23 * 60 * 60 * 1000);

            const phone = await WhatsappPhoneNumber.findOne({ waba_id }).lean();
            if (!phone) return;

            const contactsToReengage = await Contact.find({
                created_by: phone.user_id,
                deleted_at: null,
                last_incoming_message_at: { $gte: reengageStart, $lte: reengageEnd },
                $or: [
                    { last_outgoing_message_at: null },
                    { $expr: { $gt: ["$last_incoming_message_at", "$last_outgoing_message_at"] } }
                ]
            });

            for (const contact of contactsToReengage) {
                const assignment = await ChatAssignment.findOne({
                    sender_number: contact.phone_number,
                    whatsapp_phone_number_id: phone._id
                }).lean();

                if (assignment && assignment.is_solved) {
                    continue;
                }

                console.log(`Sending re-engagement message to ${contact.phone_number} (almost 24h)`);
                await sendAutomatedReply({
                    wabaId: waba_id,
                    contactId: contact._id,
                    replyType: reengagement_message.type,
                    replyId: reengagement_message.id,
                    senderNumber: contact.phone_number,
                    incomingText: '',
                    userId: phone.user_id,
                    whatsappPhoneNumberId: phone._id
                });
            }
        } catch (error) {
            console.error(`Error handling re-engagements for WABA ${config.waba_id}:`, error);
        }
    }
}

export default new AutomatedResponseWorker();
