import { Submission, Form } from "../models/index.js";
import mongoose from "mongoose";
import * as funnelService from "../services/funnel.service.js";


const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'sort_order';
const DEFAULT_SORT_ORDER = 1;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = [
    'contact_info.name',
    'contact_info.email',
    'contact_info.phone',
    'preview',
    'meta.source',
    'status',
    'submitted_at',
];

const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};

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

const buildSearchQuery = (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
        return {};
    }

    const sanitizedSearch = searchTerm.trim();

    return {
        $or: [
            { "meta.phone_number": { $regex: sanitizedSearch, $options: 'i' } },
            { "meta.source": { $regex: sanitizedSearch, $options: 'i' } },
            { "fields.value": { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};


export const getSubmissionsByFormId = async (req, res) => {
    try {
        const { form_id } = req.params;
        const userId = req.user.id;
        const { status, search } = req.query;

        const { skip, limit, page } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const searchQuery = buildSearchQuery(search);

        const query = {
            form_id,
            user_id: userId,
            ...searchQuery
        };

        if (status) {
            query.status = status;
        }

        const [submissions, total, form] = await Promise.all([
            Submission.find(query)
                .sort({ [sortField]: sortOrder })
                .skip(skip)
                .limit(limit)
                .lean(),
            Submission.countDocuments(query),
            Form.findById(form_id).select('name').lean()
        ]);

        const formName = form?.name || "Unknown Form";

        const enhancedSubmissions = submissions.map((sub) => {
            const nameField = sub.fields.find(f => /name/i.test(f.label || ''))?.value;
            const emailField = sub.fields.find(f => /email/i.test(f.label || ''))?.value;

            const preview = sub.fields
                .filter(f => f.value && typeof f.value === 'string' && !/name|email|phone/i.test(f.label || ''))
                .slice(0, 3)
                .map(f => f.value)
                .join(', ');

            return {
                id: sub._id,
                form_name: formName,
                contact_info: {
                    name: nameField || "New Lead",
                    email: emailField || null,
                    phone: sub.meta?.phone_number || "Unknown"
                },
                preview: preview || "No additional data",
                status: sub.status
            };
        });

        res.status(200).json({
            success: true,
            data: enhancedSubmissions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalForms: total,
                limit: limit,
                skip: skip
            }
        });
    } catch (error) {
        console.error("Error fetching submissions:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getSubmissionDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        let submission = await Submission.findOneAndUpdate(
            {
                _id: id,
                user_id: userId,
                status: "new"
            },
            {
                $set: {
                    status: "viewed",
                    viewed_at: new Date()
                }
            },
            {
                returnDocument: 'after'
            }
        ).lean();

        if (!submission) {
            submission = await Submission.findOne({
                _id: id,
                user_id: userId
            }).lean();
        }

        if (!submission) {
            return res.status(404).json({
                success: false,
                message: "Submission not found"
            });
        }

        const fields = (submission.fields || []).map(field => ({
            label: field.label,
            value: field.value
        }));

        res.status(200).json({
            success: true,
            data: {
                id: submission._id,
                status: submission.status,
                phone: submission.meta?.phone_number || "Unknown",
                submitted_at: submission.submitted_at,
                viewed_at: submission.viewed_at || null,
                fields
            }
        });

    } catch (error) {
        console.error("Error fetching submission details:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

export const updateSubmissionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user.id;

        const validStatuses = ["new", "viewed", "in_progress", "contacted", "qualified", "closed", "failed"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }

        const submission = await Submission.findOneAndUpdate(
            { _id: id, user_id: userId },
            { status },
            { returnDocument: 'after' }
        );

        if (!submission) {
            return res.status(404).json({ success: false, message: "Submission not found" });
        }

        res.status(200).json({ success: true, data: submission });
    } catch (error) {
        console.error("Error updating submission status:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getSubmissionStats = async (req, res) => {
    try {
        const { form_id } = req.params;
        const userId = req.user.id;

        const stats = await Submission.aggregate([
            { $match: { form_id: new mongoose.Types.ObjectId(form_id), user_id: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ]);

        const formattedStats = {
            new: 0,
            viewed: 0,
            in_progress: 0,
            contacted: 0,
            qualified: 0,
            closed: 0,
            total: 0
        };

        stats.forEach(s => {
            if (formattedStats.hasOwnProperty(s._id)) {
                formattedStats[s._id] = s.count;
            }
            formattedStats.total += s.count;
        });

        res.status(200).json({ success: true, data: formattedStats });
    } catch (error) {
        console.error("Error fetching submission stats:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteSubmission = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const submission = await Submission.findOneAndDelete({ _id: id, user_id: userId });
        if (!submission) {
            return res.status(404).json({ success: false, message: "Submission not found" });
        }

        await Form.findByIdAndUpdate(submission.form_id, { $inc: { "stats.submissions": -1 } });

        res.status(200).json({ success: true, message: "Submission deleted successfully" });
    } catch (error) {
        console.error("Error deleting submission:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getSubmissionFunnels = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const funnels = await funnelService.getFunnelsByType(userId, 'form_submission');
        res.status(200).json({ success: true, data: funnels });
    } catch (error) {
        console.error("Error fetching submission funnels:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getSubmissionKanbanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.owner_id;
        const status = await funnelService.getItemStatus(id, userId);
        res.status(200).json({ success: true, data: status });
    } catch (error) {
        console.error("Error fetching submission kanban status:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const handleSubmissionKanbanAction = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const { globalItemId, actions } = req.body;

        let result;
        if (actions && Array.isArray(actions)) {
            result = await funnelService.processBulkActions({
                globalItemId,
                actions,
                userId,
                changedBy: req.user.id
            });
        } else {
            result = await funnelService.processAction({
                ...req.body,
                userId,
                changedBy: req.user.id
            });
        }

        res.status(200).json({ success: true, data: result, message: "Action processed successfully" });
    } catch (error) {
        console.error("Error processing submission kanban action:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export default {
    getSubmissionsByFormId,
    getSubmissionDetails,
    updateSubmissionStatus,
    deleteSubmission,
    getSubmissionFunnels,
    getSubmissionKanbanStatus,
    handleSubmissionKanbanAction
};
