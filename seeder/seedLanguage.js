import { Language } from '../models/index.js';
import fs from 'fs';
import path from 'path';

async function seedLanguage() {
  try {
    const defaultLocale = 'en';
    const languages = [
      { name: 'English', locale: 'en', is_rtl: false, is_active: true, is_default: true, sort_order: 1 },
      { name: 'Arabic', locale: 'ar', is_rtl: true, is_active: true, is_default: false, sort_order: 2 },
      { name: 'Spanish', locale: 'es', is_rtl: false, is_active: true, is_default: false, sort_order: 3 },
      { name: 'Portuguese', locale: 'pt', is_rtl: false, is_active: true, is_default: false, sort_order: 4 },
      { name: 'German', locale: 'de', is_rtl: false, is_active: true, is_default: false, sort_order: 5 },
      { name: 'French', locale: 'fr', is_rtl: false, is_active: true, is_default: false, sort_order: 6 },
    ];

    for (const languageData of languages) {
      // 1. Determine which locale directory to use (current locale or English fallback)
      let sourceLocale = languageData.locale;
      const localePath = path.join(process.cwd(), 'locales', sourceLocale);
      
      if (!fs.existsSync(localePath)) {
        sourceLocale = defaultLocale;
      }
      
      const sourcePath = path.join(process.cwd(), 'locales', sourceLocale);

      // 2. Load JSON files from the determined source path
      const loadJson = (filename) => {
        const filePath = path.join(sourcePath, filename);
        if (fs.existsSync(filePath)) {
          try {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
          } catch (e) {
            console.warn(`[SeedLanguage] Failed to parse ${filePath}, falling back.`);
          }
        }
        
        // Fallback to English if the specific file is missing in the locale folder
        if (sourceLocale !== defaultLocale) {
          const fallbackPath = path.join(process.cwd(), 'locales', defaultLocale, filename);
          if (fs.existsSync(fallbackPath)) {
            return JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
          }
        }
        return {};
      };

      const frontJson = loadJson('front.json');
      const adminJson = loadJson('admin.json');
      const appJson = loadJson('app.json');

      const frontFile = path.join('uploads', 'languages', languageData.locale, 'front.json');
      const adminFile = path.join('uploads', 'languages', languageData.locale, 'admin.json');
      const appFile = path.join('uploads', 'languages', languageData.locale, 'app.json');

      const writeFile = (filePath, json) => {
        const absolutePath = path.resolve(filePath);
        const dirname = path.dirname(absolutePath);
        if (!fs.existsSync(dirname)) {
          fs.mkdirSync(dirname, { recursive: true });
        }
        fs.writeFileSync(absolutePath, JSON.stringify(json, null, 2), 'utf8');
      };

      writeFile(frontFile, frontJson);
      writeFile(adminFile, adminJson);
      writeFile(appFile, appJson);

      await Language.findOneAndUpdate(
        { locale: languageData.locale },
        { 
          $set: {
            ...languageData,
            front_translation_file: frontFile,
            admin_translation_file: adminFile,
            app_translation_file: appFile
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
    }

    console.log('Languages seeded successfully!');
  } catch (error) {
    console.error('Error seeding languages:', error);
    throw error;
  }
}

export default seedLanguage;
