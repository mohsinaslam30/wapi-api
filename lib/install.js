import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


class InstallWizard {
  constructor(app) {
    this.app = app;
    this.installApp = null;
    this.mountPath = '/install';
  }


  async init(mountPath = '/install') {
    this.mountPath = mountPath;

    this.installApp = express();

    const viewsPath = path.join(__dirname, '../node/views');
    this.installApp.set('view engine', 'ejs');
    this.installApp.set('views', viewsPath);

    const publicInstallPath = path.join(process.cwd(), 'public', 'install');
    this.installApp.use('/install', express.static(publicInstallPath));

    this.installApp.use(express.urlencoded({ extended: true }));
    this.installApp.use(express.json());

    const router = (await import('../node/routes/index.js')).default;

    const setRouteName = (name) => (req, res, next) => {
      req.app.locals.currentRouteName = name;
      next();
    };

    this.installApp.use((req, res, next) => {
      if (!req.app.locals.currentRouteName) {
        req.app.locals.currentRouteName = '';
      }
      next();
    });

    this.installApp.use(router);

    this.app.use(this.mountPath, this.installApp);

  }


  async isInstalled() {
    try {
      const { migSync } = await import('../node/src/lib/helpers.js');
      return await migSync();
    } catch (error) {
      console.error('Error checking installation status:', error);
      return false;
    }
  }


  async getStatus() {
    try {
      const { migSync, datSync, liSync } = await import('../node/src/lib/helpers.js');
      console.log("calledd");
      return {
        isInstalled: await migSync(),
        hasDatabase: await datSync(),
        hasLicense: await liSync(),
        requirements: true,
        directories: true
      };
    } catch (error) {
      console.log('Error getting installation status:', error);
      return {
        isInstalled: false,
        hasDatabase: false,
        hasLicense: false,
        requirements: false,
        directories: false
      };
    }
  }


  async uninstall() {
    try {
      const fs = await import('fs-extra');
      const { publicPath } = await import('../node/src/lib/paths.js');

      const filesToRemove = [
        publicPath('_log.dic.xml'),
        publicPath('fzip.li.dic'),
        publicPath('cj7kl89.tmp'),
        publicPath('_migZip.xml'),
        publicPath('installation.json')
      ];

      for (const file of filesToRemove) {
        try {
          await fs.default.remove(file);
        } catch (e) {
        }
      }

      console.log('✅ Installation markers removed');
      return true;
    } catch (error) {
      console.error('Error uninstalling:', error);
      return false;
    }
  }
}

export default InstallWizard;

let installWizard = null;

export async function initializeInstaller(app) {
  try {
    installWizard = new InstallWizard(app);
    await installWizard.init('/install');

    return installWizard;
  } catch (error) {
    console.error('❌ Failed to initialize installer:', error.message);
    throw error;
  }
}

export function createInstallationMiddleware() {
  return async (req, res, next) => {
    if (
      req.path.startsWith('/install') ||
      req.path.startsWith('/uploads') ||
      req.path === '/favicon.ico' ||
      req.path === '/health'
    ) {
      return next();
    }

    try {
      const { migSync } = await import('../node/src/lib/helpers.js');
      const isInstalled = await migSync();

      if (!isInstalled) {
        console.log('⚠️ Installation not complete - redirecting to /install');
        return res.redirect('/install');
      }
    } catch (error) {
      console.warn('⚠️ Could not check installation status:', error.message);
    }

    next();
  };
}
