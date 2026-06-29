import { Guide } from '../models/index.js';
import mongoose from 'mongoose';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'order';
const DEFAULT_SORT_ORDER = 1;

const ALLOWED_SORT_FIELDS = ['_id', 'title', 'order', 'status', 'created_at', 'updated_at'];

const parsePaginationParams = (query) => {
    const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};

const parseSortParams = (query) => {
    const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by) ? query.sort_by : DEFAULT_SORT_FIELD;
    const sortOrder = query.sort_order?.toUpperCase() === 'DESC' ? -1 : 1;
    return { sortField, sortOrder };
};

export const getGuides = async (req, res) => {
    try {
        const guides = await Guide.find({ status: true })
            .sort({ order: 1, created_at: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: guides
        });
    } catch (error) {
        console.error('Error retrieving guides:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve guides',
            error: error.message
        });
    }
};

export const getAllGuides = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const search = req.query.search || '';

        const query = {};
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { slug: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } },
                { sub_title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const totalCount = await Guide.countDocuments(query);
        const guides = await Guide.find(query)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .populate('created_by', 'name')
            .lean();

        return res.status(200).json({
            success: true,
            data: {
                guides,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving admin guides:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve admin guides',
            error: error.message
        });
    }
};

export const createGuide = async (req, res) => {
    try {
        const { title, category, sub_title, slug, description, order, position, sections, status, isNewCategory } = req.body;

        if (!title || !category) {
            return res.status(400).json({ success: false, message: 'Title and category are required' });
        }

        if (isNewCategory) {
            const existingCategory = await Guide.findOne({ category });
            if (existingCategory) {
                return res.status(409).json({ success: false, message: `Category "${category}" already exists. Please select it from the dropdown instead.` });
            }
        }

        const duplicateTitle = await Guide.findOne({ title, category });
        if (duplicateTitle) {
            return res.status(409).json({ success: false, message: `Guide with title "${title}" already exists in category "${category}".` });
        }

        let finalOrder;
        let finalPosition;

        const existingInCategory = await Guide.findOne({ category }).sort({ order: -1 });

        if (existingInCategory) {
            finalPosition = existingInCategory.position;
            finalOrder = (existingInCategory.order || 0) + 1;
        } else {
            const lastCategory = await Guide.findOne().sort({ position: -1 });
            finalPosition = (lastCategory?.position || 0) + 1;
            finalOrder = 1;
        }

        const generatedSlug = slug ? slug.toLowerCase() : category.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');

        const newGuide = await Guide.create({
            title,
            category,
            sub_title,
            slug: generatedSlug,
            description,
            order: finalOrder,
            position: finalPosition,
            sections,
            status: status !== undefined ? status : true,
            created_by: req?.user?._id || null
        });

        return res.status(201).json({
            success: true,
            message: 'Guide created successfully',
            data: newGuide
        });
    } catch (error) {
        console.error('Error creating guide:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create guide',
            error: error.message
        });
    }
};

export const updateGuide = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, category, sub_title, slug, description, order, position, sections, status, isNewCategory } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid guide ID' });
        }

        const guide = await Guide.findById(id);
        if (!guide) {
            return res.status(404).json({ success: false, message: 'Guide not found' });
        }

        if (title) {
            const finalCategory = category || guide.category;
            const duplicateTitle = await Guide.findOne({ title, category: finalCategory, _id: { $ne: id } });
            if (duplicateTitle) {
                return res.status(409).json({ success: false, message: `Guide with title "${title}" already exists in category "${finalCategory}".` });
            }
            guide.title = title;
        }

        let categoryChanged = false;

        if (category && category !== guide.category) {
            if (isNewCategory) {
                const existingCategory = await Guide.findOne({ category });
                if (existingCategory) {
                    return res.status(409).json({ success: false, message: `Category "${category}" already exists. Please select it from the dropdown instead.` });
                }
            }

            guide.category = category;
            guide.slug = category.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');

            const existingInNewCategory = await Guide.findOne({ category }).sort({ order: -1 });

            if (existingInNewCategory) {
                guide.position = existingInNewCategory.position;
                guide.order = (existingInNewCategory.order || 0) + 1;
            } else {
                const lastCategory = await Guide.findOne().sort({ position: -1 });
                guide.position = (lastCategory?.position || 0) + 1;
                guide.order = 1;
            }

            categoryChanged = true;
        }

        if (sub_title !== undefined) guide.sub_title = sub_title;
        if (description !== undefined) guide.description = description;
        if (!categoryChanged && order !== undefined) guide.order = order;
        if (!categoryChanged && position !== undefined) guide.position = position;
        if (sections) guide.sections = sections;
        if (status !== undefined) guide.status = status;

        guide.updated_by = req?.user?._id || null;

        await guide.save();

        return res.status(200).json({
            success: true,
            message: 'Guide updated successfully',
            data: guide
        });
    } catch (error) {
        console.error('Error updating guide:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update guide',
            error: error.message
        });
    }
};

export const updateCategory = async (req, res) => {
    try {
        const { slug } = req.params;
        const { category } = req.body;

        if (!category) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        const existingGuides = await Guide.find({ slug: slug.toLowerCase() });
        if (existingGuides.length === 0) {
            return res.status(404).json({ success: false, message: 'No category found with this slug' });
        }

        const currentCategory = existingGuides[0].category;
        if (currentCategory === category) {
            return res.status(400).json({ success: false, message: 'New category name is the same as the current one' });
        }

        const conflictingGuides = await Guide.find({ category });
        if (conflictingGuides.length > 0) {
            return res.status(409).json({ success: false, message: `Category "${category}" already exists. Duplicate category name is not allowed.` });
        }

        const newSlug = category.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');

        const result = await Guide.updateMany(
            { slug: slug.toLowerCase() },
            { $set: { category, slug: newSlug } }
        );

        return res.status(200).json({
            success: true,
            message: `Category renamed successfully (${result.modifiedCount} guides updated)`,
        });
    } catch (error) {
        console.error('Error updating category:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update category',
            error: error.message
        });
    }
};

export const deleteGuide = async (req, res) => {
    try {
        const { id, slug } = req.body;

        if (!id && !slug) {
            return res.status(400).json({ success: false, message: 'Provide either id or slug to delete' });
        }

        if (id) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ success: false, message: 'Invalid guide ID' });
            }

            const guide = await Guide.findByIdAndDelete(id);
            if (!guide) {
                return res.status(404).json({ success: false, message: 'Guide not found' });
            }

            const remainingGuides = await Guide.find({ category: guide.category }).sort({ order: 1 });
            const bulkOps = remainingGuides.map((g, index) => ({
                updateOne: {
                    filter: { _id: g._id },
                    update: { $set: { order: index + 1 } }
                }
            }));
            if (bulkOps.length > 0) {
                await Guide.bulkWrite(bulkOps);
            }

            return res.status(200).json({
                success: true,
                message: 'Guide deleted successfully'
            });
        }

        if (slug) {
            const result = await Guide.deleteMany({ slug: slug.toLowerCase() });

            if (result.deletedCount === 0) {
                return res.status(404).json({ success: false, message: 'No guides found for this category' });
            }

            const allGuides = await Guide.aggregate([
                { $group: { _id: '$category', slug: { $first: '$slug' }, currentPosition: { $first: '$position' } } },
                { $sort: { currentPosition: 1 } }
            ]);

            const positionOps = allGuides.map((cat, index) => ({
                updateMany: {
                    filter: { category: cat._id },
                    update: { $set: { position: index + 1 } }
                }
            }));
            if (positionOps.length > 0) {
                await Guide.bulkWrite(positionOps);
            }

            return res.status(200).json({
                success: true,
                message: `Category deleted successfully (${result.deletedCount} guides removed)`
            });
        }
    } catch (error) {
        console.error('Error deleting guide:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete guide',
            error: error.message
        });
    }
};

export const getGuideById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid guide ID' });
        }

        const guide = await Guide.findById(id).lean();
        if (!guide) {
            return res.status(404).json({ success: false, message: 'Guide not found' });
        }

        return res.status(200).json({
            success: true,
            data: guide
        });
    } catch (error) {
        console.error('Error retrieving guide by ID:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve guide',
            error: error.message
        });
    }
};

export const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                url: req.file.path
            }
        });
    } catch (error) {
        console.error('Error uploading guide image:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to upload image',
            error: error.message
        });
    }
};

export const getUniqueCategories = async (req, res) => {
    try {
        const categories = await Guide.aggregate([
            {
                $group: {
                    _id: "$category",
                    position: { $first: "$position" },
                    slug: { $first: "$slug" }
                }
            },
            {
                $project: {
                    _id: 0,
                    name: "$_id",
                    position: 1,
                    slug: 1
                }
            },
            { $sort: { position: 1, name: 1 } }
        ]);

        return res.status(200).json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch categories',
            error: error.message
        });
    }
};

export const reorderGuides = async (req, res) => {
    try {
        const { guides, categories } = req.body;
        const bulkOps = [];

        if (guides && Array.isArray(guides) && guides.length > 0) {
            const guideOps = guides.map(guide => ({
                updateOne: {
                    filter: { _id: guide.id },
                    update: { $set: { order: guide.order } }
                }
            }));
            bulkOps.push(...guideOps);
        }

        if (categories && Array.isArray(categories)) {
            const catOps = categories.map(cat => ({
                updateMany: {
                    filter: { slug: cat.slug },
                    update: { $set: { position: cat.position } }
                }
            }));
            bulkOps.push(...catOps);
        }

        if (bulkOps.length === 0) {
            return res.status(400).json({ success: false, message: 'Provide either guides or categories array to reorder' });
        }

        await Guide.bulkWrite(bulkOps);

        return res.status(200).json({ success: true, message: 'Ordering saved successfully' });
    } catch (error) {
        console.error('Error saving reorder:', error);
        return res.status(500).json({ success: false, message: 'Failed to save reorder', error: error.message });
    }
};

export default {
    getGuides,
    getAllGuides,
    createGuide,
    updateGuide,
    updateCategory,
    deleteGuide,
    getGuideById,
    getUniqueCategories,
    uploadImage,
    reorderGuides
};
