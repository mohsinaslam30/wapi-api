import { Currency } from '../models/index.js';

async function seedCurrency() {
  try {
    const currencies = [
      { name: 'US Dollar', code: 'USD', symbol: '$', exchange_rate: 1, decimal_number: 2, sort_order: 1, is_active: true, is_default: false },
      { name: 'Euro', code: 'EUR', symbol: '€', exchange_rate: 0.92, decimal_number: 2, sort_order: 2, is_active: true, is_default: false },
      { name: 'British Pound', code: 'GBP', symbol: '£', exchange_rate: 0.79, decimal_number: 2, sort_order: 3, is_active: true, is_default: false },
      { name: 'Indian Rupee', code: 'INR', symbol: '₹', exchange_rate: 83.0, decimal_number: 2, sort_order: 4, is_active: true, is_default: true },
      { name: 'Australian Dollar', code: 'AUD', symbol: 'A$', exchange_rate: 1.52, decimal_number: 2, sort_order: 5, is_active: true },
      { name: 'Canadian Dollar', code: 'CAD', symbol: 'C$', exchange_rate: 1.35, decimal_number: 2, sort_order: 6, is_active: true },
      { name: 'Japanese Yen', code: 'JPY', symbol: '¥', exchange_rate: 151.0, decimal_number: 0, sort_order: 7, is_active: true },
      { name: 'Chinese Yuan', code: 'CNY', symbol: '¥', exchange_rate: 7.23, decimal_number: 2, sort_order: 8, is_active: true },
      { name: 'Swiss Franc', code: 'CHF', symbol: 'CHF', exchange_rate: 0.90, decimal_number: 2, sort_order: 9, is_active: true },
      { name: 'New Zealand Dollar', code: 'NZD', symbol: 'NZ$', exchange_rate: 1.66, decimal_number: 2, sort_order: 10, is_active: true },
      { name: 'Singapore Dollar', code: 'SGD', symbol: 'S$', exchange_rate: 1.34, decimal_number: 2, sort_order: 11, is_active: true },
      { name: 'Hong Kong Dollar', code: 'HKD', symbol: 'HK$', exchange_rate: 7.82, decimal_number: 2, sort_order: 12, is_active: true },
      { name: 'United Arab Emirates Dirham', code: 'AED', symbol: 'د.إ', exchange_rate: 3.67, decimal_number: 2, sort_order: 13, is_active: true },
      { name: 'Saudi Riyal', code: 'SAR', symbol: 'ر.س', exchange_rate: 3.75, decimal_number: 2, sort_order: 14, is_active: true },
      { name: 'Brazilian Real', code: 'BRL', symbol: 'R$', exchange_rate: 5.0, decimal_number: 2, sort_order: 15, is_active: true },
      { name: 'South African Rand', code: 'ZAR', symbol: 'R', exchange_rate: 18.8, decimal_number: 2, sort_order: 16, is_active: true }
    ];

    for (const currencyData of currencies) {
      await Currency.findOneAndUpdate(
        { code: currencyData.code },
        currencyData,
        { upsert: true, returnDocument: 'after' }
      );
    }

    console.log('Currencies seeded successfully!');
  } catch (error) {
    console.error('Error seeding currencies:', error);
    throw error;
  }
}

export default seedCurrency;
