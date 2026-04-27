import fs from 'fs';
import path from 'path';

const ENV_KEYS = [
  'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'STRIPE_WEBHOOK_SECRET',
  'WHATSAPP_VERIFY_TOKEN',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM_NAME', 'MAIL_FROM_EMAIL', 'SUPPORT_EMAIL',
  'MAINTENANCE_MODE',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'
];


export async function updateEnvFile(vars) {
  const envPath = path.join(process.cwd(), '.env');
  let content = '';

  try {
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }
  } catch (err) {
    console.warn('Could not read .env:', err.message);
  }

  const lines = content ? content.split('\n') : [];
  const updatedKeys = new Set();

  for (const key of ENV_KEYS) {
    const value = vars[key];
    if (value == null || value === '') continue;

    const lineMatch = new RegExp(`^(${key}\\s*=\\s*).*`);
    const newLine = `${key}=${value}`;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(lineMatch)) {
        lines[i] = newLine;
        found = true;
        updatedKeys.add(key);
        break;
      }
    }
    if (!found) {
      lines.push(newLine);
      updatedKeys.add(key);
    }
  }

  if (updatedKeys.size === 0) {
    return { updated: false, path: envPath };
  }

  try {
    fs.writeFileSync(envPath, lines.join('\n'), 'utf8');
    return { updated: true, path: envPath };
  } catch (err) {
    console.warn('Could not write .env:', err.message);
    return { updated: false, path: envPath, error: err.message };
  }
}
