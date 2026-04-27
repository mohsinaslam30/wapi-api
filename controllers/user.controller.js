import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { User, Subscription, Plan, Role, Setting } from "../models/index.js";
import { sendMail } from "../utils/mail.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = "created_at";
const DEFAULT_SORT_ORDER = -1;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = [
  "_id",
  "name",
  "email",
  "phone",
  "role_id",
  "status",
  "created_at",
  "last_login",
];

const SORT_ORDER = {
  ASC: 1,
  DESC: -1,
};

const ALLOWED_ROLES = ["user", "agent", "super_admin"];
const BCRYPT_SALT_ROUNDS = 10;
const PASSWORD_MIN_LENGTH = 8;

const PLAN_SENSITIVE_FIELDS =
  "-stripe_price_id -stripe_product_id -stripe_payment_link_id -stripe_payment_link_url -razorpay_plan_id";

const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || DEFAULT_PAGE);
  const limit = Math.max(
    1,
    Math.min(MAX_LIMIT, parseInt(query.limit, 10) || DEFAULT_LIMIT),
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const parseSortParams = (query) => {
  const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
    ? query.sort_by
    : DEFAULT_SORT_FIELD;

  const sortOrder =
    query.sort_order?.toUpperCase() === "ASC"
      ? SORT_ORDER.ASC
      : DEFAULT_SORT_ORDER;

  return { sortField, sortOrder };
};

const buildSearchQuery = async (searchTerm) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return {};
  }

  const sanitizedSearch = searchTerm.trim();
  const regex = { $regex: sanitizedSearch, $options: "i" };

  const conditions = [{ name: regex }, { email: regex }, { phone: regex }];

  try {
    const matchingPlans = await Plan.find({
      name: regex,
      deleted_at: null,
    }).select("_id");
    if (matchingPlans.length > 0) {
      const planIds = matchingPlans.map((p) => p._id);
      const matchingSubscriptions = await Subscription.find({
        plan_id: { $in: planIds },
        deleted_at: null,
      }).select("user_id");

      if (matchingSubscriptions.length > 0) {
        const userIds = matchingSubscriptions.map((s) => s.user_id);
        conditions.push({ _id: { $in: userIds } });
      }
    }
  } catch (err) {
    console.error("Error searching by plan name:", err);
  }

  return { $or: conditions };
};

const validateAndFilterIds = (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return {
      isValid: false,
      message: "User IDs array is required and must not be empty",
      validIds: [],
    };
  }

  const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    return {
      isValid: false,
      message: "No valid user IDs provided",
      validIds: [],
    };
  }

  return {
    isValid: true,
    validIds,
  };
};

const normalizeBooleanQuery = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  return null;
};

const validateUserCreationInput = (data) => {
  const {
    name,
    email,
    password,
    phone,
    country,
    country_code: countryCode,
    note,
  } = data;
  const errors = [];

  if (!name) errors.push("Name is required");
  if (!email) errors.push("Email is required");
  if (!password) errors.push("Password is required");

  if (
    name &&
    (typeof name !== "string" ||
      name.trim().length < 2 ||
      name.trim().length > 50)
  ) {
    errors.push("Name must be between 2 and 50 characters");
  }

  if (
    email &&
    (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  ) {
    errors.push("Invalid email format");
  }

  if (
    password &&
    (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH)
  ) {
    errors.push(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`,
    );
  }

  if (
    phone &&
    (typeof phone !== "string" ||
      phone.trim().length < 6 ||
      phone.trim().length > 15)
  ) {
    errors.push("Phone must be between 6 and 15 digits");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const buildUserResponseWithPlan = (user, subscriptionMapEntry) => {
  const baseUser = {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role_id: user.role_id,
    status: user.status,
    country: user.country,
    country_code: user.country_code,
    note: user.note,
    email_verified: user.email_verified,
    last_login: user.last_login,
    created_at: user.created_at,
    updated_at: user.updated_at,
    storage_limit: `${user.storage_limit || 0} MB`,
    storage_used: `${parseFloat(((user.storage_used || 0) / (1024 * 1024)).toFixed(2))} MB`,
  };

  if (!subscriptionMapEntry) {
    return {
      ...baseUser,
      current_subscription: null,
      current_plan: null,
    };
  }

  const { subscription, plan } = subscriptionMapEntry;

  return {
    ...baseUser,
    current_subscription: subscription
      ? {
          _id: subscription._id,
          status: subscription.status,
          started_at: subscription.started_at,
          trial_ends_at: subscription.trial_ends_at,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          expires_at: subscription.expires_at,
          cancelled_at: subscription.cancelled_at,
          payment_gateway: subscription.payment_gateway,
          payment_method: subscription.payment_method,
          payment_status: subscription.payment_status,
          auto_renew: subscription.auto_renew,
          features: subscription.features,
          is_custom: subscription.is_custom,
          duration: subscription.duration,
        }
      : null,
    current_plan: plan
      ? {
          _id: plan._id,
          name: plan.name,
          slug: plan.slug,
          price: plan.price,
          billing_cycle: plan.billing_cycle,
          features: plan.features,
        }
      : null,
  };
};

const fetchLatestSubscriptionsForUsers = async (userIds) => {
  if (!userIds || userIds.length === 0) {
    return {};
  }

  const subscriptions = await Subscription.find({
    user_id: { $in: userIds },
    deleted_at: null,
    $or: [
      { status: { $in: ["active", "trial"] } },
      { payment_gateway: "manual", status: "pending" },
    ],
  })
    .populate("plan_id", PLAN_SENSITIVE_FIELDS)
    .sort({ created_at: -1 })
    .lean();

  const subscriptionMap = {};

  for (const sub of subscriptions) {
    const key = sub.user_id.toString();
    if (!subscriptionMap[key]) {
      subscriptionMap[key] = {
        subscription: sub,
        plan: sub.plan_id || null,
      };
    }
  }

  return subscriptionMap;
};

export const getAllUsers = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchTerm = req.query.search || "";
    const { status, plan_id: planId, plan_slug: planSlug } = req.query;

    const userQuery = {
      deleted_at: null,
    };

    const searchQuery = await buildSearchQuery(searchTerm);
    Object.assign(userQuery, searchQuery);

    if (status !== undefined) {
      const normalizedStatus = normalizeBooleanQuery(status);
      if (normalizedStatus === null) {
        return res.status(400).json({
          success: false,
          message: "Status must be a boolean value (true/false)",
        });
      }
      userQuery.status = normalizedStatus;
    }

    if (planId || planSlug) {
      const planIds = [];

      if (planId) {
        if (!mongoose.Types.ObjectId.isValid(planId)) {
          return res.status(400).json({
            success: false,
            message: "Valid plan_id is required",
          });
        }
        planIds.push(new mongoose.Types.ObjectId(planId));
      }

      if (planSlug) {
        const planDoc = await Plan.findOne({
          slug: planSlug,
          deleted_at: null,
        })
          .select("_id")
          .lean();

        if (!planDoc && !planId) {
          return res.status(404).json({
            success: false,
            message: "Plan not found for provided plan_slug",
          });
        }

        if (planDoc) {
          planIds.push(planDoc._id);
        }
      }

      if (planIds.length > 0) {
        const now = new Date();

        const subsForPlan = await Subscription.find({
          plan_id: { $in: planIds },
          deleted_at: null,
          status: { $in: ["active", "trial"] },
          current_period_end: { $gte: now },
        })
          .select("user_id")
          .lean();

        const userIds = [
          ...new Set(subsForPlan.map((s) => s.user_id.toString())),
        ];

        if (userIds.length === 0) {
          return res.status(200).json({
            success: true,
            data: {
              users: [],
              pagination: {
                currentPage: page,
                totalPages: 0,
                totalItems: 0,
                itemsPerPage: limit,
              },
            },
          });
        }

        userQuery._id = {
          $in: userIds.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    }

    const totalCount = await User.countDocuments(userQuery);

    const users = await User.find(userQuery)
      .select("-password")
      .populate("role_id")
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    const userIdsOnPage = users.map((u) => u._id);
    const subscriptionMap =
      await fetchLatestSubscriptionsForUsers(userIdsOnPage);

    const usersWithPlan = users.map((user) => {
      const entry = subscriptionMap[user._id.toString()] || null;
      return buildUserResponseWithPlan(user, entry);
    });

    return res.status(200).json({
      success: true,
      data: {
        users: usersWithPlan,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving users:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve users",
      error: error.message,
    });
  }
};

export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required",
      });
    }

    const user = await User.findOne({
      _id: id,
      deleted_at: null,
    })
      .populate("role_id")
      .select("-password")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const subscriptionMap = await fetchLatestSubscriptionsForUsers([user._id]);
    const entry = subscriptionMap[user._id.toString()] || null;
    const userWithPlan = buildUserResponseWithPlan(user, entry);

    return res.status(200).json({
      success: true,
      data: userWithPlan,
    });
  } catch (error) {
    console.error("Error retrieving user:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user",
      error: error.message,
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      country,
      country_code: countryCode,
      note,
      role_id,
      status,
      email_verified: emailVerified,
      storage_limit,
    } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required",
      });
    }

    const user = await User.findOne({
      _id: id,
      deleted_at: null,
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (email !== undefined) {
      const normalizedEmail =
        typeof email === "string" ? email.toLowerCase().trim() : email;

      if (!normalizedEmail) {
        return res.status(400).json({
          success: false,
          message: "Email cannot be empty",
        });
      }

      if (normalizedEmail !== user.email) {
        const existingEmailUser = await User.findOne({
          email: normalizedEmail,
          _id: { $ne: user._id },
          deleted_at: null,
        });

        if (existingEmailUser) {
          return res.status(409).json({
            success: false,
            message: "Email is already in use by another user",
          });
        }

        user.email = normalizedEmail;
      }
    }

    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Name cannot be empty",
        });
      }
      user.name = name.trim();
    }

    if (phone !== undefined) {
      if (phone !== null && phone !== "") {
        if (typeof phone !== "string") {
          return res.status(400).json({
            success: false,
            message: "Phone must be a string",
          });
        }
      }
      user.phone = phone || null;
    }

    if (country !== undefined) {
      user.country = country || null;
    }

    if (countryCode !== undefined) {
      user.country_code = countryCode || null;
    }

    if (note !== undefined) {
      user.note = note || null;
    }

    const role = await Role.findOne({ _id: role_id });
    if (!role) {
      return res.status(404).json({
        success: false,
        message: "Role not found",
      });
    }

    if (role) {
      user.role_id = role._id;
    }

    if (status !== undefined) {
      const normalizedStatus = normalizeBooleanQuery(status);
      if (normalizedStatus === null) {
        return res.status(400).json({
          success: false,
          message: "Status must be a boolean value (true/false)",
        });
      }
      user.status = normalizedStatus;
    }

    if (emailVerified !== undefined) {
      const normalizedEmailVerified = normalizeBooleanQuery(emailVerified);
      if (normalizedEmailVerified === null) {
        return res.status(400).json({
          success: false,
          message: "email_verified must be a boolean value (true/false)",
        });
      }
      user.email_verified = normalizedEmailVerified;
    }

    if (storage_limit !== undefined) {
      const parsedLimit = parseInt(storage_limit);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        user.storage_limit = parsedLimit;
      }
    }

    await user.save();

    const plainUser = user.toObject();
    delete plainUser.password;

    const subscriptionMap = await fetchLatestSubscriptionsForUsers([user._id]);
    const entry = subscriptionMap[user._id.toString()] || null;
    const userWithPlan = buildUserResponseWithPlan(plainUser, entry);

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: userWithPlan,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
};

export const createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      country,
      country_code: countryCode,
      note,
      role_id,
    } = req.body;

    const validation = validateUserCreationInput(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.errors,
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedName = name.trim();
    const trimmedPhone = phone ? phone.trim() : null;

    const existingUser = await User.findOne({
      email: normalizedEmail,
      deleted_at: null,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email is already in use",
      });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    let roleDoc;

    if (role_id && mongoose.Types.ObjectId.isValid(role_id)) {
      roleDoc = await Role.findById(role_id);

      if (!roleDoc) {
        return res.status(400).json({
          success: false,
          message: "Role not found",
        });
      }
    } else {
      roleDoc = await Role.findOne({ name: "user" });

      if (!roleDoc) {
        return res.status(400).json({
          success: false,
          message: "Default role not found",
        });
      }
    }

    const newUser = await User.create({
      name: trimmedName,
      email: normalizedEmail,
      password: hashedPassword,
      phone: trimmedPhone,
      country: country || null,
      country_code: countryCode || null,
      note: note || null,
      role_id: roleDoc._id,
      email_verified: false,
      status: true,
      storage_limit:
        (await Setting.findOne().select("storage_limit").lean())
          ?.storage_limit || 100,
    });

    const userResponse = {
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      country: newUser.country,
      country_code: newUser.country_code,
      note: newUser.note,
      role_id: newUser.role_id,
      email_verified: newUser.email_verified,
      status: newUser.status,
      storage_limit: `${newUser.storage_limit || 0} MB`,
      storage_used: "0 MB",
      created_at: newUser.created_at,
      updated_at: newUser.updated_at,
    };

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: userResponse,
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: error.message,
    });
  }
};

export const deleteUsers = async (req, res) => {
  try {
    const { ids } = req.body;

    const validation = validateAndFilterIds(ids);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    const { validIds } = validation;

    const existingUsers = await User.find({
      _id: { $in: validIds },
      deleted_at: null,
    }).select("_id");

    if (existingUsers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No users found with the provided IDs",
      });
    }

    const foundIds = existingUsers.map((u) => u._id.toString());
    const notFoundIds = validIds.filter(
      (id) => !foundIds.includes(id.toString()),
    );

    const now = new Date();

    const deleteResult = await User.updateMany(
      { _id: { $in: foundIds } },
      { $set: { deleted_at: now, status: false } },
    );

    const response = {
      success: true,
      message: `${deleteResult.modifiedCount} user(s) deleted successfully`,
      data: {
        deletedCount: deleteResult.modifiedCount,
        deletedIds: foundIds,
      },
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} user(s) not found or already deleted`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error deleting users:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete users",
      error: error.message,
    });
  }
};

export const sendResetPasswordLink = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Valid user ID is required" });
    }

    const user = await User.findOne({ _id: id, deleted_at: null });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 3600000);

    user.reset_password_token = resetToken;
    user.reset_password_expires = resetExpires;
    await user.save();

    const appUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const resetLink = `${appUrl}/auth/reset_password?token=${resetToken}`;

    const emailSubject = "Password Reset Request";
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>An administrator has initiated a password reset for your account.</p>
        <p>Please click the button below to set a new password. This link will expire in 1 hour.</p>
        <div style="margin: 20px 0;">
          <a href="${resetLink}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
        </div>
        <p>If you did not expect this email, you can safely ignore it.</p>
        <p>Thank you,<br>The Team</p>
      </div>
    `;

    const mailSent = await sendMail(user.email, emailSubject, emailHtml);

    if (!mailSent) {
      return res
        .status(500)
        .json({ success: false, message: "Failed to send reset link email" });
    }

    return res.status(200).json({
      success: true,
      message: "Password reset link sent to user email",
    });
  } catch (error) {
    console.error("Error sending reset password link:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export default {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUsers,
  sendResetPasswordLink,
};
