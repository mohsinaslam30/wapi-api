import { body } from 'express-validator';


const validateLicenseBody = [
  body('envato_username').notEmpty().withMessage('Envato Username is required'),
  body('license')
    .notEmpty().withMessage('License is required').bail()
    .matches(/^([a-f0-9]{8})-(([a-f0-9]{4})-){3}([a-f0-9]{12})$/i)
    .withMessage('Invalid purchase code format')
];


const validateLicenseWithAdminBody = [
  ...validateLicenseBody,
  body('admin.first_name').optional().notEmpty().withMessage('First name cannot be empty if provided'),
  body('admin.last_name').optional().notEmpty().withMessage('Last name cannot be empty if provided'),
  body('admin.email').optional().isEmail().withMessage('Email must be valid if provided'),
  body('admin.password').optional().isLength({ min: 8 }).withMessage('Password must be at least 8 characters if provided'),
  body('admin.password_confirmation').optional().custom((v, { req }) => v === req.body.admin?.password).withMessage('Passwords must match')
];


const validateDbBody = [
  body('database.DB_HOST').notEmpty().withMessage('Host is required').bail()
    .matches(/^\S+$/).withMessage('There should be no whitespace in host name')
    .matches(/^[a-zA-Z0-9.-]+$/).withMessage('Host name contains invalid characters'),
  body('database.DB_PORT').notEmpty().withMessage('Port is required').bail()
    .isInt({ min: 1, max: 65535 }).withMessage('Port must be a valid port number (1-65535)').bail()
    .matches(/^\S+$/).withMessage('There should be no whitespace in port number'),
  body('database.DB_USERNAME').optional({ nullable: true, checkFalsy: true }).matches(/^\S*$/).withMessage('Username should not contain whitespace'),
  body('database.DB_PASSWORD').optional({ nullable: true, checkFalsy: true }).matches(/^\S*$/).withMessage('Password should not contain whitespace'),
  body('database.DB_DATABASE').notEmpty().withMessage('Database name is required').bail()
    .matches(/^\S+$/).withMessage('There should be no whitespace in database name')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Database name contains invalid characters')
];


function getDbValidators() {
  return [
    body('database.DB_HOST').notEmpty().withMessage('Host is required').bail()
      .matches(/^\S+$/).withMessage('There should be no whitespace in host name')
      .matches(/^[a-zA-Z0-9.-]+$/).withMessage('Host name contains invalid characters'),
    body('database.DB_PORT').notEmpty().withMessage('Port is required').bail()
      .isInt({ min: 1, max: 65535 }).withMessage('Port must be a valid port number (1-65535)').bail()
      .matches(/^\S+$/).withMessage('There should be no whitespace in port number'),
    body('database.DB_USERNAME').optional({ nullable: true, checkFalsy: true }).matches(/^\S*$/).withMessage('Username should not contain whitespace'),
    body('database.DB_PASSWORD').optional({ nullable: true, checkFalsy: true }).matches(/^\S*$/).withMessage('Password should not contain whitespace'),
    body('database.DB_DATABASE').notEmpty().withMessage('Database name is required').bail()
      .matches(/^\S+$/).withMessage('There should be no whitespace in database name')
      .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Database name contains invalid characters')
  ];
}


function getAdminValidators() {
  return [
    body('admin.first_name').notEmpty().withMessage('First name is required').bail()
      .isLength({ min: 2 }).withMessage('First name must be at least 2 characters').bail()
      .matches(/^[a-zA-Z\s]+$/).withMessage('First name can only contain letters and spaces'),
    body('admin.last_name').notEmpty().withMessage('Last name is required').bail()
      .isLength({ min: 2 }).withMessage('Last name must be at least 2 characters').bail()
      .matches(/^[a-zA-Z\s]+$/).withMessage('Last name can only contain letters and spaces'),
    body('admin.email').notEmpty().withMessage('Email is required').bail()
      .isEmail().withMessage('Email must be valid').bail()
      .isLength({ max: 254 }).withMessage('Email is too long'),
    body('admin.password').notEmpty().withMessage('Password is required').bail()
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('admin.password_confirmation').notEmpty().withMessage('Password confirmation is required').bail()
      .custom((v, { req }) => v === req.body?.admin?.password).withMessage('Passwords must match')
  ];
}

export {
  validateLicenseBody,
  validateLicenseWithAdminBody,
  validateDbBody,
  getDbValidators,
  getAdminValidators
};
