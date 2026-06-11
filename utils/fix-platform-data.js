import Template from '../models/template.model.js';
import Campaign from '../models/campaign.model.js';
import Sequence from '../models/sequence.model.js';
import Message from '../models/message.model.js';
import AutomationFlow from '../models/automation-flow.model.js';
import SocialMediaPost from '../models/social-media-post.model.js';
import MessageBot from '../models/message-bot.model.js';
import ProcessedSocialComment from '../models/processed-social-comment.model.js';
import Webhook from '../models/webhook.model.js';
import SocialAutomation from '../models/social-automation.model.js';

export async function fixPlatformData() {
  try {
    console.log('Starting platform data fix...');

    const models = [
      { name: 'Template', model: Template },
      { name: 'Campaign', model: Campaign },
      { name: 'Sequence', model: Sequence },
      { name: 'Message', model: Message },
      { name: 'AutomationFlow', model: AutomationFlow },
      { name: 'MessageBot', model: MessageBot },
      { name: 'Webhook', model: Webhook }
    ];

    for (const { name, model } of models) {
      try {
        const result = await model.updateMany(
          { platform: { $exists: false } },
          { $set: { platform: 'whatsapp' } }
        );
        if (result.modifiedCount > 0) {
          console.log(`Updated ${result.modifiedCount} documents in ${name} collection to set platform to 'whatsapp'.`);
        }
      } catch (err) {
        console.error(`Error updating ${name}:`, err.message);
      }
    }

    console.log('Platform data fix completed.');
  } catch (error) {
    console.error('Error fixing platform data:', error);
  }
}
