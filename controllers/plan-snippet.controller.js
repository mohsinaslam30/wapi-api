import { PlanSnippet, Plan, Setting } from '../models/index.js';
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const generateToken = () => randomBytes(12).toString('hex');

export const createSnippet = async (req, res) => {
    try {
        const { name, plan_ids, theme_color, title, description } = req.body || {};

        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Snippet name is required' });
        }

        if (!plan_ids || !Array.isArray(plan_ids) || plan_ids.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one plan must be selected' });
        }

        const validIds = plan_ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid plan IDs provided' });
        }

        const snippet = new PlanSnippet({
            name: name.trim(),
            token: generateToken(),
            plan_ids: validIds,
            theme_color: theme_color || '#16a34a',
            title: (title && title.trim()) || 'Choose Your Plan',
            description: (description && description.trim()) || 'Select a plan that fits your business needs. Simple setup, upgrade anytime.'
        });

        await snippet.save();

        return res.status(201).json({
            success: true,
            message: 'Snippet created successfully',
            data: snippet
        });
    } catch (error) {
        console.error('Error creating plan snippet:', error);
        return res.status(500).json({ success: false, message: 'Failed to create snippet', error: error.message });
    }
};

export const listSnippets = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [snippets, total] = await Promise.all([
            PlanSnippet.find({ deleted_at: null })
                .populate({ path: 'plan_ids', select: 'name price billing_cycle is_active' })
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            PlanSnippet.countDocuments({ deleted_at: null })
        ]);

        return res.status(200).json({
            success: true,
            data: {
                snippets,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalItems: total,
                    itemsPerPage: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Error listing plan snippets:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch snippets', error: error.message });
    }
};

export const deleteSnippet = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid snippet ID' });
        }

        const snippet = await PlanSnippet.findOne({ _id: id, deleted_at: null });
        if (!snippet) {
            return res.status(404).json({ success: false, message: 'Snippet not found' });
        }

        snippet.deleted_at = new Date();
        await snippet.save();

        return res.status(200).json({ success: true, message: 'Snippet deleted successfully' });
    } catch (error) {
        console.error('Error deleting plan snippet:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete snippet', error: error.message });
    }
};

export const getSnippetData = async (req, res) => {
    try {
        res.setHeader('Access-Control-Allow-Origin', '*');

        const { token } = req.params;

        const snippet = await PlanSnippet.findOne({ token, deleted_at: null })
            .populate({
                path: 'plan_ids',
                match: { is_active: true, deleted_at: null },
                select: '_id name slug price billing_cycle description is_featured features',
                populate: { path: 'currency', select: 'code symbol' }
            })
            .lean();

        if (!snippet) {
            return res.status(404).json({ success: false, message: 'Snippet not found' });
        }

        const frontendUrl = process.env.FRONTEND_URL || '';

        return res.status(200).json({
            success: true,
            data: {
                name: snippet.name,
                title: snippet.title || 'Choose Your Plan',
                description: snippet.description || 'Select a plan that fits your business needs. Simple setup, upgrade anytime.',
                theme_color: snippet.theme_color,
                frontend_url: frontendUrl,
                plans: snippet.plan_ids || []
            }
        });
    } catch (error) {
        console.error('Error fetching snippet data:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch snippet data', error: error.message });
    }
};

export const getWidgetScript = async (req, res) => {
    try {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Cache-Control', 'public, max-age=300');

        const filePath = path.join(process.cwd(), 'uploads', 'plan-snippet-widget.js');
        const script = await fs.promises.readFile(filePath, 'utf8');
        return res.send(script);
    } catch (error) {
        console.error('Error serving plan snippet widget script:', error);
        return res.status(500).send('console.error("Failed to load plans widget loader.");');
    }
};

export default { createSnippet, listSnippets, deleteSnippet, getSnippetData, getWidgetScript };
