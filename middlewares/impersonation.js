import { Session } from '../models/index.js';

export const checkImpersonationStatus = async (req, res, next) => {
  req.isImpersonating = false;

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const session = await Session.findOne({
      session_token: token,
      agenda: { $regex: /^impersonation_by_/ },
      status: 'active',
    }).lean();

    if (session) {
      req.isImpersonating = true;
      req.impersonatorId = session.agenda.replace('impersonation_by_', '');
    }
  } catch (err) {
    console.log('Error while impersonating',err);
  }

  next();
};

export const restrictImpersonationActions = (req, res, next) => {
  if (!req.isImpersonating) {
    return next();
  }

  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (!safeMethods.includes(req.method)) {
    return res.status(403).json({ success: false, message: 'You can not make changes while impersonating this account.' });
  }

  next();
};