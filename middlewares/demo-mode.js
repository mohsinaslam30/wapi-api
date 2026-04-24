import { Setting } from '../models/index.js';

const CACHE_MS = 60 * 1000;
let cached = { value: null, at: 0 };


export async function isDemoMode() {
  const now = Date.now();
  if (cached.value !== null && now - cached.at < CACHE_MS) {
    return cached.value;
  }
  try {
    const setting = await Setting.findOne({})
    .select('is_demo_mode')
    .lean();
    const value = setting?.is_demo_mode === true || setting?.is_demo_mode === 1;
    console.log("setting" , value)
    cached = { value, at: now };
    return value;
  } catch (err) {
    console.error('demo-mode middleware: failed to read setting', err);
    return false;
  }
}

const ALLOWED_PATHS = [
  '/api/webhook/stripe',
  '/api/webhook/razorpay',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/logout'
];

function isAllowedPath(path) {
  return ALLOWED_PATHS.some((p) => path === p || path.startsWith(p + '?'));
}

const MUTATING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];


export const denyMutationInDemo = async (req, res, next) => {
  if (!MUTATING_METHODS.includes(req.method)) {
    return next();
  }
  if (isAllowedPath(req.originalUrl)) {
    return next();
  }
  const demo = await isDemoMode();
  console.log("demo" , demo)
  if (!demo) {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'action is denied in demo mode',
  });
};
