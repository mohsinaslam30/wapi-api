import fs from 'fs-extra';
import dotenv from 'dotenv';

/**
 * Reload environment variables from .env file
 */
function reloadEnvVariables() {
  try {
    const envConfig = dotenv.parse(fs.readFileSync('.env'));
    
    for (const key in envConfig) {
      process.env[key] = envConfig[key];
    }
    
    console.log('✅ Environment variables reloaded from .env file');
    return true;
  } catch (error) {
    console.error('❌ Error reloading environment variables:', error.message);
    return false;
  }
}

export default reloadEnvVariables;
