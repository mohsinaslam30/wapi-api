import { GoogleAccount, GoogleCalendar, GoogleSheet } from '../models/index.js';
import { getOAuth2Client, SCOPES, getCalendarClient, getSheetsClient, getAuthenticatedClient, handleGoogleApiError } from '../utils/google-api-helper.js';
import { encrypt, decrypt } from '../utils/encryption-utils.js';
import { google } from 'googleapis';


export const connect = async (req, res) => {
  try {
    const oauth2Client = getOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES.join(' '),
      prompt: 'consent',
      state: req.user.id,
      include_granted_scopes: true
    });
    console.log(`[Google Connect] Generated Auth URL for User ID: ${req.user.id}`);
    res.json({ success: true, url });
  } catch (error) {
    console.error('Google connect error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate auth URL' });
  }
};


export const callback = async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) {
      return res.status(400).json({ success: false, message: 'Code missing' });
    }

    const userId = state;
    console.log(`[Google Callback] Received callback for User ID: ${userId}`);
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    console.log(`[Google Callback] Scopes granted by Google: ${tokens.scope}`);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    console.log(`[Google Callback] Authenticated email: ${userInfo.data.email}`);
    const email = userInfo.data.email;

    const googleAccount = await GoogleAccount.findOneAndUpdate(
      { user_id: userId, email },
      {
        access_token: encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        expires_at: new Date(tokens.expiry_date),
        scopes: tokens.scope ? tokens.scope.split(' ') : SCOPES,
        status: 'active',
        deleted_at: null
      },
      { upsert: true, returnDocument: 'after' }
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/google_account?success=true`);
  } catch (error) {
    console.error('Google callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/google_account?success=false&message=${encodeURIComponent(error.message)}`);
  }
};


export const listAccounts = async (req, res) => {
  try {
    const accounts = await GoogleAccount.find({ user_id: req.user.id, deleted_at: null })
      .select('email status created_at')
      .lean();
    res.json({ success: true, accounts });
  } catch (error) {
    console.error('List Google accounts error:', error);
    res.status(500).json({ success: false, message: 'Failed to list accounts' });
  }
};


export const disconnectAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const account = await GoogleAccount.findOneAndUpdate(
      { _id: id, user_id: req.user.id },
      { deleted_at: new Date(), status: 'inactive' }
    );

    if (!account) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    await GoogleCalendar.updateMany({ google_account_id: id }, { deleted_at: new Date() });
    await GoogleSheet.updateMany({ google_account_id: id }, { deleted_at: new Date() });

    res.json({ success: true, message: 'Account disconnected successfully' });
  } catch (error) {
    console.error('Disconnect Google account error:', error);
    res.status(500).json({ success: false, message: 'Failed to disconnect account' });
  }
};


export const fetchCalendars = async (req, res) => {
  const { google_account_id } = req.params;
  try {
    const calendar = await getCalendarClient(google_account_id);
    const response = await calendar.calendarList.list();
    const calendars = response.data.items;

    for (const cal of calendars) {
      await GoogleCalendar.findOneAndUpdate(
        { google_account_id, calendar_id: cal.id },
        { name: cal.summary, deleted_at: null },
        { upsert: true }
      );
    }

    const savedCalendars = await GoogleCalendar.find({ google_account_id, deleted_at: null }).lean();
    res.json({ success: true, calendars: savedCalendars });
  } catch (error) {
    console.error('Fetch Google calendars error:', error);
    const wasHandled = await handleGoogleApiError(error, google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};


export const linkCalendar = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_linked } = req.body;
    const cal = await GoogleCalendar.findByIdAndUpdate(id, { is_linked }, { returnDocument: 'after' });
    res.json({ success: true, calendar: cal });
  } catch (error) {
    console.error('Link Google calendar error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const createCalendar = async (req, res) => {
  const { google_account_id } = req.params;
  try {
    const { summary } = req.body;
    const calendar = await getCalendarClient(google_account_id);
    const response = await calendar.calendars.insert({
      requestBody: { summary }
    });

    const newCal = await GoogleCalendar.create({
      google_account_id,
      calendar_id: response.data.id,
      name: response.data.summary
    });

    res.json({ success: true, calendar: newCal });
  } catch (error) {
    console.error('Create Google calendar error:', error);
    const wasHandled = await handleGoogleApiError(error, google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};


export const deleteCalendar = async (req, res) => {
  const { id } = req.params;
  let cal;
  try {
    cal = await GoogleCalendar.findById(id);
    if (!cal) return res.status(404).json({ success: false, message: 'Calendar not found' });

    const calendarClient = await getCalendarClient(cal.google_account_id);
    await calendarClient.calendars.delete({ calendarId: cal.calendar_id });

    cal.deleted_at = new Date();
    await cal.save();

    res.json({ success: true, message: 'Calendar deleted successfully' });
  } catch (error) {
    console.error('Delete Google calendar error:', error);
    const wasHandled = await handleGoogleApiError(error, cal?.google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};


export const listEvents = async (req, res) => {
  const { calendar_id } = req.params;
  let cal;
  try {
    cal = await GoogleCalendar.findById(calendar_id);
    if (!cal) return res.status(404).json({ success: false, message: 'Calendar not found' });

    const calendarClient = await getCalendarClient(cal.google_account_id);
    const response = await calendarClient.events.list({
      calendarId: cal.calendar_id,
      timeMin: new Date().toISOString(),
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime'
    });

    res.json({
      success: true,
      events: response.data.items.map(item => ({
        id: item.id,
        summary: item.summary,
        description: item.description,
        start: item.start,
        end: item.end,
        status: item.status
      }))
    });
  } catch (error) {
    console.error('List Google events error:', error);
    const wasHandled = await handleGoogleApiError(error, cal?.google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};


export const createEvent = async (req, res) => {
  const { calendar_id } = req.params;
  let cal;
  try {
    const { summary, description, start, end } = req.body;
    cal = await GoogleCalendar.findById(calendar_id);
    if (!cal) return res.status(404).json({ success: false, message: 'Calendar not found' });

    const calendarClient = await getCalendarClient(cal.google_account_id);
    const response = await calendarClient.events.insert({
      calendarId: cal.calendar_id,
      requestBody: {
        summary,
        description,
        start: { dateTime: start },
        end: { dateTime: end }
      }
    });

    res.json({ success: true, event: response.data });
  } catch (error) {
    console.error('Create Google event error:', error);
    const wasHandled = await handleGoogleApiError(error, cal?.google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};

export const updateEvent = async (req, res) => {
  const { calendar_id, event_id } = req.params;
  let cal;
  try {
    const { summary, description, start, end } = req.body;
    cal = await GoogleCalendar.findById(calendar_id);
    if (!cal) return res.status(404).json({ success: false, message: 'Calendar not found' });

    const calendarClient = await getCalendarClient(cal.google_account_id);
    const response = await calendarClient.events.update({
      calendarId: cal.calendar_id,
      eventId: event_id,
      requestBody: {
        summary,
        description,
        start: { dateTime: start },
        end: { dateTime: end }
      }
    });

    res.json({ success: true, event: response.data });
  } catch (error) {
    console.error('Update Google event error:', error);
    const wasHandled = await handleGoogleApiError(error, cal?.google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};

export const deleteEvent = async (req, res) => {
  const { calendar_id, event_id } = req.params;
  let cal;
  try {
    cal = await GoogleCalendar.findById(calendar_id);
    if (!cal) return res.status(404).json({ success: false, message: 'Calendar not found' });

    const calendarClient = await getCalendarClient(cal.google_account_id);
    await calendarClient.events.delete({
      calendarId: cal.calendar_id,
      eventId: event_id
    });

    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Delete Google event error:', error);
    const wasHandled = await handleGoogleApiError(error, cal?.google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};


export const listSheets = async (req, res) => {
  try {
    const { google_account_id } = req.params;
    const sheets = await GoogleSheet.find({ google_account_id, deleted_at: null }).lean();
    res.json({ success: true, sheets });
  } catch (error) {
    console.error('List Google sheets error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const syncSheets = async (req, res) => {
  const { google_account_id, sheets } = req.body;

  if (!google_account_id) {
    return res.status(400).json({ success: false, message: 'google_account_id is required in body' });
  }

  try {
    const auth = await getAuthenticatedClient(google_account_id);

    if (!sheets || !Array.isArray(sheets) || sheets.length === 0) {
      const driveClient = google.drive({ version: 'v3', auth });
      const response = await driveClient.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
        fields: 'files(id, name)',
      });
      return res.json({ success: true, mode: 'list', sheets: response.data.files });
    }


    const syncedSheets = [];
    for (const sheet of sheets) {
      const updatedSheet = await GoogleSheet.findOneAndUpdate(
        { google_account_id, sheet_id: sheet.id },
        { name: sheet.name, deleted_at: null, is_linked: true },
        { upsert: true, new: true }
      );
      syncedSheets.push(updatedSheet);
    }

    res.json({
      success: true,
      mode: 'sync',
      message: `${syncedSheets.length} sheets synced successfully`,
      sheets: syncedSheets
    });
  } catch (error) {
    console.error('Google Sheets sync error:', error);
    const wasHandled = await handleGoogleApiError(error, google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};


export const createSheet = async (req, res) => {
  const { google_account_id } = req.params;
  try {
    const { title } = req.body;
    const sheetsClient = await getSheetsClient(google_account_id);
    const response = await sheetsClient.spreadsheets.create({
      requestBody: { properties: { title } }
    });

    const newSheet = await GoogleSheet.create({
      google_account_id,
      sheet_id: response.data.spreadsheetId,
      name: response.data.properties.title
    });

    res.json({ success: true, sheet: newSheet });
  } catch (error) {
    console.error('Create Google sheet error:', error);
    const wasHandled = await handleGoogleApiError(error, google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};

export const readSheet = async (req, res) => {
  const { sheet_id } = req.params;
  let sheet;
  try {
    const { range } = req.query;
    sheet = await GoogleSheet.findById(sheet_id);
    if (!sheet) return res.status(404).json({ success: false, message: 'Sheet not found' });

    const sheetsClient = await getSheetsClient(sheet.google_account_id);
    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheet.sheet_id,
      range: range || 'A1:Z100'
    });

    res.json({ success: true, values: response.data.values });
  } catch (error) {
    console.error('Read Google sheet error:', error);
    const wasHandled = await handleGoogleApiError(error, sheet?.google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};

export const writeSheet = async (req, res) => {
  const { sheet_id } = req.params;
  let sheet;
  try {
    const { range, values } = req.body;
    sheet = await GoogleSheet.findById(sheet_id);
    if (!sheet) return res.status(404).json({ success: false, message: 'Sheet not found' });

    const sheetsClient = await getSheetsClient(sheet.google_account_id);
    const response = await sheetsClient.spreadsheets.values.update({
      spreadsheetId: sheet.sheet_id,
      range: range || 'A1',
      valueInputOption: 'RAW',
      requestBody: { values }
    });

    res.json({ success: true, response: response.data });
  } catch (error) {
    console.error('Write Google sheet error:', error);
    const wasHandled = await handleGoogleApiError(error, sheet?.google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};

export const deleteSheet = async (req, res) => {
  const { id } = req.params;
  const { delete_from } = req.query;
  let sheet;

  try {
    sheet = await GoogleSheet.findById(id);
    if (!sheet) {
      return res.status(404).json({ success: false, message: 'Sheet not found' });
    }

    if (delete_from === 'google') {
      const auth = await getAuthenticatedClient(sheet.google_account_id);
      const driveClient = google.drive({ version: 'v3', auth });

      await driveClient.files.update({
        fileId: sheet.sheet_id,
        requestBody: { trashed: true }
      });
    }

    sheet.deleted_at = new Date();
    await sheet.save();

    res.json({
      success: true,
      message: delete_from === 'google'
        ? 'Sheet deleted from both Google Drive and Platform'
        : 'Sheet removed from Platform only'
    });
  } catch (error) {
    console.error('Delete Google sheet error:', error);
    const wasHandled = await handleGoogleApiError(error, sheet?.google_account_id);
    const message = wasHandled ? 'Google account unauthorized or expired. Please reconnect.' : error.message;
    res.status(500).json({ success: false, message });
  }
};

export const bulkDeleteSheets = async (req, res) => {
  const { ids, delete_from } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'No IDs provided for bulk delete' });
  }

  try {
    const results = { success: [], failed: [] };

    for (const id of ids) {
      try {
        const sheet = await GoogleSheet.findById(id);
        if (!sheet) {
          results.failed.push({ id, message: 'Sheet not found' });
          continue;
        }

        if (delete_from === 'google') {
          const auth = await getAuthenticatedClient(sheet.google_account_id);
          const driveClient = google.drive({ version: 'v3', auth });
          await driveClient.files.update({
            fileId: sheet.sheet_id,
            requestBody: { trashed: true }
          });
        }

        sheet.deleted_at = new Date();
        await sheet.save();
        results.success.push(id);
      } catch (err) {
        results.failed.push({ id, message: err.message });
      }
    }

    res.json({
      success: true,
      message: `Successfully deleted ${results.success.length} sheets`,
      results
    });
  } catch (error) {
    console.error('Bulk delete sheets error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  connect,
  callback,
  listAccounts,
  disconnectAccount,
  fetchCalendars,
  linkCalendar,
  createCalendar,
  deleteCalendar,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  listSheets,
  syncSheets,
  createSheet,
  readSheet,
  writeSheet,
  deleteSheet,
  bulkDeleteSheets
};
