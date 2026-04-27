import { Setting, Currency, Language } from '../models/index.js';

async function seedDefaultSettings() {
  try {
    const defaultCurrency = await Currency.findOne({ is_default: true, deleted_at: null });
    const defaultLanguage = await Language.findOne({ is_default: true, deleted_at: null });

    const seedData = {
      app_name: 'Wapi',
      app_description: 'Whatsapp Marketing Platform',
      app_email: 'support@example.com',
      support_email: 'support@example.com',
      favicon_url: '/uploads/attachments/favicon.png',
      logo_light_url: '/uploads/attachments/logo_light.png',
      logo_dark_url: '/uploads/attachments/logo_dark.png',
      sidebar_light_logo_url: '/uploads/attachments/sidebar_light_logo.png',
      sidebar_dark_logo_url: '/uploads/attachments/sidebar_dark_logo.png',
      maintenance_mode: false,
      maintenance_title: 'Under Maintenance',
      maintenance_message: 'We are performing some maintenance. Please check back later.',
      maintenance_image_url: '',
      maintenance_allowed_ips: [],
      page_404_title: 'Page Not Found',
      page_404_content: 'The page you are looking for does not exist.',
      page_404_image_url: '',
      no_internet_title: 'No Internet Connection',
      no_internet_content: 'Please check your internet connection and try again.',
      no_internet_image_url: '',
      smtp_host: process.env.SMTP_HOST || '',
      smtp_port: parseInt(process.env.SMTP_PORT) || 587,
      smtp_user: process.env.SMTP_USER || '',
      smtp_pass: process.env.SMTP_PASS || '',
      mail_from_name: 'Wapi',
      mail_from_email: process.env.SMTP_USER || 'noreply@myapplication.com',
      default_theme_mode: 'light',
      display_customizer: true,
      audio_calls_enabled: true,
      video_calls_enabled: true,
      allow_voice_message: true,
      allow_archive_chat: true,
      allow_media_send: true,
      allow_user_block: true,
      allow_user_signup: true,
      call_timeout_seconds: 25,
      session_expiration_days: 7,
      document_file_limit: 15,
      audio_file_limit: 15,
      video_file_limit: 20,
      image_file_limit: 10,
      multiple_file_share_limit: 10,
      maximum_message_length: 40000,
      allowed_file_upload_types: [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
        'mp4', 'mpeg', 'mov', 'webm',
        'mp3', 'wav', 'ogg',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt',
        'json'
      ],
      app_id: process.env.app_id || null,
      app_secret: process.env.app_secret || null,
      configuration_id: null,
      max_groups_per_user: 500,
      max_group_members: 1024,
      whatsapp_webhook_url: `/whatsapp/webhook`,
      webhook_verification_token: process.env.WHATSAPP_VERIFY_TOKEN || null,
      free_trial_enabled: false,
      free_trial_days: 7,
      trial_expired_delete_days: 0,
      stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || null,
      stripe_secret_key: process.env.STRIPE_SECRET_KEY || null,
      stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET || null,
      razorpay_key_id: process.env.RAZORPAY_KEY_ID || null,
      razorpay_key_secret: process.env.RAZORPAY_KEY_SECRET || null,
      is_razorpay_active: false,
      is_demo_mode: false,
      show_whatsapp_config: true,
      show_email_config: true,
      connection_method: 'manual',
      is_stripe_active: false,
      razorpay_webhook_secret: process.env.RAZORPAY_WEBHOOK_SECRET || null,
      demo_user_email: 'john@example.com',
      demo_user_password: '123456789',
      demo_agent_email: 'jack@example.com',
      demo_agent_password: '123456789',
      default_language: defaultLanguage?.locale || 'en',
      default_currency: defaultCurrency?._id || null,
      enable_cash: false,
      paypal_client_id: process.env.PAYPAL_CLIENT_ID || null,
      paypal_client_secret: process.env.PAYPAL_CLIENT_SECRET || null,
      paypal_mode: 'sandbox',
      is_paypal_active: false,
      paypal_webhook_id: process.env.PAYPAL_WEBHOOK_ID || null
    };

    const updatedSettings = await Setting.findOneAndUpdate({},
      { $set: seedData },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    console.log('Default settings seeded/updated successfully!');
    return updatedSettings;
  } catch (error) {
    console.error('Error seeding default settings:', error);
    throw error;
  }
}

export default seedDefaultSettings;
