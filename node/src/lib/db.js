import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';

let dbConnection = null;
let User = null;


function reloadEnvVariables() {
  try {
    const envConfig = dotenv.parse(fs.readFileSync('.env'));

    for (const key in envConfig) {
      process.env[key] = envConfig[key];
    }

    console.log('Environment variables reloaded from .env file');
    return true;
  } catch (error) {
    console.error('Error reloading environment variables:', error);
    return false;
  }
}


async function configureDb(cfg) {
  const dbPort = cfg.DB_PORT || 27017;
  let mongoUri;
  if (cfg.DB_USERNAME && cfg.DB_PASSWORD) {
    const authString = `${encodeURIComponent(cfg.DB_USERNAME)}:${encodeURIComponent(cfg.DB_PASSWORD)}@`;
    mongoUri = `mongodb://${authString}${cfg.DB_HOST}:${dbPort}/${cfg.DB_DATABASE}`;
  } else {
    mongoUri = `mongodb://${cfg.DB_HOST}:${dbPort}/${cfg.DB_DATABASE}`;
  }
  console.log("mongoUri" , mongoUri);

  process.env.MONGODB_URI = mongoUri;

  dbConnection = await mongoose.connect(mongoUri);
}


async function connectDb() {
  if (!dbConnection) throw new Error('DB not configured');

  await new Promise(resolve => setTimeout(resolve, 500));

  if (dbConnection.connection.readyState !== 1) {
    const error = dbConnection.connection.readyState === 0
      ? 'Failed to connect to MongoDB'
      : (dbConnection.connection.readyState === 3
        ? 'MongoDB connection disconnected'
        : 'MongoDB connection failed');
    throw new Error(error);
  }
}


async function runMigrations() {
  return Promise.resolve();
}


async function writeEnv(cfg, admin) {
  try {
    let existingContent = '';
    if (await fs.pathExists('.env')) {
      existingContent = await fs.readFile('.env', 'utf8');
    }

    const existingVars = {};
    existingContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        existingVars[key.trim()] = valueParts.join('=').trim();
      }
    });

    const mergedVars = {
      ...existingVars,
      DB_HOST: cfg.DB_HOST,
      DB_PORT: cfg.DB_PORT,
      DB_DATABASE: cfg.DB_DATABASE,
      DB_USERNAME: cfg.DB_USERNAME || '',
      DB_PASSWORD: cfg.DB_PASSWORD || '',
      MONGODB_URI: cfg.DB_USERNAME && cfg.DB_PASSWORD
        ? `mongodb://${encodeURIComponent(cfg.DB_USERNAME)}:${encodeURIComponent(cfg.DB_PASSWORD)}@${cfg.DB_HOST}:${cfg.DB_PORT || 27017}/${cfg.DB_DATABASE}`
        : `mongodb://${cfg.DB_HOST}:${cfg.DB_PORT || 27017}/${cfg.DB_DATABASE}`,
      ADMIN_NAME: `${admin.first_name} ${admin.last_name}`,
      ADMIN_EMAIL: admin.email,
      ADMIN_PASSWORD: admin.password
    };
    console.log("mergedVars" , mergedVars)
    const newContent = Object.entries(mergedVars)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n';

    await fs.writeFile('.env', newContent);
  } catch (error) {
    console.log('Error writing .env file:', error);

    const authString = cfg.DB_USERNAME && cfg.DB_PASSWORD
      ? `${encodeURIComponent(cfg.DB_USERNAME)}:${encodeURIComponent(cfg.DB_PASSWORD)}@`
      : '';
    const mongoUri = `mongodb://${authString}${cfg.DB_HOST}:${cfg.DB_PORT || 27017}/${cfg.DB_DATABASE}`;

    const lines = [
      `DB_HOST=${cfg.DB_HOST}`,
      `DB_PORT=${cfg.DB_PORT}`,
      `DB_DATABASE=${cfg.DB_DATABASE}`,
      `DB_USERNAME=${cfg.DB_USERNAME || ''}`,
      `DB_PASSWORD=${cfg.DB_PASSWORD || ''}`,
      `MONGODB_URI=${mongoUri}`,
      `ADMIN_NAME=${admin.first_name.trim()} ${admin.last_name.trim()}`,
      `ADMIN_EMAIL=${admin.email}`,
      `ADMIN_PASSWORD=${admin.password}`
    ];

    await fs.appendFile('.env', '\n' + lines.join('\n') + '\n');
  }
}


async function reloadAndReconnect() {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('Disconnected from MongoDB');
    }

    reloadEnvVariables();

    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error('MONGODB_URI not found in environment variables after reload');
    }

    dbConnection = await mongoose.connect(mongoUri);

    console.log('Reconnected to MongoDB successfully with reloaded environment');

    return { success: true, message: 'Database reconnected successfully after environment reload' };
  } catch (error) {
    console.error('Error reloading environment and reconnecting to database:', error);
    return { success: false, message: 'Failed to reload environment and reconnect to database', error: error.message };
  }
}


async function ensureDatabase(cfg) {
  return Promise.resolve();
}

export {
  configureDb,
  connectDb,
  runMigrations,
  writeEnv,
  reloadAndReconnect
};
