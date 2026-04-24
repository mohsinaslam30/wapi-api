import { Currency, Setting } from '../models/index.js';
import mongoose from 'mongoose';
import { getExchangeRate as getRate } from '../utils/currency.service.js';

const validateCurrencyData = (currencyData) => {
  const errors = [];

  if (!currencyData.name || !currencyData.name.trim()) {
    errors.push('Currency name is required');
  }

  if (!currencyData.code || !currencyData.code.trim()) {
    errors.push('Currency code is required');
  } else if (currencyData.code.trim().length !== 3) {
    errors.push('Currency code must be exactly 3 characters');
  }

  if (!currencyData.symbol || !currencyData.symbol.trim()) {
    errors.push('Currency symbol is required');
  }

  if (currencyData.exchange_rate === undefined || currencyData.exchange_rate === null) {
    errors.push('Exchange rate is required');
  } else if (isNaN(currencyData.exchange_rate) || currencyData.exchange_rate <= 0) {
    errors.push('Exchange rate must be a positive number');
  }

  if (currencyData.decimal_number !== undefined && currencyData.decimal_number !== null) {
    if (isNaN(currencyData.decimal_number) || currencyData.decimal_number < 0) {
      errors.push('Decimal number must be a non-negative number');
    }
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
      message: 'Currency IDs array is required and must not be empty',
      validIds: []
    };
  }

  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    return {
      isValid: false,
      message: 'No valid Currency IDs provided',
      validIds: []
    };
  }

  return {
    isValid: true,
    validIds
  };
};


const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'sort_order';
const ALLOWED_SORT_FIELDS = ['name', 'code', 'symbol', 'exchange_rate', 'decimal_number', 'is_active', 'sort_order', 'created_at', 'updated_at'];

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
      { code: { $regex: sanitizedSearch, $options: 'i' } },
      { symbol: { $regex: sanitizedSearch, $options: 'i' } }
    ]
  };
};

export const createCurrency = async (req, res) => {
  try {
    const currencyData = req.body;

    const validation = validateCurrencyData(currencyData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Currency validation failed',
        errors: validation.errors
      });
    }

    const currencyCode = currencyData.code.trim().toUpperCase();

    const existingCurrency = await Currency.findOne({ code: currencyCode, deleted_at: null });
    if (existingCurrency) {
      return res.status(409).json({
        success: false,
        message: 'A currency with this code already exists'
      });
    }

    if (currencyData.is_default === true || currencyData.is_default === 'true') {
      await Currency.updateMany({ deleted_at: null }, { $set: { is_default: false } });
    }

    const currency = await Currency.create({
      name: currencyData.name.trim(),
      code: currencyCode,
      symbol: currencyData.symbol.trim(),
      exchange_rate: currencyData.exchange_rate,
      is_active: currencyData.is_active !== undefined ? currencyData.is_active : true,
      decimal_number: currencyData.decimal_number !== undefined ? currencyData.decimal_number : 2,
      is_default: (currencyData.is_default === true || currencyData.is_default === 'true')
    });

    let setting = await Setting.findOne();

    if (!setting) {
      setting = await Setting.create({
        default_currency: currency._id
      });
    } else if (!setting.default_currency || (currencyData.is_default === true || currencyData.is_default === 'true')) {
      setting.default_currency = currency._id;
      await setting.save();
    }

    return res.status(201).json({
      success: true,
      message: 'Currency created successfully',
      data: currency
    });
  } catch (error) {
    console.error('Error creating currency:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create currency',
      error: error.message
    });
  }
};

export const getCurrencies = async (req, res) => {
  try {
    const { search, is_active } = req.query;

    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);

    const searchQuery = buildSearchQuery(search);

    searchQuery.deleted_at = null;

    if (is_active !== undefined) {
      searchQuery.is_active = is_active === 'true';
    }

    const settings = await Setting.findOne().select('default_currency').lean();
    const defaultCurrencyId = settings?.default_currency?.toString();

    const currencies = await Currency.find(searchQuery)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    const currenciesWithDefault = currencies.map(curr => ({
      ...curr,
      is_default: curr.is_default
    }));

    const total = await Currency.countDocuments(searchQuery);

    return res.status(200).json({
      success: true,
      data: {
        currencies: currenciesWithDefault,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('Error fetching currencies:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch currencies',
      error: error.message
    });
  }
};

export const getCurrencyById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid currency ID'
      });
    }

    const currency = await Currency.findOne({ _id: id, deleted_at: null });

    if (!currency) {
      return res.status(404).json({
        success: false,
        message: 'Currency not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: currency
    });
  } catch (error) {
    console.error('Error fetching currency:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch currency',
      error: error.message
    });
  }
};

export const updateCurrency = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid currency ID'
      });
    }

    const currency = await Currency.findOne({ _id: id, deleted_at: null });

    if (!currency) {
      return res.status(404).json({
        success: false,
        message: 'Currency not found'
      });
    }

    const validation = validateCurrencyData({
      ...currency.toObject(),
      ...updateData
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Currency validation failed',
        errors: validation.errors
      });
    }

    if (updateData.code) {
      const newCode = updateData.code.trim().toUpperCase();
      if (newCode !== currency.code) {
        const existingCurrency = await Currency.findOne({ code: newCode, _id: { $ne: id }, deleted_at: null });
        if (existingCurrency) {
          return res.status(409).json({
            success: false,
            message: 'A currency with this code already exists'
          });
        }
        currency.code = newCode;
      }
    }

    if (updateData.name !== undefined) currency.name = updateData.name.trim();
    if (updateData.symbol !== undefined) currency.symbol = updateData.symbol.trim();
    if (updateData.exchange_rate !== undefined) currency.exchange_rate = updateData.exchange_rate;
    if (updateData.decimal_number !== undefined) currency.decimal_number = updateData.decimal_number;
    if (updateData.is_active !== undefined) {
      if (currency.is_default && updateData.is_active === false) {
        return res.status(400).json({
          success: false,
          message: 'Default currency cannot be deactivated. Please change the default currency first.'
        });
      }
      currency.is_active = updateData.is_active;
    }

    if (updateData.is_default === true || updateData.is_default === 'true') {
      if (!currency.is_active && updateData.is_active !== true) {
        return res.status(400).json({
          success: false,
          message: 'A deactivated currency cannot be set as default.'
        });
      }
      await Currency.updateMany({ _id: { $ne: id }, deleted_at: null }, { $set: { is_default: false } });
      currency.is_default = true;

      let setting = await Setting.findOne();
      if (setting) {
        setting.default_currency = currency._id;
        await setting.save();
      }
    }


    await currency.save();

    return res.status(200).json({
      success: true,
      message: 'Currency updated successfully',
      data: currency
    });
  } catch (error) {
    console.error('Error updating currency:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update currency',
      error: error.message
    });
  }
};

export const deleteCurrencies = async (req, res) => {
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

    const currencies = await Currency.find({
      _id: { $in: validIds },
      deleted_at: null
    });

    if (currencies.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No currencies found with the provided IDs'
      });
    }

    const foundIds = currencies.map(c => c._id.toString());
    const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

    const deletableIds = [];
    const usedIds = [];

    for (const currencyId of foundIds) {
      const currency = currencies.find(c => c._id.toString() === currencyId);
      if (currency.is_default) {
        usedIds.push(currencyId);
      } else {
        deletableIds.push(currencyId);
      }
    }

    if (deletableIds.length > 0) {
      await Currency.updateMany(
        { _id: { $in: deletableIds } },
        { $set: { deleted_at: new Date() } }
      );
    }

    const response = {
      success: true,
      message: `${deletableIds.length} currency(s) deleted successfully`,
      data: {
        deletedCount: deletableIds.length,
        deletedIds: deletableIds
      }
    };

    if (usedIds.length > 0) {
      response.data.usedIds = usedIds;
      response.message += `, ${usedIds.length} currency(s) are set as system default and cannot be deleted`;
    }

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} currency(s) not found`;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error deleting currencies:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete currencies',
      error: error.message
    });
  }
};

export const toggleCurrencyStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid currency ID'
      });
    }

    const currency = await Currency.findOne({ _id: id, deleted_at: null });

    if (!currency) {
      return res.status(404).json({
        success: false,
        message: 'Currency not found'
      });
    }

    if (currency.is_active) {
      if (currency.is_default) {
        return res.status(400).json({
          success: false,
          message: 'Default currency cannot be deactivated. Please change the default currency first.'
        });
      }
    }

    currency.is_active = !currency.is_active;
    await currency.save();

    return res.status(200).json({
      success: true,
      message: `Currency ${currency.is_active ? 'activated' : 'deactivated'} successfully`,
      data: currency
    });
  } catch (error) {
    console.error('Error toggling currency status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle currency status',
      error: error.message
    });
  }
};

export const toggleDefaultCurrency = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid currency ID'
      });
    }

    const currency = await Currency.findOne({ _id: id, deleted_at: null });

    if (!currency) {
      return res.status(404).json({
        success: false,
        message: 'Currency not found'
      });
    }

    if (!currency.is_active) {
      return res.status(400).json({
        success: false,
        message: 'A deactivated currency cannot be set as default.'
      });
    }

    await Currency.updateMany({ _id: { $ne: id }, deleted_at: null }, { $set: { is_default: false } });
    currency.is_default = true;
    await currency.save();

    let setting = await Setting.findOne();
    if (!setting) {
      setting = await Setting.create({ default_currency: currency._id });
    } else {
      setting.default_currency = currency._id;
      await setting.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Default currency updated successfully',
      data: currency
    });
  } catch (error) {
    console.error('Error toggling default currency:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle default currency',
      error: error.message
    });
  }
};

export const getExchangeRate = async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        message: 'Both "from" and "to" currency codes are required'
      });
    }

    const rate = await getRate(from, to);

    return res.status(200).json({
      success: true,
      data: {
        from: from.toUpperCase(),
        to: to.toUpperCase(),
        rate
      }
    });
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch exchange rate',
      error: error.message
    });
  }
};

export default {
  createCurrency,
  getCurrencies,
  getCurrencyById,
  updateCurrency,
  deleteCurrencies,
  toggleCurrencyStatus,
  toggleDefaultCurrency,
  getExchangeRate
};
