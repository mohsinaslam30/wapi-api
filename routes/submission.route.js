import express from "express";
import * as submissionController from "../controllers/submission.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { checkPermission } from "../middlewares/permission.js";

const router = express.Router();

router.use(authenticate);

router.get("/funnels", checkPermission('view.kanban_funnel'), submissionController.getSubmissionFunnels);
router.get("/:id/funnel-status", checkPermission('view.kanban_funnel'), submissionController.getSubmissionKanbanStatus);
router.post("/funnel/action", checkPermission('update.kanban_funnel'), submissionController.handleSubmissionKanbanAction);

router.get("/:form_id", checkPermission('view.submissions'), submissionController.getSubmissionsByFormId);
router.get("/:id/details", checkPermission('view.submissions'), submissionController.getSubmissionDetails);
// router.get("/:form_id/stats", checkPermission('view.submissions'), submissionController.getSubmissionStats);
// router.patch("/:id/status", checkPermission('update.submissions'), submissionController.updateSubmissionStatus);
router.delete("/:id", checkPermission('delete.submissions'), submissionController.deleteSubmission);

export default router;
