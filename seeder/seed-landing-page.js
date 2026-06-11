import { LandingPage } from '../models/index.js';

const LATEST_LANDING_DATA = {
  header_section: {
    logo_url: "",
    menu_items: [
      {
        title: "Home",
        link_type: "Link",
        path: "/landing",
        status: true
      },
      {
        title: "Channels",
        link_type: "Sub",
        status: true,
        children: [
          { title: "WhatsApp", link_type: "Link", path: "/channel/whatsapp", status: true, icon: "MessageCircle", description: "Official WhatsApp Business API messaging" },
          { title: "Instagram", link_type: "Link", path: "/channel/instagram", status: true, icon: "Instagram", description: "Manage Instagram DMs & comments" },
          { title: "Telegram", link_type: "Link", path: "/channel/telegram", status: true, icon: "Send", description: "Telegram bots & group messaging" },
          { title: "Facebook", link_type: "Link", path: "/channel/facebook", status: true, icon: "Facebook", description: "Facebook Messenger & page chat" }
        ]
      },
      {
        title: "Features",
        link_type: "Sub",
        mega_menu: true,
        mega_menu_type: "Link With Image",
        status: true,
        children: [
          { title: "Bulk Broadcast", link_type: "Link", path: "/product/broadcast_bulk_messages", description: "Send campaigns to thousands instantly", status: true, icon: "Send" },
          { title: "Shared Team Inbox", link_type: "Link", path: "/product/shared_team_inbox", description: "Collaborate on customer conversations", status: true, icon: "Inbox" },
          { title: "AI Chatbot Builder", link_type: "Link", path: "/product/automation_builder", description: "Visual no-code automation flows", status: true, icon: "GitBranch" },
          { title: "AI Voice Calling", link_type: "Link", path: "/product/ai_calling", description: "AI agents for inbound & outbound calls", status: true, icon: "Phone" },
          { title: "WhatsApp Catalog", link_type: "Link", path: "/product/catalog", description: "Showcase products inside WhatsApp", status: true, icon: "ShoppingBag" },
          { title: "Appointment Booking", link_type: "Link", path: "/product/appointment_booking", description: "Let customers self-book appointments", status: true, icon: "Calendar" },
          { title: "WhatsApp Forms", link_type: "Link", path: "/product/whatsapp_forms", description: "Collect responses via chat forms", status: true, icon: "FileText" },
          { title: "Click-to-WhatsApp Ads", link_type: "Link", path: "/product/ctwa", description: "Drive ad traffic to WhatsApp conversations", status: true, icon: "Sparkles" },
          { title: "Ecommerce Integration", link_type: "Link", path: "/product/ecommerce", description: "Sync Shopify, WooCommerce & more", status: true, icon: "ShoppingCart" },
          { title: "CRM & Contacts", link_type: "Link", path: "/product/contacts", description: "Segment, tag, and manage contacts", status: true, icon: "Users" }
        ]
      },
      {
        title: "Pricing",
        link_type: "Link",
        path: "/landing#pricing",
        status: true
      }
    ]
  },

  hero_section: {
    badge: "OMNICHANNEL MARKETING & BUSINESS API PLATFORM 🚀",
    title: "Scale Your Sales & Support on WhatsApp, Instagram & Facebook",
    description: "Automate business chats, deploy natural AI Voice Call Agents, run broadcast campaigns, and sync Shopify order updates instantly. Connect with customers where they are.",
    primary_button: { text: "Start Free Trial", link: "/signup" },
    hero_image: "/uploads/landing/1000x550.svg",
    floating_images: [
      { url: "/uploads/landing/250x250.svg", position: "left-top" },
      { url: "/uploads/landing/250x250.svg", position: "right-top" }
    ],
    trusted_label: "Trusted by 5,000+ Teams Worldwide",
    brand_logos: []
  },

  features_section: {
    badge: "ENTERPRISE FEATURES",
    title: "Everything Your Business Needs to Win on WhatsApp",
    description: "From AI automation to deep ecommerce integrations — Wapi gives your team the tools to convert, retain, and delight customers at scale.",
    cta_button: { text: "Explore All Features", link: "/signup" },
    features: [
      {
        title: "AI-Powered Chatbot Builder",
        description: "Build intelligent, multi-step WhatsApp bots without writing a single line of code. Use drag-and-drop flows to qualify leads, answer FAQs, book appointments, and guide users — 24/7, fully automated.",
        icon: "bot.svg",
        image: "/uploads/landing/450x300.svg"
      },
      {
        title: "Bulk Broadcast Campaigns",
        description: "Reach thousands of opted-in customers in seconds. Schedule personalized promotions, product launches, and re-engagement messages with deep analytics on delivery, opens, and replies.",
        icon: "broadcast.svg",
        image: "/uploads/landing/450x300.svg"
      },
      {
        title: "AI Voice Call Agents",
        description: "Deploy natural-sounding AI agents that handle inbound and outbound voice calls. Qualify leads, collect feedback, confirm orders, and support customers — without any human intervention.",
        icon: "ai.svg",
        image: "/uploads/landing/450x300.svg"
      },
      {
        title: "Shared Team Inbox",
        description: "Give your entire support and sales team a shared, real-time WhatsApp inbox. Assign conversations, add internal notes, set SLA alerts, and resolve chats faster as a team.",
        icon: "inbox.svg",
        image: "/uploads/landing/450x300.svg"
      },
      {
        title: "Ecommerce & Shopify Integration",
        description: "Connect your Shopify, WooCommerce, or custom store to automatically send order confirmations, shipping updates, abandoned cart nudges, and payment reminders via WhatsApp.",
        icon: "",
        image: "/uploads/landing/450x300.svg"
      },
      {
        title: "Click-to-WhatsApp Ad Campaigns",
        description: "Turn Facebook and Instagram ad clicks directly into WhatsApp conversations. Track ad attribution, qualify leads automatically, and convert faster with pre-filled message templates.",
        icon: "",
        image: "/uploads/landing/450x300.svg"
      }
    ]
  },

  platform_section: {
    badge: "HOW IT WORKS",
    title: "Go Live in Minutes, Not Months",
    items: [
      {
        step: 1,
        tagline: "CONNECT YOUR NUMBER",
        title: "One-Click WhatsApp Business Onboarding",
        description: "Connect your WhatsApp Business number directly through the platform using official Meta embedded signup. No developer account needed — just a few clicks and you're live.",
        bullets: [
          "Official Meta onboarding flow",
          "Connect number in under 2 minutes",
          "Secure OAuth authentication",
          "Supports multiple WABA numbers"
        ],
        image: "/uploads/landing/950x550.svg"
      },
      {
        step: 2,
        tagline: "BUILD YOUR BOT",
        title: "No-Code Chatbot & Automation Builder",
        description: "Design powerful WhatsApp automation flows with a visual drag-and-drop builder. Set up keyword triggers, button responses, lead capture forms, and multi-step conversation logic — no coding required.",
        bullets: [
          "Visual drag-and-drop flow editor",
          "Keyword, button & QR code triggers",
          "AI-powered smart reply suggestions",
          "Multi-step conversation routing"
        ],
        image: "/uploads/landing/950x550.svg"
      },
      {
        step: 3,
        tagline: "LAUNCH CAMPAIGNS",
        title: "Broadcast Campaigns That Actually Convert",
        description: "Send highly targeted WhatsApp campaigns to segmented audiences. Schedule messages, personalize with variables, and track real-time delivery, open, and reply rates from a single dashboard.",
        bullets: [
          "Bulk WhatsApp broadcasts in seconds",
          "Audience segmentation by tags & filters",
          "Schedule campaigns by date and time",
          "Live campaign analytics & export"
        ],
        image: "/uploads/landing/950x550.svg"
      },
      {
        step: 4,
        tagline: "AUTOMATE SALES",
        title: "Automate Your Entire Ecommerce Flow",
        description: "Sync your online store and let Wapi handle the entire post-purchase journey — from order confirmation to delivery tracking, abandoned cart recovery, and review collection.",
        bullets: [
          "Shopify & WooCommerce integration",
          "Automatic order status notifications",
          "Abandoned cart recovery messages",
          "Payment link delivery via WhatsApp"
        ],
        image: "/uploads/landing/950x550.svg"
      },
      {
        step: 5,
        tagline: "DEVELOPERS",
        title: "Powerful REST API for Custom Integrations",
        description: "Integrate WhatsApp messaging into your CRM, ERP, or custom application with a clean, well-documented REST API. Trigger messages, manage contacts, and build fully custom workflows.",
        bullets: [
          "Send messages & templates via API",
          "Webhook support for real-time events",
          "Contact & conversation management",
          "Easy integration with CRM, apps & websites"
        ],
        image: "/uploads/landing/950x550.svg"
      },
      {
        step: 6,
        tagline: "INSIGHTS",
        title: "Real-Time Analytics & Performance Reports",
        description: "Track every message, campaign, and conversation with a powerful analytics dashboard. Monitor delivery rates, agent performance, campaign ROI, and customer engagement in real time.",
        bullets: [
          "Live campaign delivery & open rates",
          "Agent performance leaderboards",
          "Contact growth & engagement trends",
          "Export reports as CSV or PDF"
        ],
        image: "/uploads/landing/950x550.svg"
      }
    ]
  },

  pricing_section: {
    badge: "PRICING",
    title: "Plans Built for Every Business",
    description: "Simple, transparent pricing with no hidden fees. Start free and scale as you grow.",
    subscribed_count: "5000",
    subscribed_user: "avatar",
    plans: []
  },

  testimonials_section: {
    badge: "TRUSTED PLATFORM",
    title: "Loved by Scaling Teams Worldwide",
    testimonials: []
  },

  faq_section: {
    badge: "FAQ",
    title: "Frequently Asked Questions",
    description: "Everything you need to know about Wapi and getting started.",
    faqs: []
  },

  contact_section: {
    title: "Get in Touch With Us",
    subtitle: "Our team is ready to help you get the most out of Wapi.",
    form_enabled: true,
    phone_no: "+91 9879878789",
    email: "support@wapi.com"
  },

  footer_section: {
    cta_title: "Start Growing Your Business on WhatsApp Today",
    cta_description: "Join thousands of businesses using Wapi to automate conversations, run campaigns, and close more deals — all on WhatsApp.",
    cta_buttons: [{ text: "Start Free Trial", link: "/signup" }],
    social_links: [{
      twitter: "https://twitter.com/wapi",
      linkedin: "https://linkedin.com/company/wapi",
      facebook: "https://facebook.com/wapi",
      instagram: "https://instagram.com/wapi"
    }],
    copy_rights_text: "© 2026 Wapi. All rights reserved."
  }
};

const seedLandingPage = async () => {
  try {
    const existingLandingPage = await LandingPage.findOne();

    if (existingLandingPage) {
      await LandingPage.updateOne(
        { _id: existingLandingPage._id },
        {
          $set: {
            header_section: LATEST_LANDING_DATA.header_section,
            hero_section: LATEST_LANDING_DATA.hero_section,
            features_section: LATEST_LANDING_DATA.features_section,
            platform_section: LATEST_LANDING_DATA.platform_section,
            pricing_section: {
              ...LATEST_LANDING_DATA.pricing_section,
              plans: existingLandingPage.pricing_section?.plans || []
            },
            testimonials_section: {
              ...LATEST_LANDING_DATA.testimonials_section,
              testimonials: existingLandingPage.testimonials_section?.testimonials || []
            },
            faq_section: {
              ...LATEST_LANDING_DATA.faq_section,
              faqs: existingLandingPage.faq_section?.faqs || []
            },
            contact_section: LATEST_LANDING_DATA.contact_section,
            footer_section: LATEST_LANDING_DATA.footer_section,
          }
        }
      );
      console.log('Landing page seeded successfully!');
      return;
    }

    const defaultLandingPage = new LandingPage(LATEST_LANDING_DATA);
    await defaultLandingPage.save();
    console.log('Landing page seeded successfully!');
  } catch (error) {
    console.error('Error seeding landing page:', error);
  }
};

export default seedLandingPage;
