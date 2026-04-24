import { Page } from '../models/index.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'sort_order';
const ALLOWED_SORT_FIELDS = ['title', 'slug', 'content', 'meta_title', 'meta_description', 'meta_image', 'status', 'sort_order', 'created_at', 'updated_at'];

const parsePaginationParams = (query) => {
    const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
    const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};

const parseSortParams = (query) => {
    const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
        ? query.sort_by
        : DEFAULT_SORT_FIELD;

    const sortOrder = query.sort_order?.toUpperCase() === 'DESC'
        ? SORT_ORDER.DESC
        : SORT_ORDER.ASC;

    return { sortField, sortOrder };
};

const validatePageData = (pageData) => {
    const errors = [];
    if (!pageData.title || !pageData.title.trim()) {
        errors.push('Title is required');
    }

    if (!pageData.content || !pageData.content.trim()) {
        errors.push('Content is required');
    }
    return {
        isValid: errors.length === 0,
        errors
    };
};

const buildSearchQuery = (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
        return {};
    }

    const sanitizedSearch = searchTerm.trim();

    return {
        $or: [
            { title: { $regex: sanitizedSearch, $options: 'i' } },
            { slug: { $regex: sanitizedSearch, $options: 'i' } },
            { content: { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};

const generateSlug = (title) => {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

const createCaseInsensitivePattern = (text) => {
    const escapedText = text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedText}$`, 'i');
};


const cleanupFiles = (files) => {
    if (!files) return;

    Object.values(files).forEach(fileArray => {
        fileArray.forEach(file => {
            if (file?.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        });
    });
};

export const createPage = async (req, res) => {
    try {
        const pageData = req.body;
        const validation = validatePageData(pageData);
        if (!validation.isValid) {
            cleanupFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Page validation failed',
                errors: validation.errors
            });
        }

        const { title, content, meta_title, meta_description, status, sort_order } = pageData;

        const slug = pageData.slug || generateSlug(title);

        const existingPage = await Page.findOne({ slug: createCaseInsensitivePattern(slug), deleted_at: null });
        if (existingPage) {
            cleanupFiles(req.files);
            return res.status(409).json({
                success: false,
                message: 'A page with this slug already exists'
            });
        }

        let meta_image = null;
        if (req.file) {
            meta_image = req.file.path;
        }

        const page = await Page.create({
            title: title.trim(),
            slug: slug,
            content,
            meta_title: meta_title ? meta_title.trim() : null,
            meta_description: meta_description ? meta_description.trim() : null,
            meta_image,
            status: status !== undefined ? status : true,
            sort_order: sort_order || 0
        });

        return res.status(201).json({
            success: true,
            message: 'Page created successfully',
            data: page
        });
    } catch (error) {
        console.error('Error creating page:', error);
        cleanupFiles(req.files);
        return res.status(500).json({
            success: false,
            message: 'Failed to create page',
            error: error.message
        });
    }
};

export const getPages = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const searchQuery = buildSearchQuery(req.query.search);

        const { status } = req.query;

        if (status !== undefined) {
            searchQuery.status = status === 'true';
        }

        searchQuery.deleted_at = null;

        const pages = await Page.find(searchQuery)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Page.countDocuments(searchQuery);

        return res.status(200).json({
            success: true,
            data: {
                pages,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error fetching pages:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch pages',
            error: error.message
        });
    }
};

export const getPageById = async (req, res) => {
    try {
        const { id } = req.params;

        let page;
        if (mongoose.Types.ObjectId.isValid(id)) {
            page = await Page.findOne({ _id: id, deleted_at: null }).lean();
        } else {
            page = await Page.findOne({ slug: id, deleted_at: null }).lean();
        }

        if (!page) {
            return res.status(404).json({ success: false, message: 'Page not found' });
        }

        return res.status(200).json({ success: true, data: page });
    } catch (error) {
        console.error('Error fetching page:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch page', error: error.message });
    }
};

export const updatePage = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            cleanupFiles(req.files);
            return res.status(400).json({ success: false, message: 'Invalid page ID' });
        }

        const page = await Page.findOne({ _id: id, deleted_at: null });
        if (!page) {
            cleanupFiles(req.files);
            return res.status(404).json({ success: false, message: 'Page not found' });
        }

        const validation = validatePageData(updateData);
        if (!validation.isValid) {
            cleanupFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Page validation failed',
                errors: validation.errors
            });
        }

        console.log("update data title", updateData.title);


        const newSlug = generateSlug(updateData.title);
        if (newSlug !== page.slug) {
            const existingPage = await Page.findOne({ slug: createCaseInsensitivePattern(newSlug), _id: { $ne: id }, deleted_at: null });
            if (existingPage) {
                cleanupFiles(req.files);
                return res.status(409).json({
                    success: false,
                    message: 'A page with this slug already exists'
                });
            }
            page.slug = newSlug;
        }

        const oldMetaImage = page.meta_image;

        if (req.file) {
            page.meta_image = req.file.path;
        }

        if (updateData.title !== undefined) page.title = updateData.title.trim();
        if (updateData.content !== undefined) page.content = updateData.content;
        if (updateData.meta_title !== undefined) page.meta_title = updateData.meta_title.trim();
        if (updateData.meta_description !== undefined) page.meta_description = updateData.meta_description.trim();
        if (updateData.status !== undefined) page.status = updateData.status;

        await page.save();

        if (req.file && oldMetaImage && oldMetaImage !== page.meta_image) {
            const oldPath = path.join(process.cwd(), oldMetaImage);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Page updated successfully',
            data: page
        });
    } catch (error) {
        console.error('Error updating page:', error);
        cleanupFiles(req.files);
        return res.status(500).json({
            success: false,
            message: 'Failed to update page',
            error: error.message
        });
    }
};

export const deletePages = async (req, res) => {
    try {
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Valid page IDs are required' });
        }

        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid page IDs provided' });
        }

        const pages = await Page.find({ _id: { $in: validIds }, deleted_at: null });

        if (pages.length === 0) {
            return res.status(404).json({ success: false, message: 'No pages found' });
        }

        for (const page of pages) {
            if (page.meta_image) {
                const imgPath = path.join(process.cwd(), page.meta_image);
                if (fs.existsSync(imgPath)) {
                    fs.unlinkSync(imgPath);
                }
            }
        }

        await Page.updateMany(
            { _id: { $in: validIds } },
            { $set: { deleted_at: new Date() } }
        );

        return res.status(200).json({
            success: true,
            message: `${pages.length} page(s) deleted successfully`
        });
    } catch (error) {
        console.error('Error deleting pages:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete pages',
            error: error.message
        });
    }
};

export const togglePageStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid page ID' });
        }

        const page = await Page.findOne({ _id: id, deleted_at: null });

        if (!page) {
            return res.status(404).json({ success: false, message: 'Page not found' });
        }

        page.status = !page.status;
        await page.save();

        return res.status(200).json({
            success: true,
            message: `Page ${page.status ? 'activated' : 'deactivated'} successfully`,
            data: page
        });
    } catch (error) {
        console.error('Error toggling page status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to toggle page status',
            error: error.message
        });
    }
};

export default {
    createPage,
    getPages,
    getPageById,
    updatePage,
    deletePages,
    togglePageStatus
};
