import cron from 'node-cron';
import { Subscription, User, Plan } from '../models/index.js';
import EmailTemplateService from '../services/email-template.service.js';

async function statusCronService() {
    cron.schedule('0 0 * * *', async () => {
        console.log('Running subscription expiry check cron job...');
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const expiredSubs = await Subscription.find({
                status: { $in: ['active', 'trial'] },
                current_period_end: { $lte: today, $ne: null },
                deleted_at: null
            }).populate('user_id plan_id');

            for (const sub of expiredSubs) {
                if (sub.plan_id?.billing_cycle === 'lifetime') continue;
                const oldStatus = sub.status;
                sub.status = sub.auto_renew ? 'expired' : 'canceled';
                sub.expires_at = sub.current_period_end;
                await sub.save();

                if (sub.user_id && sub.user_id.email) {
                    await EmailTemplateService.send('plan-expiration', sub.user_id.email, {
                        user_name: sub.user_id.name,
                        plan_name: sub.plan_id?.name || 'Your Plan'
                    });
                }
            }

            const reminderDate = new Date();
            reminderDate.setDate(today.getDate() + 3);
            reminderDate.setHours(0, 0, 0, 0);

            const upcomingExpirations = await Subscription.find({
                status: { $in: ['active', 'trial'] },
                current_period_end: {
                    $gte: reminderDate,
                    $lt: new Date(reminderDate.getTime() + 24 * 60 * 60 * 1000),
                    $ne: null
                },
                deleted_at: null
            }).populate('user_id plan_id');

            for (const sub of upcomingExpirations) {
                if (sub.plan_id?.billing_cycle === 'lifetime') continue;
                if (sub.user_id && sub.user_id.email) {
                    await EmailTemplateService.send('plan-renewal', sub.user_id.email, {
                        user_name: sub.user_id.name,
                        plan_name: sub.plan_id?.name || 'Your Plan',
                        days_remaining: 3,
                        renewal_url: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/billing_plans` : ''
                    });
                }
            }

            console.log(`Processed ${expiredSubs.length} expirations and ${upcomingExpirations.length} reminders.`);
        } catch (error) {
            console.error('Error in subscription expiry cron job:', error);
        }
    });

    console.log('Subscription expiry cron job scheduled.');
}


export default statusCronService;
