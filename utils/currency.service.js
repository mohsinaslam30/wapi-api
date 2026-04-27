import axios from 'axios';

const rateCache = new Map();


export const getExchangeRate = async (from, to) => {
    if (!from || !to) return 1;

    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();


    if (fromCode === toCode) {
        return 1;
    }

    const cacheKey = `exchange_rate_${fromCode}_to_${toCode}`;
    const cached = rateCache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
        return cached.rate;
    }

    try {
        const response = await axios.get('https://api.frankfurter.app/latest', {
            params: {
                from: fromCode,
                to: toCode
            }
        });

        if (response.status === 200 && response.data && response.data.rates && response.data.rates[toCode]) {
            const rate = response.data.rates[toCode];
            rateCache.set(cacheKey, {
                rate,
                expiry: Date.now() + 24 * 60 * 60 * 1000
            });
            return rate;
        }
    } catch (error) {
        console.error(`Error fetching exchange rate from ${fromCode} to ${toCode}:`, error?.response?.data || error.message);
    }

    return 1;
};
export const formatAmount = (amount) => {
    if (amount === null || amount === undefined) return 0;
    const num = Number(amount);
    if (isNaN(num)) return 0;

    const parts = num.toString().split('.');
    if (parts.length > 1 && parts[1].length > 3) {
        return Number(num.toFixed(2));
    }
    return num;
};
