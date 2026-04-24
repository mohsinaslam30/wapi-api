import 'dotenv/config';

export default {
  development: {
    mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wapi'
  },
};
