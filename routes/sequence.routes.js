import express from 'express';
import {
    createSequence,
    getSequences,
    getSequenceById,
    updateSequence,
    deleteSequence,
    createSequenceStep,
    updateSequenceStep,
    deleteSequenceStep,
    reorderSequenceSteps
} from '../controllers/sequence.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.post('/', checkPermission('create.sequences'), createSequence);
router.get('/', checkPermission('view.sequences'), getSequences);
router.get('/:id', checkPermission('view.sequences'), getSequenceById);
router.put('/:id', checkPermission('update.sequences'), updateSequence);
router.delete('/:id', checkPermission('delete.sequences'), deleteSequence);

router.post('/steps', checkPermission('create.sequences'), createSequenceStep);
router.put('/steps/reorder', checkPermission('update.sequences'), reorderSequenceSteps);
router.put('/steps/:id', checkPermission('update.sequences'), updateSequenceStep);
router.delete('/steps/:id', checkPermission('delete.sequences'), deleteSequenceStep);

export default router;
