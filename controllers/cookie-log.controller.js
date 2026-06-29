import { CookieConsentLog } from '../models/index.js';

export const logCookieConsent = async (req, res) => {
  try {
    const { consent_id, consent_type, preferences, user_agent } = req.body;
    
    if (!consent_id || !consent_type) {
      return res.status(400).json({
        success: false,
        message: 'consent_id and consent_type are required'
      });
    }

    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    
    const log = await CookieConsentLog.create({
      consent_id,
      consent_type,
      preferences: preferences || {},
      ip_address,
      user_agent: user_agent || req.headers['user-agent'] || '',
      logged_at: new Date()
    });

    return res.status(201).json({
      success: true,
      message: 'Cookie consent preferences logged successfully',
      data: log
    });
  } catch (error) {
    console.error('Error logging cookie consent:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to log cookie consent preferences'
    });
  }
};
