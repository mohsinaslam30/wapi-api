import mongoose from 'mongoose';
import seedDefaultSettings from './seedDefaultSettings.js';
import seedLandingPage from './seed-landing-page.js';
import { seedDefaultRoles } from './seedRole.js';
import seedDefaultPermissions from './seedPermission.js';
import createDefaultAdmin from './createDefaultAdmin.js';
import seedPages from './seedPages.js';
import seedCurrency from './seedCurrency.js';
import seedAdminTemplates from './seedAdminTemplates.js';
import seedAIModels from './seedAIModels.js';
import seedLanguage from './seedLanguage.js';
import { connectDB } from '../models/index.js';


export const seedAll = async () => {

    await connectDB();
    console.log('Database connected successfully');
    try {
        await seedCurrency();
        await seedLanguage();
        await seedDefaultSettings();
        await seedLandingPage();
        await seedDefaultRoles();
        await seedDefaultPermissions();
        await createDefaultAdmin();
        await seedPages();
        await seedAdminTemplates();
        await seedAIModels();

        console.log('All data seeded successfully!');
        process.exit(0)
    } catch (error) {
        console.error('Error during seeding process:', error);
        process.exit(1)
    }
};

seedAll();