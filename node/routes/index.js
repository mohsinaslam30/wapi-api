import { Router } from 'express';
import {
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
} from '../src/controllers/InstallController.js';

const router = Router();

const setRouteName = (name) => (req, res, next) => {
  req.app.locals.currentRouteName = name;
  next();
};

router.get('/unblock/:project_id', setRouteName('install.unblock.show'), getUnblock);
router.get('/block/:project_id', setRouteName('install.block.api'), getBlockProject);
router.post('/resetLicense', setRouteName('install.resetLicense'), postResetLicense);
router.get('/resetLicense', setRouteName('install.resetLicense.get'), postResetLicense);
router.get('/erase/:project_id', setRouteName('install.erase'), getErase);

router.post('/block/license/verify', setRouteName('install.unblock'), ...[].concat(postUnblockVerify));
router.get('/block', setRouteName('install.block.setup'), getBlockSetup);

router.get('/', setRouteName('install.requirements'), getRequirements);
router.get('/requirements', setRouteName('install.requirements'), getRequirements);
router.get('/directories', setRouteName('install.directories'), getDirectories);
router.get('/database', setRouteName('install.database'), getDatabase);
router.get('/verify', setRouteName('install.verify.setup'), getVerifySetup);
router.post('/verify', setRouteName('install.verify'), ...[].concat(postLicense));
router.get('/license', setRouteName('install.license'), getLicense);
router.post('/license', setRouteName('install.license.setup'), ...[].concat(postLicense));
router.post('/database', setRouteName('install.database.config'), ...[].concat(postDatabaseConfig));
router.get('/completed', setRouteName('install.completed'), getCompleted);
router.get('/run-seeder', setRouteName('install.completed'), runSeeder);

export default router;
