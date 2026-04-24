import { getCampaignWorker } from './campaign-queue.js';
import { getContactExportWorker } from './contact-export-queue.js';
const campaignWorker = getCampaignWorker();
const contactExportWorker = getContactExportWorker();

console.log('Queue workers initialized');

export {
  campaignWorker,
  contactExportWorker
};

process.on('SIGTERM', async () => {
  console.log('Shutting down queue workers...');
  await campaignWorker.close();
  if (contactExportWorker) {
    await contactExportWorker.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down queue workers...');
  await campaignWorker.close();
  if (contactExportWorker) {
    await contactExportWorker.close();
  }
  process.exit(0);
});
