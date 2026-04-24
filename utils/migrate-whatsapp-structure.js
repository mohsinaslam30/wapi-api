import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import path from 'path';
import config from '../config/config.js';
import { connectDB } from '../models/index.js';
import { WhatsappWaba, WhatsappPhoneNumber, WhatsappConnection } from '../models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const env = process.env.NODE_ENV || 'development';
const envConfig = config[env];

await connectDB();

console.log('Starting migration from old WhatsApp connection structure to new WABA/Phone structure...');

try {
  const oldConnections = await WhatsappConnection.find({
    deleted_at: null
  }).lean();

  console.log(`Found ${oldConnections.length} existing connections to migrate`);

  let migratedWabas = 0;
  let migratedPhones = 0;

  for (const connection of oldConnections) {
    try {
      let waba = await WhatsappWaba.findOne({
        user_id: connection.user_id,
        whatsapp_business_account_id: connection.whatsapp_business_account_id,
        deleted_at: null
      });

      if (!waba) {
        waba = await WhatsappWaba.create({
          user_id: connection.user_id,
          whatsapp_business_account_id: connection.whatsapp_business_account_id,
          app_id: connection.app_id,
          access_token: connection.access_token,
          name: connection.name,
          is_active: connection.is_active
        });
        migratedWabas++;
        console.log(`Created WABA: ${waba._id} for user ${connection.user_id}`);
      }

      let phoneNumber = await WhatsappPhoneNumber.findOne({
        user_id: connection.user_id,
        phone_number_id: connection.phone_number_id,
        deleted_at: null
      });

      if (!phoneNumber) {
        phoneNumber = await WhatsappPhoneNumber.create({
          user_id: connection.user_id,
          waba_id: waba._id,
          phone_number_id: connection.phone_number_id,
          display_phone_number: connection.registred_phone_number,
          verified_name: connection.name,
          is_active: connection.is_active
        });
        migratedPhones++;
        console.log(`Created Phone Number: ${phoneNumber._id} for user ${connection.user_id}`);
      }

      await WhatsappConnection.findByIdAndUpdate(connection._id, {
        deleted_at: new Date()
      });

    } catch (err) {
      console.error(`Error migrating connection ${connection._id}:`, err.message);
    }
  }

  console.log(`Migration completed successfully!`);
  console.log(`- Migrated WABAs: ${migratedWabas}`);
  console.log(`- Migrated Phone Numbers: ${migratedPhones}`);

  const totalWabas = await WhatsappWaba.countDocuments({ deleted_at: null });
  const totalPhones = await WhatsappPhoneNumber.countDocuments({ deleted_at: null });
  const remainingOldConnections = await WhatsappConnection.countDocuments({ deleted_at: null });

  console.log(`\nVerification:`);
  console.log(`- Total WABAs in new structure: ${totalWabas}`);
  console.log(`- Total Phone Numbers in new structure: ${totalPhones}`);
  console.log(`- Remaining old connections: ${remainingOldConnections}`);

  process.exit(0);

} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
