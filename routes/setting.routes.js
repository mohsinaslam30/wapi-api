import express from "express";
import {
  getAllSettings,
  updateSetting,
  testMail,
  updateStripeSettings,
  getStripeSettings,
  updateRazorpaySettings,
  getRazorpaySettings,
  updatePayPalSettings,
  getPayPalSettings,
  updateGoogleSettings,
  getGoogleSettings
} from "../controllers/setting.controller.js";
import { authenticateUser, authorizeAdmin, authenticate } from "../middlewares/auth.js";
import { uploader } from "../utils/upload.js";
import { checkPermission } from "../middlewares/permission.js";

const router = express.Router();

const logoFields = [
  { name: 'favicon_url', maxCount: 1 },
  { name: 'logo_light_url', maxCount: 1 },
  { name: 'logo_dark_url', maxCount: 1 },
  { name: 'sidebar_light_logo_url', maxCount: 1 },
  { name: 'sidebar_dark_logo_url', maxCount: 1 }
];


router.get("/", getAllSettings);


router.use(authenticate);


router.put(
  "/",
  checkPermission('update.settings'),
  uploader('attachments').fields(logoFields),
  updateSetting
);

router.post("/mail/test",authenticate, checkPermission('update.settings'), testMail);

router
  .route("/stripe")
  .get(checkPermission('view.settings'), getStripeSettings)
  .put(checkPermission('update.settings'), updateStripeSettings);

router
  .route("/razorpay")
  .get(checkPermission('view.settings'), getRazorpaySettings)
  .put(checkPermission('update.settings'), updateRazorpaySettings);

router
  .route("/paypal")
  .get(checkPermission('view.settings'), getPayPalSettings)
  .put(checkPermission('update.settings'), updatePayPalSettings);

router
  .route("/google")
  .get(checkPermission('view.settings'), getGoogleSettings)
  .put(checkPermission('update.settings'), updateGoogleSettings);

export default router;
