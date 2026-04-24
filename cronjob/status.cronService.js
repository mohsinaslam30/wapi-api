import cron from 'node-cron';
import { Subscription } from '../models/index.js';

async function statusCronService() {
    cron.schedule('0 0 * * *', async () => {
        console.log('Running subscription expiry check cron job...');
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const cancelledResult = await Subscription.updateMany(
                {
                    status: { $in: ['active', 'trial'] },
                    current_period_end: { $lte: today },
                    auto_renew: false,
                    deleted_at: null
                },
                {
                    $set: {
                        status: 'cancelled',
                        expires_at: "$current_period_end"
                    }
                }
            );

            const expiredResult = await Subscription.updateMany(
                {
                    status: { $in: ['active', 'trial'] },
                    current_period_end: { $lte: today },
                    auto_rereturnDocument: 'after',
                    deleted_at: null
                },
                {
                    $set: {
                        status: 'expired',
                        expires_at: "$current_period_end"
                    }
                }
            );

            console.log(`Successfully processed: ${cancelledResult.modifiedCount} cancelled, ${expiredResult.modifiedCount} expired subscription(s).`);
        } catch (error) {
            console.error('Error in subscription expiry cron job:', error);
        }
    });

    console.log('Subscription expiry cron job scheduled.');
}


export default statusCronService;
