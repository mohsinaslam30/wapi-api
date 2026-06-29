import { Template, User } from '../models/index.js';

async function seedAdminTemplates() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@admin.com';
    const admin = await User.findOne({ email: adminEmail });
    const adminId = admin ? admin._id : null;

    const templates = [
      // --- HEALTHCARE ---
      {
        template_name: 'admin_healthcare_appointment_booking',
        sector: 'healthcare',
        template_category: 'appointment_booking',
        category: 'UTILITY',
        template_type: 'call_permission',
        call_permission: true,
        header: { format: 'text', text: 'Appointment Booking' },
        message_body: 'Hello {{1}}, thank you for choosing our clinic. Would you like us to call you to confirm your appointment for {{2}}?',
        body_variables: [
          { key: '1', example: 'John Doe' },
          { key: '2', example: 'General Checkup' }
        ],
        footer_text: 'Stay Healthy!',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_healthcare_appointment_reminder',
        sector: 'healthcare',
        template_category: 'appointment_reminder',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Appointment Reminder' },
        message_body: 'Hi {{1}}, this is a reminder for your appointment tomorrow at {{2}} with Dr. {{3}}.',
        body_variables: [
          { key: '1', example: 'John Doe' },
          { key: '2', example: '10:00 AM' },
          { key: '3', example: 'Smith' }
        ],
        footer_text: 'Please arrive 10 minutes early.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_healthcare_lab_reports',
        sector: 'healthcare',
        template_category: 'lab_reports',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Lab Report Ready' },
        message_body: 'Dear {{1}}, your lab reports for {{2}} are now ready. You can view them here: {{3}}',
        body_variables: [
          { key: '1', example: 'John Doe' },
          { key: '2', example: 'Blood Test' },
          { key: '3', example: 'https://example.com/reports' }
        ],
        footer_text: 'Contact us for any questions.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_healthcare_prescription_ready',
        sector: 'healthcare',
        template_category: 'prescription_ready',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Prescription Ready' },
        message_body: 'Hello {{1}}, your prescription from Dr. {{2}} is ready for pickup at {{3}}.',
        body_variables: [
          { key: '1', example: 'John Doe' },
          { key: '2', example: 'Smith' },
          { key: '3', example: 'Main Pharmacy' }
        ],
        footer_text: 'Thank you choosing our pharmacy.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_healthcare_health_tips',
        sector: 'healthcare',
        template_category: 'health_tips',
        category: 'MARKETING',
        template_type: 'standard',
        header: { format: 'text', text: 'Daily Health Tip' },
        message_body: 'Stay healthy! Here is your tip for today: {{1}}. Remember to stay hydrated!',
        body_variables: [
          { key: '1', example: 'Walk for at least 30 minutes daily' }
        ],
        footer_text: 'Brought to you by HealthDesk.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },

      // --- ECOMMERCE ---
      {
        template_name: 'admin_ecommerce_order_summary',
        sector: 'ecommerce',
        template_category: 'order_summary',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Order Summary' },
        message_body: 'Hi {{1}}, thank you for your order! Here is your summary:\nOrder ID: {{2}}\nTotal: {{3}}',
        body_variables: [
          { key: '1', example: 'Jane Doe' },
          { key: '2', example: '#12345' },
          { key: '3', example: '$99.99' }
        ],
        footer_text: 'Thank you for shopping with us!',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_ecommerce_order_management',
        sector: 'ecommerce',
        template_category: 'order_management',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Order Update' },
        message_body: 'Hello {{1}}, your order {{2}} has been processed. You can manage your order here: {{3}}',
        body_variables: [
          { key: '1', example: 'Jane Doe' },
          { key: '2', example: '#12345' },
          { key: '3', example: 'https://example.com/orders' }
        ],
        footer_text: 'Need help? Replied to this message.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_ecommerce_order_tracking',
        sector: 'ecommerce',
        template_category: 'order_tracking',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Track Your Order' },
        message_body: 'Hi {{1}}, your order {{2}} is on its way! Track it here: {{3}}',
        body_variables: [
          { key: '1', example: 'Jane Doe' },
          { key: '2', example: '#12345' },
          { key: '3', example: 'https://tracking.com/123' }
        ],
        footer_text: 'Enjoy your purchase!',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_ecommerce_new_arrivals',
        sector: 'ecommerce',
        template_category: 'new_arrivals',
        category: 'MARKETING',
        template_type: 'catalog',
        header: { format: 'text', text: 'New Arrivals' },
        message_body: 'Check out our latest arrivals! New items added today. Click below to view the catalog.',
        buttons: [
          { type: 'catalog', text: 'View Catalog' }
        ],
        footer_text: 'Explore more on our website.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_ecommerce_cart_reminder',
        sector: 'ecommerce',
        template_category: 'cart_reminder',
        category: 'MARKETING',
        template_type: 'standard',
        header: { format: 'text', text: 'Don\'t miss out!' },
        message_body: 'Hi {{1}}, you left some items in your cart! Complete your purchase now and get 5% off using code: {{2}}',
        body_variables: [
          { key: '1', example: 'Jane Doe' },
          { key: '2', example: 'COMEBACK5' }
        ],
        footer_text: 'Items are selling fast!',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_ecommerce_delivery_update',
        sector: 'ecommerce',
        template_category: 'delivery_update',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Delivery Update' },
        message_body: 'Great news! Your package is with the delivery partner and will reach you by {{1}}.',
        body_variables: [
          { key: '1', example: 'Monday, 5 PM' }
        ],
        footer_text: 'Keep your phone handy!',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_ecommerce_payment_confirmation',
        sector: 'ecommerce',
        template_category: 'payment_confirmation',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Payment Received' },
        message_body: 'Payment successful! We have received your payment of {{1}} for order {{2}}.',
        body_variables: [
          { key: '1', example: '$45.00' },
          { key: '2', example: '#5566' }
        ],
        footer_text: 'Thank you for your business.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_ecommerce_return_refund',
        sector: 'ecommerce',
        template_category: 'return_refund',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Refund Initiated' },
        message_body: 'Hi {{1}}, your refund for order {{2}} has been initiated. It should reflect in your account within {{3}} working days.',
        body_variables: [
          { key: '1', example: 'Jane Doe' },
          { key: '2', example: '#12345' },
          { key: '3', example: '5-7' }
        ],
        footer_text: 'We hope to see you again soon.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },

      // --- FASHION ---
      {
        template_name: 'admin_fashion_new_collection',
        sector: 'fashion',
        template_category: 'new_collection',
        category: 'MARKETING',
        template_type: 'carousel_media',
        header: { format: 'text', text: 'New Fashion Collection' },
        message_body: 'Experience our new Spring/Summer collection. Browse through our lookbook below.',
        carousel_cards: [
          {
            components: [
              { type: 'HEADER', format: 'IMAGE', media_url: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04' },
              { type: 'BODY', text: 'Classic Styles' }
            ]
          },
          {
            components: [
              { type: 'HEADER', format: 'IMAGE', media_url: 'https://images.unsplash.com/photo-1445205170230-053b830c6050' },
              { type: 'BODY', text: 'Modern Fits' }
            ]
          }
        ],
        footer_text: 'Style redefined.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_fashion_sale_offer',
        sector: 'fashion',
        template_category: 'sale_offer',
        category: 'MARKETING',
        template_type: 'limited_time_offer',
        is_limited_time_offer: true,
        offer_text: 'FLAT 50% OFF',
        has_expiration: true,
        coupon_code: 'FLASHSALE50',
        parameter_format: 'named',
        message_body: 'Flash Sale! Get 50% off on all items. Offer valid for the next 24 hours only!',
        buttons: [
          { type: 'copy_code', text: 'Code4' },
          { type: 'url', text: 'Shop Now', url: 'https://wapi-front-red.vercel.app' }
        ],
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_fashion_style_recommendation',
        sector: 'fashion',
        template_category: 'style_recommendation',
        category: 'MARKETING',
        template_type: 'carousel_product',
        header: { format: 'text', text: 'Picked for You' },
        message_body: 'Curated just for you! Based on your style, we think you will love these items.',
        carousel_cards: [
          {
            components: [
              { type: 'HEADER', format: 'IMAGE', media_url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f' },
              { type: 'BODY', text: 'Evening Wear Collection' },
              { type: 'BUTTON', buttons: [{ type: 'url', text: 'View Now', url: 'https://example.com/evening' }] }
            ]
          },
          {
            components: [
              { type: 'HEADER', format: 'IMAGE', media_url: 'https://images.unsplash.com/photo-1513094735237-8f2714a57c13' },
              { type: 'BODY', text: 'Casual Essentials' },
              { type: 'BUTTON', buttons: [{ type: 'url', text: 'View Now', url: 'https://example.com/casual' }] }
            ]
          }
        ],
        footer_text: 'Upgrade your wardrobe.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_fashion_back_in_stock',
        sector: 'fashion',
        template_category: 'back_in_stock',
        category: 'MARKETING',
        template_type: 'coupon',
        coupon_code: 'RESTOCK10',
        parameter_format: 'named',
        message_body: 'It is back! The items you loved are back in stock. Use the coupon below for an extra 10% off.',
        footer_text: 'Limited stock available.',
        buttons: [
          { type: 'copy_code', text: 'Copy Code' },
          { type: 'url', text: 'Shop Now', url: 'https://wapi-front-red.vercel.app' }
        ],
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_fashion_order_update',
        sector: 'fashion',
        template_category: 'order_update',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Fashion Order Update' },
        message_body: 'Hi {{1}}, your order {{2}} is being prepared for shipping. We will notify you once it is dispatched!',
        body_variables: [
          { key: '1', example: 'Jane' },
          { key: '2', example: '#FW990' }
        ],
        footer_text: 'Coming to you soon.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },

      // --- FINANCIAL SERVICE ---
      {
        template_name: 'admin_financial_service_transaction_alert',
        sector: 'financial_service',
        template_category: 'transaction_alert',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Transaction Alert' },
        message_body: 'Alert: Your account {{1}} has been debited by {{2}} at {{3}}. If not done by you, contact support.',
        body_variables: [
          { key: '1', example: 'X1234' },
          { key: '2', example: '$200.00' },
          { key: '3', example: 'ATM NYC' }
        ],
        footer_text: 'Secure banking with us.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_financial_service_payment_due_reminder',
        sector: 'financial_service',
        template_category: 'payment_due_reminder',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Payment Reminder' },
        message_body: 'Reminder: Your credit card payment of {{1}} for account {{2}} is due by {{3}}.',
        body_variables: [
          { key: '1', example: '$500.00' },
          { key: '2', example: 'X4433' },
          { key: '3', example: '25th March' }
        ],
        footer_text: 'Avoid late fees, pay on time.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_financial_service_loan_update',
        sector: 'financial_service',
        template_category: 'loan_update',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Loan status update' },
        message_body: 'Dear {{1}}, your loan application status for {{2}} has been updated to {{3}}.',
        body_variables: [
          { key: '1', example: 'Robert' },
          { key: '2', example: 'Home Loan' },
          { key: '3', example: 'In Review' }
        ],
        footer_text: 'Check your email for more details.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_financial_service_kyc_update',
        sector: 'financial_service',
        template_category: 'kyc_update',
        category: 'AUTHENTICATION',
        template_type: 'authentication',
        header: { format: 'none' },
        message_body: 'Your verification code for KYC update is {{1}}. This code expires in 10 minutes.',
        body_variables: [
          { key: '1', example: '123456' }
        ],
        authentication_options: {
          add_security_recommendation: true,
          code_expiration_minutes: 10,
          otp_code_length: 6,
          otp_buttons: [
            {
              otp_type: 'COPY_CODE',
              copy_button_text: 'Copy Code'
            }
          ]
        },
        footer_text: 'Do not share this code.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_financial_service_policy_update',
        sector: 'financial_service',
        template_category: 'policy_update',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Policy Update' },
        message_body: 'Important: We have updated our Terms of Service for your policy {{1}}. Review the changes here: {{2}}',
        body_variables: [
          { key: '1', example: 'POL-7788' },
          { key: '2', example: 'https://bank.com/terms' }
        ],
        footer_text: 'Thank you for your trust.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },

      // --- GENERAL ---
      {
        template_name: 'admin_general_customer_feedback',
        sector: 'general',
        template_category: 'customer_feedback',
        category: 'MARKETING',
        template_type: 'standard',
        header: { format: 'text', text: 'We Value Your Feedback' },
        message_body: 'Hi {{1}}, we would love to hear from you! How was your experience with {{2}}? Rate us here: {{3}}',
        body_variables: [
          { key: '1', example: 'Will' },
          { key: '2', example: 'our service' },
          { key: '3', example: 'https://rate.us' }
        ],
        footer_text: 'Every review helps us improve.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_general_welcome_message',
        sector: 'general',
        template_category: 'welcome_message',
        category: 'MARKETING',
        template_type: 'standard',
        header: { format: 'text', text: 'Welcome Aboard!' },
        message_body: 'Welcome to {{1}}! We are thrilled to have you with us. Explore our services',
        body_variables: [
          { key: '1', example: 'Wapi' }
        ],
        footer_text: 'Excited to start this journey.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_general_promotion',
        sector: 'general',
        template_category: 'promotion',
        category: 'MARKETING',
        template_type: 'standard',
        header: { format: 'text', text: 'Exclusive Offer' },
        message_body: 'Exclusive Offer: Get {{1}} off on your next visit! Use code {{2}} at checkout.',
        body_variables: [
          { key: '1', example: '20%' },
          { key: '2', example: 'GIFT20' }
        ],
        footer_text: 'Terms apply.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_general_announcement',
        sector: 'general',
        template_category: 'announcement',
        category: 'MARKETING',
        template_type: 'standard',
        header: { format: 'text', text: 'Special Announcement' },
        message_body: 'Big News! We are launching {{1}} on {{2}}. Stay tuned for more updates!',
        body_variables: [
          { key: '1', example: 'our new app' },
          { key: '2', example: '1st April' }
        ],
        footer_text: 'Stay connected.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      },
      {
        template_name: 'admin_general_reminder',
        sector: 'general',
        template_category: 'reminder',
        category: 'UTILITY',
        template_type: 'standard',
        header: { format: 'text', text: 'Friendly Reminder' },
        message_body: 'Friendly reminder: Your subscription for {{1}} expires on {{2}}. Renew now to avoid interruption',
        body_variables: [
          { key: '1', example: 'Premium Plan' },
          { key: '2', example: '31st March' }
        ],
        footer_text: 'We value your membership.',
        status: 'approved',
        is_admin_template: true,
        created_by: adminId
      }
    ];

    for (const templateData of templates) {
      await Template.findOneAndUpdate(
        { template_name: templateData.template_name, language: 'en_US' },
        templateData,
        { upsert: true, returnDocument: 'after' }
      );
    }

    console.log('Admin templates seeded successfully!');
  } catch (error) {
    console.error('Error seeding admin templates:', error);
    throw error;
  }
}

export default seedAdminTemplates;
