import Setting from '../models/setting.model.js';
import Language from '../models/language.model.js';
import Currency from '../models/currency.model.js';


export async function fixSettingsData() {
  try {
    console.log('Starting settings data fix...');

    const settings = await Setting.findOne();
    if (!settings) {
      console.log('No settings found, nothing to fix.');
      return;
    }

    let needsUpdate = false;
    const updateData = {};

    if (typeof settings.maintenance_mode === 'string') {
      updateData.maintenance_mode = settings.maintenance_mode === 'true';
      needsUpdate = true;
      console.log('Fixed maintenance_mode field type');
    }

    if (typeof settings.maintenance_allowed_ips === 'string') {
      try {
        updateData.maintenance_allowed_ips = JSON.parse(settings.maintenance_allowed_ips);
      } catch {
        updateData.maintenance_allowed_ips = settings.maintenance_allowed_ips
          .split(',')
          .map(item => item.trim())
          .filter(item => item);
      }
      needsUpdate = true;
      console.log('Fixed maintenance_allowed_ips field type');
    }

    if (typeof settings.allowed_file_upload_types === 'string') {
      try {
        updateData.allowed_file_upload_types = JSON.parse(settings.allowed_file_upload_types);
      } catch {
        updateData.allowed_file_upload_types = settings.allowed_file_upload_types
          .split(',')
          .map(item => item.trim())
          .filter(item => item);
      }
      needsUpdate = true;
      console.log('Fixed allowed_file_upload_types field type');
    }

    if (settings.whatsapp_webhook_url && typeof settings.whatsapp_webhook_url === 'string') {
      const baseUrl = process.env.APP_URL || `http://localhost:5000`;

      const doubleBaseUrlPattern = new RegExp(`${baseUrl}\\s*/\\s*${baseUrl}`, 'i');
      if (doubleBaseUrlPattern.test(settings.whatsapp_webhook_url)) {
        const pathPart = settings.whatsapp_webhook_url.replace(baseUrl, '').replace('//', '/');
        updateData.whatsapp_webhook_url = `${baseUrl}${pathPart}`.replace('//', '/');
        needsUpdate = true;
        console.log('Fixed duplicated base URL in whatsapp_webhook_url');
      }

      const protocolMatch = settings.whatsapp_webhook_url.match(/https?:\/\/[^\/]+/);
      if (protocolMatch && settings.whatsapp_webhook_url.includes(protocolMatch[0], protocolMatch[0].length + 1)) {
        const parts = settings.whatsapp_webhook_url.split('/');
        const uniqueParts = [];
        const seenBaseUrls = new Set();

        for (const part of parts) {
          if (part.startsWith('http') && part.includes('://')) {
            if (seenBaseUrls.has(part)) {
              continue;
            }
            seenBaseUrls.add(part);
          }
          uniqueParts.push(part);
        }

        updateData.whatsapp_webhook_url = uniqueParts.join('/').replace(/\/+/g, '/');
        needsUpdate = true;
        console.log('Fixed duplicated base URL in whatsapp_webhook_url');
      }
    }

    if (settings.show_whatsapp_config === undefined) {
      updateData.show_whatsapp_config = true;
      needsUpdate = true;
      console.log('Initialized show_whatsapp_config');
    }

    if (settings.show_email_config === undefined) {
      updateData.show_email_config = true;
      needsUpdate = true;
      console.log('Initialized show_email_config');
    }

    if (!settings.default_language) {
      const defaultLang = await Language.findOne({ is_default: true, deleted_at: null });
      if (defaultLang) {
        updateData.default_language = defaultLang.locale;
        needsUpdate = true;
        console.log('Default language initialized from Language model');
      } else {
        const fallbackLang = await Language.findOne({ locale: 'en', deleted_at: null });
        if (fallbackLang) {
          fallbackLang.is_default = true;
          await fallbackLang.save();
          updateData.default_language = fallbackLang.locale;
          needsUpdate = true;
          console.log('Fallback to English as default language');
        }
      }
    }


    if (!settings.default_currency) {
      const defaultCurr = await Currency.findOne({ is_default: true, deleted_at: null });
      if (defaultCurr) {
        updateData.default_currency = defaultCurr._id;
        needsUpdate = true;
        console.log('Default currency initialized from Currency model');
      } else {
        const fallbackCurr = await Currency.findOne({ code: 'INR', deleted_at: null });
        if (fallbackCurr) {
          fallbackCurr.is_default = true;
          await fallbackCurr.save();
          updateData.default_currency = fallbackCurr._id;
          needsUpdate = true;
          console.log('Fallback to INR as default currency');
        }
      }
    }

    if (needsUpdate) {
      await Setting.findByIdAndUpdate(settings._id, updateData);
      console.log('Settings data fixed successfully!');
    } else {
      console.log('No settings data needed fixing.');
    }
  } catch (error) {
    console.error('Error fixing settings data:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fixSettingsData()
    .then(() => {
      console.log('Settings data fix completed.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Settings data fix failed:', error);
      process.exit(1);
    });
}
