const path = require('path');
const fs = require('fs-extra');

function basePath(...p) { return path.join(process.cwd(), ...p); }
function publicPath(...p) { return basePath('public', ...p); }

async function ensureInstallAssets() {
  const src = basePath('src/Packs');
  const dest = publicPath('install');
  await fs.ensureDir(dest);
  const mapping = {
    'css/vendors/animate.stub': 'css/vendors/animate.css',
    'css/vendors/bootstrap.stub': 'css/vendors/bootstrap.css',
    'css/vendors/feathericon.min.stub': 'css/vendors/feathericon.min.css',
    'css/vendors/feathericon.stub': 'css/vendors/feathericon.css',
    'css/install.stub': 'css/install.css',
    'images/background.stub': 'images/background.jpg',
    'js/bootstrap.min.stub': 'js/bootstrap.min.js',
    'js/install.stub': 'js/install.js',
    'js/jquery-3.3.1.min.stub': 'js/jquery-3.3.1.min.js',
    'js/popper.min.stub': 'js/popper.min.js',
    'js/feather-icon/feather.min.stub': 'js/feather-icon/feather.min.js',
    'css/app.stub': 'css/app.css'
  };
  for (const [k, v] of Object.entries(mapping)) {
    const from = path.join(src, k);
    const to = path.join(dest, v);
    if (!(await fs.pathExists(to))) {
      await fs.ensureDir(path.dirname(to));
      await fs.copy(from, to);
    }
  }
}

module.exports = {
  basePath,
  publicPath,
  ensureInstallAssets
};

