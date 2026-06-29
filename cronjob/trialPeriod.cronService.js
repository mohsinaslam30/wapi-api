import cron from 'node-cron';
import mongoose from 'mongoose';
import { Setting, Subscription, User } from '../models/index.js';

async function trialPeriodCronService() {
    cron.schedule('0 1 * * *', async () => {
        console.log('Running trial expired user deletion cron job...');
        try {
            const setting = await Setting.findOne();
            if (!setting || !setting.trial_expired_delete_days || setting.trial_expired_delete_days <= 0) {
                return;
            }

            const thresholdDays = setting.trial_expired_delete_days;
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - thresholdDays);

            const expiredSubscriptions = await Subscription.find({
                status: 'expired',
                deleted_at: null,
                expires_at: { $lte: thresholdDate }
            });

            if (expiredSubscriptions.length === 0) {
                return;
            }

            console.log(`Found ${expiredSubscriptions.length} subscription(s) exceeding the trial expiry threshold (${thresholdDays} days). Proceeding with hard deletion...`);

            const userIds = [...new Set(expiredSubscriptions.map(sub => sub.user_id.toString()))];

            for (const userId of userIds) {
                try {
                    console.log(`Deleting all data for user ID: ${userId}`);


                    for (const modelName in mongoose.models) {
                        const model = mongoose.models[modelName];
                        if (model.schema && model.schema.path('user_id')) {
                            const result = await model.deleteMany({ user_id: userId });
                            if (result.deletedCount > 0) {
                                console.log(`- Deleted ${result.deletedCount} records from ${modelName}`);
                            }
                        }
                    }

                    const userResult = await User.findByIdAndDelete(userId);
                    if (userResult) {
                        console.log(`Successfully completed hard deletion for user ID: ${userId}`);
                    }
                } catch (err) {
                    console.error(`Error deleting data for user ID: ${userId}`, err);
                }
            }
        } catch (error) {
            console.error('Error in trial expired user deletion cron job:', error);
        }
    });

    console.log('Trial expired user deletion cron job scheduled.');
}

export default trialPeriodCronService;
