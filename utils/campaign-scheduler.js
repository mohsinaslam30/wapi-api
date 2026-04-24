import Campaign from '../models/campaign.model.js';
import { processCampaignInBackground } from './campaign-processing.js';

class CampaignScheduler {
  constructor() {
    this.running = false;
    this.interval = null;
    this.checkIntervalMs = 60000;
  }

  start() {
    if (this.running) {
      console.log('Campaign scheduler is already running');
      return;
    }

    this.running = true;
    console.log('Starting campaign scheduler...');

    this.checkAndProcessScheduledCampaigns();

    this.interval = setInterval(() => {
      this.checkAndProcessScheduledCampaigns();
    }, this.checkIntervalMs);
  }

  stop() {
    if (!this.running) {
      console.log('Campaign scheduler is not running');
      return;
    }

    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log('Campaign scheduler stopped');
  }

  async checkAndProcessScheduledCampaigns() {
    try {
      if (!this.running) return;

      const scheduledCampaigns = await Campaign.getScheduledCampaigns();

      if (scheduledCampaigns.length === 0) {
        return;
      }

      console.log(`Found ${scheduledCampaigns.length} scheduled campaigns to process`);

      for (const campaign of scheduledCampaigns) {
        try {
          console.log(`Processing scheduled campaign: ${campaign.name} (${campaign._id})`);

          campaign.status = 'sending';
          campaign.sent_at = new Date();
          await campaign.save();

          processCampaignInBackground(campaign);

        } catch (error) {
          console.error(`Error processing scheduled campaign ${campaign._id}:`, error);

          campaign.status = 'failed';
          campaign.error_log.push({
            timestamp: new Date(),
            error: `Scheduler error: ${error.message}`
          });
          await campaign.save();
        }
      }

    } catch (error) {
      console.error('Error in campaign scheduler:', error);
    }
  }

  getStatus() {
    return {
      running: this.running,
      checkIntervalMs: this.checkIntervalMs,
      nextCheck: this.running ? new Date(Date.now() + this.checkIntervalMs) : null
    };
  }
}

export default new CampaignScheduler();
