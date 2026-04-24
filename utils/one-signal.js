import axios from 'axios';


export const sendPushNotification = async ({ userIds, heading, content, data = {} }) => {
    try {
        const appId = process.env.ONESIGNAL_APP_ID;
        const apiKey = process.env.ONESIGNAL_API_KEY;

        if (!appId || !apiKey) {
            console.warn('OneSignal App ID or API Key missing. Skipping push notification.');
            return;
        }

        if (!userIds || userIds.length === 0) {
            console.warn('No user IDs provided for push notification.');
            return;
        }
        console.log("userIds.map(id => id.toString())" , userIds.map(id => id.toString()))
        const response = await axios.post(
            'https://onesignal.com/api/v1/notifications',
            {
                app_id: appId,
                include_player_ids : userIds.map(id => id.toString()),
                headings: { en: heading },
                contents: { en: content },
                data: data
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${apiKey}`
                }
            }
        );

        console.log('OneSignal notification sent:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error sending OneSignal notification:', error.response?.data || error.message);
        throw error;
    }
};

export default {
    sendPushNotification
};
