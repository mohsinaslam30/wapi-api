import { Chatbot, AIModel } from '../models/index.js';
import mongoose from 'mongoose';

const buildSystemPrompt = (data) => {
    const { business_name, business_description, training_data, raw_training_text } = data;

    let prompt = `You are an AI assistant for ${business_name || 'our business'}.\n`;

    if (business_description) {
        prompt += `\nBusiness Description:\n${business_description}\n`;
    }

    if (training_data && training_data.length > 0) {
        prompt += `\nHere are some Frequently Asked Questions and their answers to help you guide the customer:\n`;
        training_data.forEach((item, index) => {
            prompt += `${index + 1}. Q: ${item.question}\n   A: ${item.answer}\n`;
        });
    }

    if (raw_training_text) {
        prompt += `\nAdditional Context:\n${raw_training_text}\n`;
    }

    prompt += `\nRules:\n- Be professional, polite, and helpful.\n- If you don't know the answer, ask the customer to wait while an agent is notified.\n- Keep your responses concise and natural.`;

    return prompt;
};

export const createChatbot = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const { waba_id, name, ai_model, api_key, business_name, business_description } = req.body;

        if (!waba_id || !name || !ai_model || !api_key) {
            return res.status(400).json({ success: false, message: 'waba_id, name, ai_model, and api_key are required' });
        }

        const model = await AIModel.findOne({ _id: ai_model, status: 'active', deleted_at: null });
        if (!model) {
            return res.status(404).json({
                success: false,
                message: 'AI Model not found or inactive'
            });
        }

        const system_prompt = buildSystemPrompt({ business_name, business_description });

        const chatbot = await Chatbot.create({
            user_id: req.user.owner_id,
            created_by: req.user.id,
            waba_id,
            name,
            ai_model,
            api_key,
            business_name,
            business_description,
            system_prompt
        });

        return res.status(201).json({
            success: true,
            message: 'Chatbot created successfully',
            data: chatbot
        });
    } catch (error) {
        console.error('Create chatbot error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create chatbot',
            error: error.message
        });
    }
};

export const getAllChatbots = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const { waba_id, search } = req.query;

        if (!waba_id) {
            return res.status(400).json({ success: false, message: 'waba_id is required' });
        }

        const query = { user_id: userId, waba_id, deleted_at: null };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { business_name: { $regex: search, $options: 'i' } }
            ];
        }

        const chatbots = await Chatbot.find(query)
            .populate('ai_model', 'name display_name')
            .lean()
            .sort({ created_at: -1 });

        return res.json({
            success: true,
            data: chatbots
        });
    } catch (error) {
        console.error('Get all chatbots error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch chatbots',
            error: error.message
        });
    }
};

export const getChatbotById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.owner_id;

        const chatbot = await Chatbot.findOne({ _id: id, user_id: userId, deleted_at: null })
            .populate('ai_model', 'display_name provider model_id');

        if (!chatbot) {
            return res.status(404).json({
                success: false,
                message: 'Chatbot not found'
            });
        }

        return res.json({
            success: true,
            data: chatbot
        });
    } catch (error) {
        console.error('Get chatbot by ID error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch chatbot details',
            error: error.message
        });
    }
};

export const updateChatbot = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.owner_id;
        const updateData = req.body;

        const chatbot = await Chatbot.findOne({ _id: id, user_id: userId, deleted_at: null });

        if (!chatbot) {
            return res.status(404).json({
                success: false,
                message: 'Chatbot not found'
            });
        }

        const allowedUpdates = ['name', 'ai_model', 'api_key', 'status'];
        allowedUpdates.forEach(field => {
            if (updateData[field] !== undefined) {
                chatbot[field] = updateData[field];
            }
        });

        await chatbot.save();

        return res.json({
            success: true,
            message: 'Chatbot updated successfully',
            data: chatbot
        });
    } catch (error) {
        console.error('Update chatbot error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update chatbot',
            error: error.message
        });
    }
};

export const deleteChatbot = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Chatbot.deleteOne({ _id: id, user_id: req.user.owner_id });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Chatbot not found'
            });
        }

        return res.json({
            success: true,
            message: 'Chatbot deleted successfully'
        });
    } catch (error) {
        console.error('Delete chatbot error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete chatbot',
            error: error.message
        });
    }
};

export const trainChatbot = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.owner_id;
        const { business_name, business_description, training_data, raw_training_text, knowledgeType } = req.body;

        const chatbot = await Chatbot.findOne({ _id: id, user_id: userId, deleted_at: null });

        if (!chatbot) {
            return res.status(404).json({
                success: false,
                message: 'Chatbot not found'
            });
        }

        if (business_name !== undefined) chatbot.business_name = business_name;
        if (business_description !== undefined) chatbot.business_description = business_description;
        if (knowledgeType !== undefined) chatbot.knowledge_type = knowledgeType;

        if (knowledgeType === 'q&a') {
            if (training_data !== undefined) chatbot.training_data = training_data;
        } else if (raw_training_text !== undefined) {
            chatbot.raw_training_text = raw_training_text;
        } else {
  
            if (training_data !== undefined) chatbot.training_data = training_data;
            if (raw_training_text !== undefined) chatbot.raw_training_text = raw_training_text;
        }

        chatbot.system_prompt = buildSystemPrompt(chatbot);

        await chatbot.save();

        return res.json({
            success: true,
            message: 'Chatbot trained successfully',
            data: chatbot
        });
    } catch (error) {
        console.error('Train chatbot error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to train chatbot',
            error: error.message
        });
    }
};

export default {
    createChatbot,
    getAllChatbots,
    getChatbotById,
    updateChatbot,
    deleteChatbot,
    trainChatbot
};
