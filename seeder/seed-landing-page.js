import { LandingPage } from '../models/index.js';

const seedLandingPage = async () => {
  try {
    const existingLandingPage = await LandingPage.findOne();

    if (existingLandingPage) {
      console.log('Landing page already exists, skipping seeding.');
      return;
    }

    const defaultLandingPage = new LandingPage({
      hero_section: {
        badge: "Powering Business Conversations on WhatsApp",
        title: "Trusted WhatsApp Marketing Platform for Growing Businesses",
        description: "Everything you need to market, sell, and support customers on WhatsApp in one place.",
        primary_button: { text: "Get Started", link: "/signup" },
        hero_image: "/uploads/landing/1000x550.svg",
        floating_images: [
          { url: "/uploads/landing/250x250.svg", position: "left-top" },
            { url: "/uploads/landing/250x250.svg", position: "right-top" },
            { url: "/uploads/landing/250x250.svg", position: "left-bottom" },
            { url: "/uploads/landing/250x250.svg", position: "right-bottom" }
          ]
      },
      features_section: {
        badge: "FEATURES",
        title: "Tools That Turn Chats into Customers",
        description: "From automation to analytics, explore tools designed to simplify communication and boost conversions on WhatsApp.",
        cta_button: { text: "Explore Features", link: "/signup" },
          features: [
            {
              title: "Template Library",
              description: "Browse and use pre-built message templates",
              icon: "ai.svg",
              image: "/uploads/landing/450x300.svg"
            },
            {
              title: "Chat Inbox",
              description: "Manage all customer chats in one place",
              icon: "bot.svg",
              image: "/uploads/landing/450x300.svg"
            },
            {
              title: "AI Template Generator",
              description: "Create WhatsApp templates instantly using AI",
              icon: "broadcast.svg",
              image: "/uploads/landing/450x300.svg"
            },
            {
              title: "Agent Task Management",
              description: "Assign, track, and manage team conversations",
              icon: "inbox.svg",
              image: "/uploads/landing/450x300.svg"
            },
            {
              title: "Contact Import",
              description: "Bulk upload and organize customer contacts",
              icon: "",
              image: "/uploads/landing/450x300.svg"
            },
            {
              title: "WABA Catalog Integration",
              description: "Showcase products directly inside WhatsApp chats",
              icon: "",
              image: "/uploads/landing/450x300.svg"
            },
            {
              title: "Sync Templates from Meta",
              description: "Auto-sync approved templates from Meta account",
              icon: "",
              image: "/uploads/landing/450x300.svg"
            },
            {
              title: "E-commerce Webhooks",
              description: "Automate messages from store events instantly",
              icon: "",
              image: "/uploads/landing/450x300.svg"
            },
            {
              title: "Performance Analytics",
              description: "Track messages, campaigns, and engagement live",
              icon: "",
              image: "/uploads/landing/450x300.svg"
            }
          ]
      },
      platform_section: {
        badge: "PLATFORM",
        title: "One Platform. Infinite Possibilities.",
                  items: [
            {
              step: 1,
              tagline: "NEVER MISS A LEAD",
              title: "No-Code Chatbot Builder",
              description: "Create automated WhatsApp conversations using visual flows. Respond instantly to customer queries, guide users, and capture leads without manual effort.",
              bullets: [
                "Drag-and-drop flow builder",
                "Keyword & button triggers",
                "Multi-step conversation logic",
                "Multi-step conversation logic"
              ],
              image: "/uploads/landing/950x550.svg"
            },
            {
              step: 2,
              tagline: "Onboarding",
              title: "One-Click WhatsApp Business Onboarding",
              description: "Connect your WhatsApp Business account directly from the platform using official embedded signup — no manual setup or technical steps required.",
              bullets: [
                "Official Meta onboarding flow",
                "Connect number in seconds",
                "Secure authentication process",
                "No Facebook developer setup needed"
              ],
              image: "/uploads/landing/950x550.svg"
            },
            {
              step: 3,
              tagline: "E-commerce Automation",
              title: "Send Automatic Order Updates",
              description: "Automatically notify customers when their order status changes. Keep buyers informed and reduce support queries with timely WhatsApp updates.",
              bullets: [
                "Order confirmation messages",
                "Shipping & dispatch notifications",
                "Delivery confirmation messages",
                "Cancelled/refund status alerts"
              ],
              image: "/uploads/landing/950x550.svg"
            },
            {
              step: 4,
              tagline: "Marketing",
              title: "Broadcast Campaigns That Convert",
              description: "Send promotional campaigns, announcements, and offers to thousands of customers with targeting, scheduling, and performance tracking.",
              bullets: [
                "Bulk WhatsApp broadcasts",
                "Schedule campaigns by date/time",
                "Tag-based audience targeting",
                "Campaign analytics & reports"
              ],
              image: "/uploads/landing/950x550.svg"
            },
            {
              step: 5,
              tagline: "Developers",
              title: "Powerful APIs for Custom Integrations",
              description: "Developers can integrate WhatsApp messaging into any platform using secure APIs.  trigger messages, and build custom solutions.",
              bullets: [
                "Send messages via API",
                "Template sending endpoints",
                "Contact & chat management APIs",
                "Easy integration with CRM, apps & websites"
              ],
              image: "/uploads/landing/950x550.svg"
            }
          ]
      },
      pricing_section: {
        title: "Plans Built for Every Business",
        badge: "plans",
        description: "Choose a plan that fits your business needs and start scaling your WhatsApp marketing with powerful automation and messaging tools.",
        subscribed_count: "45",
        subscribed_user: "avatar",
        plans: []
      },
      testimonials_section: {
        title: "Hear What Our Satisfied Customers Said About Us",
        badge: "testimonials",
        testimonials: []
      },
      faq_section: {
        title: "Frequently Asked Questions",
        faqs: [],
        badge: "faqs"
      },
      contact_section: {
        title: "Get in Touch With Us",
        subtitle: "We're Here To Assist You",
        form_enabled: true,
        phone_no: "+91 9879878789",
        email: "wapi@support.com"
      },
      footer_section: {
        cta_title: "Launch Smarter WhatsApp Campaigns Today",
        cta_description: "Launch campaigns, automate conversations, and engage customers smarter — all from one powerful WhatsApp platform.",
        cta_buttons: [{ text: "Start Free Trial", link: "/signup" }],
        social_links: [{
          twitter: "https://twitter.com/wapi",
          linkedin: "https://linkedin.com/company/wapi",
          facebook: "https://facebook.com/wapi",
          instagram: "https://instagram.com/wapi"
        }],
        copy_rights_text: "© 2026 WAPI. All rights reserved."
      }
    });

    await defaultLandingPage.save();
    console.log('Landing page seeded successfully!');
  } catch (error) {
    console.error('Error seeding landing page:', error);
  }
};

export default seedLandingPage;
