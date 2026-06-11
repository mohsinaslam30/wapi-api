import express from 'express';
import {
    createSnippet,
    listSnippets,
    deleteSnippet,
    getSnippetData,
    getWidgetScript
} from '../controllers/plan-snippet.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

router.get('/widget.js', getWidgetScript);
router.get('/:token/data', getSnippetData);

router.use(authenticate);
router.get('/', listSnippets);
router.post('/', createSnippet);
router.delete('/:id', deleteSnippet);

export default router;
