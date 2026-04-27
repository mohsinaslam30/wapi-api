import { Language, Setting } from '../models/index.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { deleteFile } from '../utils/aws-storage.js';

const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'sort_order';
const ALLOWED_SORT_FIELDS = ['name', 'locale', 'is_rtl', 'is_active', 'sort_order', 'created_at', 'updated_at'];

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
            { name: { $regex: sanitizedSearch, $options: 'i' } },
            { locale: { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};

const validateLanguageData = (languageData) => {
    const errors = [];

    if (!languageData.name || !languageData.name.trim()) {
        errors.push('Language name is required');
    }

    if (!languageData.locale || !languageData.locale.trim()) {
        errors.push('Language locale is required');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

const validateAndFilterIds = (ids) => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
            isValid: false,
            message: 'Language IDs array is required and must not be empty',
            validIds: []
        };
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
        return {
            isValid: false,
            message: 'No valid Language IDs provided',
            validIds: []
        };
    }

    return {
        isValid: true,
        validIds
    };
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

const getTranslationFilePath = (locale, type) => {
    return path.join('uploads', 'languages', locale, `${type}.json`);
};

const ensureDirectoryExists = (filePath) => {
    const dirname = path.dirname(path.join(process.cwd(), filePath));
    if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
    }
};

const readTranslationFile = (filePath) => {
    try {
        const absolutePath = path.join(process.cwd(), filePath);
        if (fs.existsSync(absolutePath)) {
            const content = fs.readFileSync(absolutePath, 'utf8');
            return JSON.parse(content);
        }
        return {};
    } catch (error) {
        console.error(`Error reading translation file ${filePath}:`, error);
        return {};
    }
};

const writeTranslationFile = (filePath, json) => {
    try {
        ensureDirectoryExists(filePath);
        const absolutePath = path.join(process.cwd(), filePath);
        fs.writeFileSync(absolutePath, JSON.stringify(json, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error(`Error writing translation file ${filePath}:`, error);
        return false;
    }
};

const processTranslationUpload = async (files, fieldName, defaultData) => {
    if (files && files[fieldName] && files[fieldName][0]) {
        try {
            const filePath = files[fieldName][0].path;
            let content;
            if (filePath.startsWith('http')) {
                const response = await axios.get(filePath);
                content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            } else {
                content = fs.readFileSync(path.join(process.cwd(), filePath), 'utf8');
            }
            return JSON.parse(content);
        } catch (error) {
            console.error(`Error processing uploaded translation file ${fieldName}:`, error);
        }
    }
    return defaultData;
};

const loadEnglishTranslations = () => {
    try {
        const localesPath = path.join(process.cwd(), 'locales', 'en');
        const frontPath = path.join(localesPath, 'front.json');
        const adminPath = path.join(localesPath, 'admin.json');
        const appPath = path.join(localesPath, 'app.json');

        let front = {};
        let admin = {};
        let app = {};

        if (fs.existsSync(frontPath)) {
            front = JSON.parse(fs.readFileSync(frontPath, 'utf8'));
        }

        if (fs.existsSync(adminPath)) {
            admin = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
        }

        if (fs.existsSync(appPath)) {
            app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
        }

        return { front, admin, app };
    } catch (error) {
        console.error('Error loading English translations:', error);
        return { front: {}, admin: {}, app: {} };
    }
};

export const createLanguage = async (req, res) => {
    let translationPath = null;
    let flagPath = null;
    try {
        const languageData = req.body;

        const validation = validateLanguageData(languageData);
        if (!validation.isValid) {
            await cleanupFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Language validation failed',
                errors: validation.errors
            });
        }

        const { name, locale, is_rtl, is_active, is_default } = languageData;
        const languageLocale = locale.trim();

        const existingLanguage = await Language.findOne({ locale: languageLocale, deleted_at: null });
        if (existingLanguage) {
            await cleanupFiles(req.files);
            return res.status(409).json({
                success: false,
                message: 'A language with this locale already exists'
            });
        }

        const englishDefaults = loadEnglishTranslations();

        const frontFile = getTranslationFilePath(languageLocale, 'front');
        const adminFile = getTranslationFilePath(languageLocale, 'admin');
        const appFile = getTranslationFilePath(languageLocale, 'app');

        const frontContent = await processTranslationUpload(req.files, 'front_translation_file', languageData.front_translation_json || englishDefaults.front);
        const adminContent = await processTranslationUpload(req.files, 'admin_translation_file', languageData.admin_translation_json || englishDefaults.admin);
        const appContent = await processTranslationUpload(req.files, 'app_translation_file', languageData.app_translation_json || englishDefaults.app);

        writeTranslationFile(frontFile, frontContent);
        writeTranslationFile(adminFile, adminContent);
        writeTranslationFile(appFile, appContent);

        if (req.files && req.files.flag && req.files.flag[0]) {
            flagPath = req.files.flag[0].path;
        }

        if (is_default === true || is_default === 'true') {
            await Language.updateMany({ deleted_at: null }, { $set: { is_default: false } });
        }

        const language = await Language.create({
            name: name.trim(),
            locale: languageLocale,
            flag: flagPath,
            front_translation_file: frontFile,
            admin_translation_file: adminFile,
            app_translation_file: appFile,
            is_rtl: is_rtl !== undefined ? is_rtl : false,
            is_active: is_active !== undefined ? is_active : true,
            is_default: (is_default === true || is_default === 'true')
        });

        let setting = await Setting.findOne();
        if (!setting) {
            setting = await Setting.create({
                default_language: language.locale
            });
        } else if (!setting.default_language || (is_default === true || is_default === 'true')) {
            setting.default_language = language.locale;
            await setting.save();
        }

        return res.status(201).json({
            success: true,
            message: 'Language created successfully',
            data: language
        });
    } catch (error) {
        console.error('Error creating language:', error);
        await cleanupFiles(req.files);
        return res.status(500).json({
            success: false,
            message: 'Failed to create language',
            error: error.message
        });
    } finally {
        await cleanupFiles(req.files);
    }
};

export const getLanguages = async (req, res) => {
    try {
        console.log("calledd");
        const { search, is_active } = req.query;

        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);

        const searchQuery = buildSearchQuery(search);

        searchQuery.deleted_at = null;

        if (is_active !== undefined) {
            searchQuery.is_active = is_active === 'true';
        }

        const languages = await Language.find(searchQuery)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Language.countDocuments(searchQuery);

        return res.status(200).json({
            success: true,
            data: {
                languages,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('Error fetching languages:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch languages',
            error: error.message
        });
    }
};

export const getLanguageById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid language ID'
            });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null }).lean();

        if (!language) {
            return res.status(404).json({
                success: false,
                message: 'Language not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: language
        });
    } catch (error) {
        console.error('Error fetching language:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch language',
            error: error.message
        });
    }
};

export const updateLanguage = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            await cleanupFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Invalid language ID'
            });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null });

        if (!language) {
            await cleanupFiles(req.files);
            return res.status(404).json({
                success: false,
                message: 'Language not found'
            });
        }

        const validation = validateLanguageData({
            ...language.toObject(),
            ...updateData
        });

        if (!validation.isValid) {
            cleanupFiles(req.files);
            return res.status(400).json({
                success: false,
                message: 'Language validation failed',
                errors: validation.errors
            });
        }

        if (updateData.locale) {
            const newLocale = updateData.locale.trim();
            if (newLocale !== language.locale) {
                const existingLanguage = await Language.findOne({ locale: newLocale, _id: { $ne: id }, deleted_at: null });
                if (existingLanguage) {
                    await cleanupFiles(req.files);
                    return res.status(409).json({
                        success: false,
                        message: 'A language with this locale already exists'
                    });
                }
                language.locale = newLocale;
            }
        }

        const oldFlagPath = language.flag;

        if (req.files) {
            if (req.files.flag && req.files.flag[0]) {
                language.flag = req.files.flag[0].path;
            }
        }

        if (updateData.name !== undefined) language.name = updateData.name.trim();
        if (updateData.flag !== undefined && (!req.files || !req.files.flag)) language.flag = updateData.flag;
        if (updateData.is_rtl !== undefined) language.is_rtl = updateData.is_rtl;

        if (updateData.is_active !== undefined) {
            if (language.is_default && updateData.is_active === false) {
                await cleanupFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'Default language cannot be deactivated. Please change the default language first.'
                });
            }
            language.is_active = updateData.is_active;
        }

        if (updateData.is_default === true || updateData.is_default === 'true') {
            if (!language.is_active && updateData.is_active !== true) {
                await cleanupFiles(req.files);
                return res.status(400).json({
                    success: false,
                    message: 'A deactivated language cannot be set as default.'
                });
            }
            await Language.updateMany({ _id: { $ne: id }, deleted_at: null }, { $set: { is_default: false } });
            language.is_default = true;

            let setting = await Setting.findOne();
            if (setting) {
                setting.default_language = language.locale;
                await setting.save();
            }
        }

        const frontContent = await processTranslationUpload(req.files, 'front_translation_file', updateData.front_translation_json);
        const adminContent = await processTranslationUpload(req.files, 'admin_translation_file', updateData.admin_translation_json);
        const appContent = await processTranslationUpload(req.files, 'app_translation_file', updateData.app_translation_json);

        if (frontContent !== undefined) writeTranslationFile(language.front_translation_file, frontContent);
        if (adminContent !== undefined) writeTranslationFile(language.admin_translation_file, adminContent);
        if (appContent !== undefined) writeTranslationFile(language.app_translation_file, appContent);

        await language.save();

        if (req.files && req.files.flag && oldFlagPath && oldFlagPath !== language.flag) {
            await deleteFile(oldFlagPath);
        }

        return res.status(200).json({
            success: true,
            message: 'Language updated successfully',
            data: language
        });
    } catch (error) {
        console.error('Error updating language:', error);
        await cleanupFiles(req.files);
        return res.status(500).json({
            success: false,
            message: 'Failed to update language',
            error: error.message
        });
    } finally {
        await cleanupFiles(req.files);
    }
};

export const deleteLanguages = async (req, res) => {
    try {
        const { ids } = req.body;

        const validation = validateAndFilterIds(ids);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const { validIds } = validation;

        const languages = await Language.find({
            _id: { $in: validIds },
            deleted_at: null
        });

        if (languages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No languages found with the provided IDs'
            });
        }

        const foundIds = languages.map(l => l._id.toString());
        const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

        const deletableIds = [];
        const usedIds = [];

        for (const languageId of foundIds) {
            const language = languages.find(l => l._id.toString() === languageId);
            if (language.is_default) {
                usedIds.push(languageId);
            } else {
                deletableIds.push(languageId);
            }
        }

        if (deletableIds.length > 0) {
            await Language.updateMany(
                { _id: { $in: deletableIds } },
                { $set: { deleted_at: new Date() } }
            );
        }

        const response = {
            success: true,
            message: `${deletableIds.length} language(s) deleted successfully`,
            data: {
                deletedCount: deletableIds.length,
                deletedIds: deletableIds
            }
        };

        if (usedIds.length > 0) {
            response.data.usedIds = usedIds;
            response.message += `, ${usedIds.length} language(s) are set as system default and cannot be deleted`;
        }

        if (notFoundIds.length > 0) {
            response.data.notFoundIds = notFoundIds;
            response.message += `, ${notFoundIds.length} language(s) not found`;
        }

        return res.status(200).json(response);

    } catch (error) {
        console.error('Error deleting languages:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete languages',
            error: error.message
        });
    }
};

export const getTranslations = async (req, res) => {
    try {
        const { locale: identifier } = req.params;
        const query = { deleted_at: null };

        if (mongoose.Types.ObjectId.isValid(identifier)) {
            query._id = identifier;
        } else {
            query.locale = identifier;
        }

        const language = await Language.findOne(query);
        if (!language) {
            return res.status(404).json({ success: false, message: 'Language not found' });
        }

        const front = readTranslationFile(language.front_translation_file);
        const admin = readTranslationFile(language.admin_translation_file);
        const app = readTranslationFile(language.app_translation_file);

        return res.status(200).json({
            success: true,
            data: { front, admin, app }
        });
    } catch (error) {
        console.error('Error fetching translations:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch translations', error: error.message });
    }
};

const fileMap = {
    front: 'front_translation_file',
    admin: 'admin_translation_file',
    app: 'app_translation_file'
};

export const updateTranslations = async (req, res) => {
    try {
        const { locale: identifier } = req.params;
        const { translations } = req.body;

        if (!translations || typeof translations !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Invalid translations format'
            });
        }

        const query = { deleted_at: null };
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            query._id = identifier;
        } else {
            query.locale = identifier;
        }

        const language = await Language.findOne(query);

        if (!language) {
            return res.status(404).json({
                success: false,
                message: 'Language not found'
            });
        }

        const updateFile = (type, data) => {
            if (!fileMap[type] || !data || typeof data !== 'object') return false;
            const filePath = language[fileMap[type]];
            if (!filePath) return false;

            const existing = readTranslationFile(filePath) || {};
            const updated = {
                ...existing,
                ...data
            };
            writeTranslationFile(filePath, updated);
            return true;
        };

        let updatedAny = false;
        const types = Object.keys(fileMap);

        for (const type of types) {
            if (translations[type] && typeof translations[type] === 'object') {
                if (updateFile(type, translations[type])) {
                    updatedAny = true;
                }
            }
        }

        if (!updatedAny) {
            return res.status(400).json({
                success: false,
                message: 'No valid translations provided (front, admin, or app)'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Translations updated successfully'
        });

    } catch (error) {
        console.error('Error updating translations:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update translations',
            error: error.message
        });
    }
};

export const toggleLanguageStatus = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid language ID'
            });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null });

        if (!language) {
            return res.status(404).json({
                success: false,
                message: 'Language not found'
            });
        }

        if (language.is_active) {
            if (language.is_default) {
                return res.status(400).json({
                    success: false,
                    message: 'Default language cannot be deactivated. Please change the default language first.'
                });
            }
        }

        language.is_active = !language.is_active;
        await language.save();

        return res.status(200).json({
            success: true,
            message: `Language ${language.is_active ? 'activated' : 'deactivated'} successfully`,
            data: language
        });
    } catch (error) {
        console.error('Error toggling language status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to toggle language status',
            error: error.message
        });
    }
};

export const toggleDefaultLanguage = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid language ID'
            });
        }

        const language = await Language.findOne({ _id: id, deleted_at: null });

        if (!language) {
            return res.status(404).json({
                success: false,
                message: 'Language not found'
            });
        }

        if (language.is_active == false) {
            return res.status(400).json({
                success: false,
                message: 'A deactivated language cannot be set as default.'
            });
        }

        await Language.updateMany({ _id: { $ne: id }, deleted_at: null }, { $set: { is_default: false } });
        language.is_default = true;
        await language.save();

        let setting = await Setting.findOne();
        if (!setting) {
            setting = await Setting.create({ default_language: language.locale });
        } else {
            setting.default_language = language.locale;
            await setting.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Default language updated successfully',
            data: language
        });
    } catch (error) {
        console.error('Error toggling default language:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to toggle default language',
            error: error.message
        });
    }
};

export default {
    createLanguage,
    getLanguages,
    getLanguageById,
    updateLanguage,
    deleteLanguages,
    toggleLanguageStatus,
    getTranslations,
    updateTranslations,
    toggleDefaultLanguage
};
