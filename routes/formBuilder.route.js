import express from "express";
import formBuilderController from "../controllers/formBuilder.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { checkPermission } from "../middlewares/permission.js";
import { checkPlanLimit, requireSubscription } from "../middlewares/plan-permission.js";

const router = express.Router();


router.use(authenticate);
router.use(requireSubscription);

router.route("/")
    .get(checkPermission('view.form_builder'), formBuilderController.getAllForms)
    .post(checkPlanLimit('forms'), checkPermission('create.form_builder'), formBuilderController.createForm);

router.route("/sync")
    .post(checkPermission('create.form_builder'), formBuilderController.syncMetaFlow);

router.route("/template")
    .get(checkPermission('view.form_builder'), formBuilderController.getFormTemplate);

router.route("/sync-status")
    .post(checkPermission('create.form_builder'), formBuilderController.syncFlowsStatusFromMeta);

router.route("/migrate")
    .post(checkPermission('create.form_builder'), formBuilderController.migrateFlows);

router.route("/:id/publish")
    .patch(checkPermission('update.form_builder'), formBuilderController.publishForm);

router.get("/meta-flows/:waba_id", checkPermission('view.form_builder'), formBuilderController.getAllMetaFlows);

router.route("/:id")
    .get(checkPermission('view.form_builder'), formBuilderController.getFormById)
    .patch(checkPermission('update.form_builder'), formBuilderController.updateForm)
    .delete(checkPermission('delete.form_builder'), formBuilderController.deleteForm);

export default router;
