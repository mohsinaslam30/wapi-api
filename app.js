import express from "express";
import cors from "cors";
import path from "path";
import { handleWebhookVerification } from "./controllers/whatsapp-webhook.controller.js";
import { handleIncomingMessage as handleIncomingMessageOriginal, handleStatusUpdate as handleStatusUpdateOriginal } from "./controllers/whatsapp-webhook.controller.js";
import { denyMutationInDemo } from "./middlewares/demo-mode.js";
import { rtInit } from "./node/src/middlewares/runtime-init.js";
import session from 'express-session';
import { fileURLToPath } from 'url';
import ejsMate from 'ejs-mate';
import { checkPlanLimit } from "./middlewares/plan-permission.js";


const app = express();
app.set("trust proxy", true);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'node/views'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'whatsdesk-install-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS : [];
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS blocked: " + origin));
      }
    },
    credentials: true,
  })
);

const captureRawBody = (req, res, next) => {
  const isLegacyWebhook = req.originalUrl === "/api/webhook/stripe" || req.originalUrl === "/api/webhook/razorpay" || req.originalUrl === "/api/webhook/paypal";
  const isPaymentWebhook = req.originalUrl.startsWith("/api/payments/webhook/");

  if (isLegacyWebhook || isPaymentWebhook) {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      req.rawBody = data;
      req.body = data;
      next();
    });
  } else {
    next();
  }
};

app.use(captureRawBody);
// app.use(rtInit);

import { handleStripeWebhook, handleRazorpayWebhook, handlePayPalWebhook } from "./controllers/webhook.controller.js";
app.post("/api/webhook/stripe", handleStripeWebhook);
app.post("/api/webhook/razorpay", handleRazorpayWebhook);
app.post("/api/webhook/paypal", handlePayPalWebhook);

app.use("/webhook/facebook/leadgen", facebookLeadRoutes);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use('/install', express.static(path.join(__dirname, 'public/install')));

app.use('/api', denyMutationInDemo);

// import { initializeInstaller, createInstallationMiddleware } from './lib/install.js';

// await initializeInstaller(app);

// app.use(createInstallationMiddleware());

import webhookRoutes from "./routes/webhook.routes.js";
app.use("/api/webhook", webhookRoutes);

import authRoutes from "./routes/auth.routes.js";
import faqRoutes from "./routes/faq.routes.js";
import inquiryRoutes from "./routes/contact-inquiries.routes.js";
import testimonialRoutes from "./routes/testimonial.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import planRoutes from "./routes/plan.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import whatsappConnectionRoutes from "./routes/whatsapp-connection.routes.js";
import unifiedWhatsAppRoutes from "./routes/unified-whatsapp.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import apiKeyRoutes from "./routes/api-key.routes.js";
import aiAssistanceRoutes from "./routes/ai-assistance.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import agentTaskRoutes from "./routes/agent-task.routes.js";
import automationRoutes from "./routes/automation.routes.js";
import templateRoutes from "./routes/template.routes.js";
import ecommerceWebhookRoutes from "./routes/ecommerce-webhook.routes.js";
import ecommerceCatalogRoutes from "./routes/ecommerce-catalog.routes.js";
import contactRoutes from "./routes/contact.routes.js";
import customFieldRoutes from "./routes/custom-field.routes.js";
import tagRoutes from "./routes/tag.routes.js";
import settingsRoutes from "./routes/setting.routes.js";
import userSettingRoutes from "./routes/user-setting.routes.js";
import userRoutes from "./routes/user.routes.js";
import attachmentRoutes from "./routes/attachment.routes.js";
import campaignRoutes from "./routes/campaign.routes.js";
import messageStatusRoutes from "./routes/message-status.routes.js";
import campaignStatsRoutes from "./routes/campaign-stats.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import adminDashboardRoutes from "./routes/admin-dashboard.routes.js";
import adminTemplateRoutes from "./routes/admin-template.routes.js";
import landingPageRoutes from "./routes/landing-page.routes.js";
import ecommerceOrderRoutes from "./routes/ecommerce-order.routes.js";
import widgetRoutes from "./routes/widget.routes.js";
import shortLinkRoutes from "./routes/short-link.routes.js";
import importJobRoutes from "./routes/import-job.routes.js";
import replyMaterialRoutes from "./routes/reply-material.routes.js";
import workingHoursRoutes from "./routes/working-hours.routes.js";
import workspaceRoutes from "./routes/workspace.routes.js";
import chatbotRoutes from "./routes/chatbot.routes.js";
import sequenceRoutes from "./routes/sequence.routes.js";
import teamRoutes from "./routes/team.route.js";
import googleRoutes from "./routes/google.routes.js";
import formBuilderRoutes from "./routes/formBuilder.route.js";
import submissionRoutes from "./routes/submission.route.js";
import quickReplyRoutes from "./routes/quick-reply.routes.js";
import impersonationRoutes from "./routes/impersonation.routes.js";
import kanbanFunnelRoutes from "./routes/kanban-funnel.routes.js";
import segmentRoutes from "./routes/segment.routes.js";
import { checkImpersonationStatus, restrictImpersonationActions } from "./middlewares/impersonation.js";

import facebookRoutes from "./routes/facebook.routes.js";
import facebookAdRoutes from "./routes/facebook-ad-campaign.routes.js";
import facebookLeadRoutes from "./routes/facebook-lead.routes.js";

import wabaConfigurationRoutes from "./routes/waba-configuration.routes.js";
import messageBotRoutes from "./routes/message-bot.routes.js";
import whatsappCallingRoutes from "./routes/whatsapp-calling.routes.js";
import currencyRoutes from "./routes/currency.routes.js";
import languageRoutes from "./routes/language.routes.js";
import pageRoutes from "./routes/pages.routes.js";
import roleRoutes from "./routes/role.routes.js";
import taxRoutes from "./routes/tax.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import paymentGatewayConfigRoutes from "./routes/payment-gateway-config.routes.js";
import paymentWebhookRoutes from "./routes/payment-webhook.routes.js";


import { redirectShortLink } from "./controllers/short-link.controller.js";
import { Setting } from "./models/index.js";




app.get("/", (req, res) => {
  res.json({ message: "App is running successfully" });
});

app.get("/api/is-demo-mode", async (req, res) => {
  try {
    const setting = await Setting.findOne({}).select("is_demo_mode demo_user_email demo_user_password demo_agent_email logo_light_url logo_dark_url favicon_url demo_agent_password -_id").lean();

    const is_demo_mode = setting?.is_demo_mode ?? false;

    return res.status(200).json({
      success: true,
      is_demo_mode,
      logo_light_url: setting?.logo_light_url,
      logo_dark_url: setting?.logo_dark_url,
      favicon_url: setting?.favicon_url,
      ...(is_demo_mode
        ? {
          demo_user_email: setting?.demo_user_email,
          demo_user_password: setting?.demo_user_password,
          demo_agent_email: setting?.demo_agent_email,
          demo_agent_password: setting?.demo_agent_password,
        }
        : {}),
    });
  } catch (error) {
    console.error("Error fetching demo mode setting:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch demo mode setting",
      error: error.message,
    });
  }
});

app.use(checkImpersonationStatus);
app.use("/api/impersonation", impersonationRoutes);
app.use(restrictImpersonationActions);

app.use("/api/auth", authRoutes);
app.use("/api/faq", faqRoutes);
app.use("/api/inquiry", inquiryRoutes);
app.use("/api/testimonial", testimonialRoutes);
app.use("/api/whatsapp", unifiedWhatsAppRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/plan", planRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/whatsapp-connection", whatsappConnectionRoutes);
app.use("/api/ai", aiAssistanceRoutes);
app.use("/api/agent", agentRoutes);
app.use("/api/agent-task", agentTaskRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/automation", automationRoutes);
app.use("/api/template", templateRoutes);
app.use("/api/ecommerce-webhook", ecommerceWebhookRoutes);
app.use("/api/ecommerce-catalog", ecommerceCatalogRoutes);
app.use("/api/ecommerce-order", ecommerceOrderRoutes);
app.use("/api/contacts", contactRoutes);
app.use("/api/custom-fields", customFieldRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/user-settings", userSettingRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attachment", attachmentRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/message-status", messageStatusRoutes);
app.use("/api/campaign-stats", campaignStatsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin-dashboard", adminDashboardRoutes);
app.use("/api/admin/templates", adminTemplateRoutes);
app.use("/api/landing-page", landingPageRoutes);
app.use("/api/api-keys", apiKeyRoutes);
app.use("/api/widgets", widgetRoutes);
app.use("/api/short-links", shortLinkRoutes);
app.use("/api/import-jobs", importJobRoutes);
app.use("/api/reply-materials", replyMaterialRoutes);
app.use("/api/working-hours", workingHoursRoutes);
app.use("/api/workspaces", workspaceRoutes);
app.use("/api/sequences", sequenceRoutes);
app.use("/api/chatbots", chatbotRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/google", googleRoutes);
app.use("/api/forms", formBuilderRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/quick-replies", quickReplyRoutes);
app.use("/api/kanban-funnels", kanbanFunnelRoutes);
app.use("/api/segments", segmentRoutes);
app.use("/api/facebook", facebookRoutes);
app.use("/api/facebook-ads", facebookAdRoutes);
app.use("/api/facebook-leads", facebookLeadRoutes);

app.use("/api/waba-configurations", wabaConfigurationRoutes);
app.use("/api/message-bots", messageBotRoutes);
app.use("/api/whatsapp/calling", whatsappCallingRoutes);
app.use("/api/currencies", currencyRoutes);
app.use("/api/languages", languageRoutes);
app.use("/api/pages", pageRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/taxes", taxRoutes);
app.use("/api/appointments", appointmentRoutes);

app.use("/api/payment-gateways", paymentGatewayConfigRoutes);

app.use("/api/payments", paymentWebhookRoutes);



app.get("/short_link/wp/:code", redirectShortLink);

app.get("/webhook/whatsapp", handleWebhookVerification);

app.post("/webhook/whatsapp", (req, res) => {
  const entry = req.body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const io = app.get("io");
  const change = req.body.entry?.[0]?.changes?.[0];
  const messages = change?.value?.messages;

  console.log("Messages:", messages[0].errors);

  if (value?.statuses) {

    return handleStatusUpdateOriginal(req, res, io);
  } else if (value?.messages) {
    const message = value.messages[0];
    if (message.type === 'call') {
      import('./services/whatsapp/call-automation.service.js').then(m => {
        m.default.handleIncomingCall(
          message.call.id,
          value.metadata.phone_number_id,
          message.from
        );
      });
      return res.sendStatus(200);
    }
    return handleIncomingMessageOriginal(req, res, io);
  } else if (changes?.field === 'calls') {
    import('./services/whatsapp/call-automation.service.js').then(m => {
      const callData = value.calls?.[0];
      console.log("callData", callData);

      if (callData) {
        m.default.handleCallWebhook(
          callData,
          value.metadata.phone_number_id
        );
      }
    });
    return res.sendStatus(200);
  } else {
    console.log("Unknown WhatsApp webhook type:", req.body);
    return res.sendStatus(200);
  }
});



export default app;
