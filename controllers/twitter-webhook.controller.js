
export const handleTwitterCRC = async (req, res) => {
    return res.status(503).json({ error: 'Twitter integration is currently disabled.' });
};


export const handleTwitterWebhook = async (req, res) => {
    return res.status(503).json({ error: 'Twitter integration is currently disabled.' });
};
