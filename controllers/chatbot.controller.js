import { Chatbot, AIModel } from '../models/index.js';
import mongoose from 'mongoose';
import axios from 'axios';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

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
        const { name, ai_model, api_key, business_name, business_description } = req.body;

        if (!name || !ai_model || !api_key) {
            return res.status(400).json({ success: false, message: 'name, ai_model, and api_key are required' });
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
        const { search } = req.query;

        const query = { user_id: userId, deleted_at: null };

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



export const scrapeUrl = async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            return res.status(400).json({ success: false, message: 'URL is required' });
        }

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
        });

        let html = response.data;
        if (typeof html !== 'string') {
            return res.status(400).json({ success: false, message: 'Invalid page response' });
        }

        html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        html = html.replace(/<!--[\s\S]*?-->/g, '');

        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        let bodyHtml = bodyMatch ? bodyMatch[1] : html;

        bodyHtml = bodyHtml.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
        bodyHtml = bodyHtml.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
        bodyHtml = bodyHtml.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');

        let text = bodyHtml.replace(/<[^>]*>/g, ' ');

        text = text
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");

        text = text.replace(/\s+/g, ' ').trim();

        const maxLength = 100000;
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }

        return res.status(200).json({
            success: true,
            data: { text }
        });
    } catch (error) {
        console.error('URL Scraping error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to scrape URL',
            error: error.message
        });
    }
};

export const extractDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const originalName = req.file.originalname.toLowerCase();
        let extractedText = '';

        if (originalName.endsWith('.txt')) {
            extractedText = fs.readFileSync(filePath, 'utf8');
        } else if (originalName.endsWith('.csv')) {
            extractedText = fs.readFileSync(filePath, 'utf8');
        } else if (originalName.endsWith('.pdf')) {
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(dataBuffer);
            extractedText = pdfData.text || '';
        } else {
            try { fs.unlinkSync(filePath); } catch (_) { }
            return res.status(400).json({
                success: false,
                message: 'Unsupported file format. Please upload a .txt, .csv, or .pdf file.'
            });
        }

        try { fs.unlinkSync(filePath); } catch (_) { }

        extractedText = extractedText.replace(/\s+/g, ' ').trim();

        const maxLength = 100000;
        if (extractedText.length > maxLength) {
            extractedText = extractedText.substring(0, maxLength) + '...';
        }

        return res.status(200).json({
            success: true,
            data: { text: extractedText }
        });
    } catch (error) {
        console.error('Document extraction error:', error);
        if (req.file && req.file.path) {
            try { fs.unlinkSync(req.file.path); } catch (_) { }
        }
        return res.status(500).json({
            success: false,
            message: 'Failed to extract document',
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
    trainChatbot,
    scrapeUrl,
    extractDocument
};
