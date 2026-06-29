const config = {
  name: process.env.APP_NAME || 'WhatsDesk',
  configuration: {
    version: { 'Node >= 20': '20' },
    extensions: ['fs', 'path']
  },
  writables: ['public', 'public/install'],
  migration: '_migZip.xml',
  key: '',
  domain: '',
  app: {
    APP_NAME: process.env.APP_NAME || 'WhatsDesk',
    APP_ENV: process.env.NODE_ENV || 'development',
    APP_DEBUG: process.env.APP_DEBUG === 'true',
    APP_URL: process.env.APP_URL || 'http://localhost:3000'
  },
  installation: 'installation.json',
  localhost_url: ['localhost', '127.0.0.1', '[::1]', 'localhost:3000']
};

export { config };
