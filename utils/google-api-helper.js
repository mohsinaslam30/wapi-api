import { google } from 'googleapis';
import { decrypt, encrypt } from './encryption-utils.js';
import { GoogleAccount } from '../models/index.js';

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email'
];


export const getOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
};


export const getAuthenticatedClient = async (googleAccountId) => {
  const account = await GoogleAccount.findById(googleAccountId);
  if (!account) {
    throw new Error('Google account not found');
  }

  const oauth2Client = getOAuth2Client();

  oauth2Client.setCredentials({
    access_token: decrypt(account.access_token),
    refresh_token: decrypt(account.refresh_token),
    expiry_date: account.expires_at.getTime()
  });

  oauth2Client.on('tokens', async (tokens) => {
    const updateData = {};
    if (tokens.access_token) {
      updateData.access_token = encrypt(tokens.access_token);
    }
    if (tokens.expiry_date) {
      updateData.expires_at = new Date(tokens.expiry_date);
    }
    if (tokens.refresh_token) {
      updateData.refresh_token = encrypt(tokens.refresh_token);
    }

    if (Object.keys(updateData).length > 0) {
      await GoogleAccount.findByIdAndUpdate(googleAccountId, updateData);
    }
  });

  return oauth2Client;
};



export const handleGoogleApiError = async (error, googleAccountId) => {
  const isInvalidGrant =
    (error.response?.data?.error === 'invalid_grant') ||
    (error.message && error.message.includes('invalid_grant')) ||
    (error.response?.data?.error_description?.includes('expired or revoked'));

  if (isInvalidGrant) {
    try {
      await GoogleAccount.findByIdAndUpdate(googleAccountId, {
        status: 'expired',
        updated_at: new Date()
      });
      console.warn(`[google_api_helper] Account ${googleAccountId} marked as EXPIRED due to invalid_grant.`);
      return true;
    } catch (dbErr) {
      console.error(`[google_api_helper] Failed to update account status:`, dbErr.message);
    }
  }

  return false;
};

export const getCalendarClient = async (googleAccountId) => {
  const auth = await getAuthenticatedClient(googleAccountId);
  return google.calendar({ version: 'v3', auth });
};

export const getSheetsClient = async (googleAccountId) => {
  const auth = await getAuthenticatedClient(googleAccountId);
  return google.sheets({ version: 'v4', auth });
};

export default {
  getOAuth2Client,
  getAuthenticatedClient,
  getCalendarClient,
  getSheetsClient,
  handleGoogleApiError,
  SCOPES
};
