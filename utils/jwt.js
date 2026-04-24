import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET is not set in environment variables.");
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

export const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};
