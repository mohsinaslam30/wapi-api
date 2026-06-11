import { Page } from '../models/index.js';

async function seedPages() {
  try {
    const pages = [
      {
        title: 'Privacy Policy',
        slug: 'privacy-policy',
        content: '<h1>Privacy Policy</h1><p>This is the default Privacy Policy content. Please update it in the admin panel.</p>',
        meta_title: 'Privacy Policy',
        meta_description: 'Privacy Policy for Wapi',
        status: true,
        sort_order: 1
      },
      {
        title: 'Terms and Conditions',
        slug: 'terms-and-conditions',
        content: '<h1>Terms and Conditions</h1><p>This is the default Terms and Conditions content. Please update it in the admin panel.</p>',
        meta_title: 'Terms and Conditions',
        meta_description: 'Terms and Conditions for Wapi',
        status: true,
        sort_order: 2
      },
      {
        title: 'Refund Policy',
        slug: 'refund-policy',
        content: '<h1>Refund Policy</h1><p>This is the default Refund Policy content. Please update it in the admin panel.</p>',
        meta_title: 'Refund Policy',
        meta_description: 'Refund Policy for Wapi',
        status: true,
        sort_order: 3
      },
      {
        title: 'WhatsApp Automation',
        slug: 'whatsapp',
        content: '',
        system_reserved: true,
        meta_title: 'Official WhatsApp Connection & Automation',
        meta_description: 'Scale your sales and support on WhatsApp using team shared inboxes, visual flows, bulk marketing campaigns, AI support, and CRM integrations.',
        status: true,
        sort_order: 4,
        dynamic_content: {
          hero_section: {
            badge: "Official WhatsApp Connection",
            title: "Scale Your Sales and Support on WhatsApp",
            subtitle: "Manage customer chats together with a shared inbox, build automated reply bots, send bulk messages to customers, and link with the tools you already use.",
            button_text: "Try For Free",
            button_url: "/auth/signup",
            button_2_text: "View Plans",
            button2_url: "/billing/plans",
            bullets: ["Instant QR setup", "Official Connection", "No setup fees"],
            side_gif: '/uploads/placeholder.jpg'
          },
          counters: [
            { count: "+45%", title: "Broadcast Click Rate" },
            { count: "3x", title: "Sales Conversion" },
            { count: "99%", title: "Message Read Rate" },
            { count: "24/7", title: "Auto-Response" }
          ],
          comparison: {
            badge: "Comparison Grid",
            title: "Standard WhatsApp vs WhatsApp Business API",
            subtitle: "Discover why scaling on WhatsApp requires switching from the generic app to an official API-powered workflow built for teams.",
            platform_feature_array: [
              { platform_feature: "Multi-Agent Support", whatsapp_feature: "Max 4 devices (Single device focus)", official_api: "Unlimited agents, dynamic routing" },
              { platform_feature: "Broadcast Limits", whatsapp_feature: "Max 256 contacts per list (Risk of Ban)", official_api: "Unlimited broadcasts, safe delivery" },
              { platform_feature: "Auto-Reply Bots", whatsapp_feature: "Extremely basic auto-responder", official_api: "Visual flow builder + AI Support" },
              { platform_feature: "Green Tick Verification", whatsapp_feature: "Not available for standard accounts", official_api: "Official verified green tick badge" },
              { platform_feature: "CRM & API Integrations", whatsapp_feature: "No Webhook or API connections", official_api: "Robust REST APIs + Webhooks ready" }
            ]
          },
          features: {
            badge: "Interactive Showcase",
            title: "Powerful Tools to Turn WhatsApp into a Sales Machine",
            sub_title: "Explore the exact capabilities engineered within our platform to help you automate customer operations completely.",
            features: [
              { title: "Shared Team Inbox", description: "Let your entire sales and customer service team chat with customers using a single WhatsApp number. Direct customer messages to the right team member automatically.", image: '/uploads/placeholder.jpg', bullets: ["Send chats to the right person", "Write notes only your team can see"] },
              { title: "Visual Reply Builder", description: "Create simple automatic replies for customer questions. Set up answers that trigger when customers type specific words or tap buttons.", image: '/uploads/placeholder.jpg', bullets: ["Taps and words trigger replies", "Add interactive options menu"] },
              { title: "Bulk Messaging", description: "Send announcements or notifications to thousands of customers at once. Add their names or personal details to make messages friendly.", image: '/uploads/placeholder.jpg', bullets: ["Add customer names automatically", "See who opened and clicked links"] },
              { title: "Smart AI Calling", description: "Let smart voice assistants make and answer phone calls for your business. Help customers get information without waiting on hold.", image: '/uploads/placeholder.jpg', bullets: ["Clear and friendly AI voices", "See summary logs of every call"] },
              { title: "Easy Scheduling", description: "Let customers book appointments and schedule meetings directly inside the WhatsApp chat window. No outside links needed.", image: '/uploads/placeholder.jpg', bullets: ["Choose calendar dates in chat", "Send automated appointment reminders"] },
              { title: "Send Simple Forms", description: "Create and send simple forms inside the chat so customers can fill out their details, sign up, or share info without leaving WhatsApp.", image: '/uploads/placeholder.jpg', bullets: ["Fill out forms inside the chat", "Save customer answers instantly"] },
              { title: "AI Chat Assistant", description: "Train an AI helper using your own business files or website links. It can answer customer questions about pricing and product availability 24/7.", image: '/uploads/placeholder.jpg', bullets: ["AI answers customer questions", "Hand over to a real person if needed"] },
              { title: "Link Your Existing Tools", description: "Connect WhatsApp with the tools you already use like Shopify or your customer database. Send messages automatically when orders are placed or shipped.", image: '/uploads/placeholder.jpg', bullets: ["Connect with tools like Shopify", "Send messages automatically when things update"] },
              { title: "Showcase Your Products", description: "Display your product inventory, catalog items, and pictures directly in the chat. Let customers select items and check out right inside WhatsApp.", image: '/uploads/placeholder.jpg', bullets: ["Show product lists and pictures", "Quick and easy checkout in chat"] }
            ]
          },
          steps: {
            badge: "How It Works",
            title: "Start in 4 Easy Steps",
            subtitle: "Setting up your official WhatsApp assistant takes less than 10 minutes.",
            steps: [
              { title: "Link Your Phone", description: "Connect your business phone number by scanning a simple QR code in 30 seconds." },
              { title: "Upload Contact List", description: "Upload your customer phone list or link directly with your existing Shopify or CRM tool." },
              { title: "Design Chat Flows", description: "Type out your answers or design automated reply menus using our visual builder." },
              { title: "Start Answering", description: "Turn on your assistant, send bulk messages, and watch conversations happen automatically." }
            ]
          },
          sales_section: {
            title: "Turn Your WhatsApp Into A Sales Engine Today",
            subtitle: "Start sending announcements, managing team chats, and answering customer questions automatically right now.",
            button1_title: "Try For Free",
            button1_url: "/auth/signup",
            button2_title: "Talk to Sales",
            button2_description: "",
            bullets: ["5-Minute Setup", "Official Connection", "Cancel Anytime"]
          }
        }
      },
      {
        title: 'Instagram DM Automation',
        slug: 'instagram',
        content: '',
        system_reserved: true,
        meta_title: 'Instagram DM Automation & Comment Triggers',
        meta_description: 'Convert Instagram comments and story mentions into automated DM chats, product catalog shares, discount codes, and active sales pipelines.',
        status: true,
        sort_order: 5,
        dynamic_content: {
          hero_section: {
            badge: "Official Instagram Connection",
            title: "Turn Instagram Comments into Direct DM Sales",
            subtitle: "Send automated discount codes, product catalogs, or instant replies to customer messages the second they comment on your posts or reels.",
            button_text: "Connect Your Account",
            button_url: "/auth/signup",
            button_2_text: "Test Demo First",
            button2_url: "#playground",
            bullets: ["Safe Official Connection", "Auto-like comments", "Sets up in 5 minutes"],
            side_gif: '/uploads/placeholder.jpg'
          },
          comment_section: {
            badge: "Interactive Trigger Demo",
            title: "Test Our Comment-to-DM Flow Live",
            subtitle: "Type your custom trigger word below, press simulate, and watch the mock Instagram direct message interface respond instantly on the phone screen!",
            card_title: "Configure Your Comment Trigger Keyword",
            keywords: ["VOUCHER", "CATALOG", "PRICE", "INFO"],
            bullets: ["Post Comment Detected", "Automated Response: @jatin_kumar Sent! Check your DM...", "Private Direct Message Delivered successfully!"],
            gif: '/uploads/placeholder.jpg'
          },
          features: {
            badge: "Features",
            title: "Grow Your Brand on Instagram Automatically",
            features: [
              { badge: "Grow Followers", title: "Ask Followers to Follow You", description: "Automatically prompt new commenters and DM senders to follow your account. Turn every interaction into a follower with a smart, polite follow request sent instantly.", image: '/uploads/placeholder.jpg' },
              { badge: "Boost Engagement", title: "Auto Like Comments", description: "Show every commenter that you appreciate them. Our system automatically likes comments on your posts and Reels the moment they are posted, keeping your audience engaged.", image: '/uploads/placeholder.jpg' },
              { badge: "Safe & Clean", title: "Hide Hate Comments Automatically", description: "Protect your brand reputation. Automatically detect and hide offensive, hateful, or spam comments before your audience sees them, keeping your community positive.", image: '/uploads/placeholder.jpg' },
              { badge: "AI Support", title: "24/7 Smart AI Chatbot", description: "Train an AI helper on your website links or business details. It will answer customer questions about pricing and product availability around the clock.", image: '/uploads/placeholder.jpg' }
            ]
          },
          steps: {
            badge: "How It Works",
            title: "Start in 4 Easy Steps",
            subtitle: "Setting up your official Instagram assistant takes less than 10 minutes.",
            steps: [
              { title: "Connect Account", description: "Link your business Instagram account in 1-click." },
              { title: "Set Keywords", description: "Define what words trigger comments replies and DM sends." },
              { title: "Write DM Templates", description: "Draft the automated message customers will get in their DMs." },
              { title: "Activate Flow", description: "Go live and watch comment-to-DM triggers scale automatically." }
            ]
          },
          sales_section: {
            title: "Scale Your Instagram DM Automation Today",
            subtitle: "Turn comments into customers, automate customer service, and boost sales 24/7.",
            button1_title: "Try For Free",
            button1_url: "/auth/signup",
            button2_title: "Talk to Sales",
            button2_description: "",
            bullets: ["5-Minute Setup", "Official Connection", "Cancel Anytime"]
          }
        }
      },
      {
        title: 'Telegram Channel',
        slug: 'telegram',
        content: '',
        system_reserved: true,
        meta_title: 'Telegram Customer Chat & Bot Automation',
        meta_description: 'Link your Telegram support chat, set up automatic keyword reply rules, schedule messages, and view all histories in one simple dashboard.',
        status: true,
        sort_order: 6,
        dynamic_content: {
          hero_section: {
            badge: "Official Telegram Connection",
            title: "Automate Your Telegram Customer Chats",
            subtitle: "Connect your business chat, create quick message templates with buttons, set up automatic replies for customer questions, and track all incoming messages easily.",
            button_text: "Link Your Chat Bot",
            button_url: "/auth/signup",
            button_2_text: "See What It Can Do",
            button2_url: "#features-matrix",
            bullets: ["Message History Logs", "Easy Reply Buttons", "Auto-Replies for Words"],
            side_image: '/uploads/placeholder.jpg'
          },
          features: {
            badge: "Built-In Features",
            title: "Powerful Features Made Simple",
            subtitle: "Here is everything you can set up to manage your customer conversations in real-time.",
            features: [
              { badge: "Quick Connection", title: "Easy Account Setup", description: "Connect your Telegram business account instantly with just a single copy-paste step.", image: '/uploads/placeholder.jpg' },
              { badge: "Interactive Buttons", title: "Messages with Quick Buttons", description: "Write answers that include clickable buttons so your customers can reply or visit links in one tap.", image: '/uploads/placeholder.jpg' },
              { badge: "Automatic Replies", title: "Word Detection Rules", description: "Tell your account to automatically send specific answers whenever a customer types words like 'price' or 'help'.", image: '/uploads/placeholder.jpg' },
              { badge: "Message History", title: "Real-Time Message Logs", description: "Keep track of all sent, delivered, and read messages in a simple list view.", image: '/uploads/placeholder.jpg' }
            ]
          },
          steps: {
            badge: "How It Works",
            title: "Start in 4 Easy Steps",
            subtitle: "No complicated codes or technical steps. Just connect and go.",
            steps: [
              { title: "Link Your Chat", description: "Enter your Telegram account link details to connect your chat securely in one second." },
              { title: "Choose Reply Words", description: "Pick key words that customers often ask (like 'price', 'delivery') so your chat knows what to answer." },
              { title: "Create Answers", description: "Type out your answer messages and add helpful quick buttons for customers to click." },
              { title: "Start Answering", description: "Your chat assistant is ready! It will automatically reply to customer questions 24 hours a day." }
            ]
          },
          sales_section: {
            title: "Automate Your Telegram Chat Today",
            subtitle: "Connect your account in seconds, write easy reply buttons, set up key word detection, and view all chats in real-time.",
            button1_title: "Try For Free",
            button1_url: "/auth/signup",
            button2_title: "Talk to Sales",
            button2_description: "",
            bullets: ["Easy Sign In", "Official Connection", "Cancel Anytime"]
          }
        }
      },
      {
        title: 'Facebook Page Automation',
        slug: 'facebook',
        content: '',
        system_reserved: true,
        meta_title: 'Facebook Business Page & Lead Ads Syncing',
        meta_description: 'Connect your Facebook business pages, automatically sync contact details from lead ads, track campaigns, and deploy automated responses.',
        status: true,
        sort_order: 7,
        dynamic_content: {
          hero_section: {
            badge: "Official Facebook Connection",
            title: "Automate Your Facebook Pages & Lead Ads",
            subtitle: "Connect your Facebook business pages, automatically save customer form details from your ads, chat in a single inbox, and send easy automated messages.",
            button_text: "Connect Your Facebook Account",
            button_url: "/auth/signup",
            button_2_text: "See What It Can Do",
            button2_url: "#features-showcase",
            bullets: ["Easy Form Syncing", "Simple Ad Reports", "Automatic Message Replies"],
            side_image: '/uploads/placeholder.jpg'
          },
          features: {
            badge: "Core Features",
            title: "Grow Your Facebook Page Automatically",
            subtitle: "Here is everything you can set up to manage your customer conversations and ads in one place.",
            features: [
              { badge: "Pages Connection", title: "Link Your Facebook Pages", description: "Connect and manage all your Facebook business pages in one clean dashboard. Choose which page sends automated messages to customers.", image: '/uploads/placeholder.jpg' },
              { badge: "Lead Ads Integration", title: "Save Customer Form Details", description: "Instantly save details when customers fill out forms on your Facebook ads. Save their info directly to your contact list and reply to them automatically.", image: '/uploads/placeholder.jpg' },
              { badge: "Ads Manager Hub", title: "Track Your Ad Campaigns", description: "See all your active Facebook ads in one simple view. Pause, start, or check the status of your ads without leaving your dashboard.", image: '/uploads/placeholder.jpg' },
              { badge: "Analytics Engine", title: "View Simple Ad Reports", description: "Understand how your ads are doing. See simple counts of clicks, views, cost-per-lead, and how many people you have reached.", image: '/uploads/placeholder.jpg' }
            ]
          },
          tools: {
            badge: "Complete Tools",
            title: "Built-In Page & Message Tools",
            sub_title: "Every tool you need to track delivery, send replies, and manage customer chats.",
            tools: [
              { icon: "Inbox", title: "Unified Inbox", description: "Manage all customer chat messages in one single inbox" },
              { icon: "Workflow", title: "Simple Reply Flows", description: "Build automated answers for customers using a visual layout builder" },
              { icon: "FileText", title: "Message Templates", description: "Create easy pre-written answers with clickable customer buttons" },
              { icon: "Megaphone", title: "Bulk Messaging", description: "Send one message to multiple customer groups at the same time" },
              { icon: "Tag", title: "Word Auto-Replies", description: "Instantly reply when customers type words like 'price' or 'help'" },
              { icon: "ActivitySquare", title: "Delivery Reports", description: "Check whether messages have been successfully sent, delivered, or read" }
            ]
          },
          steps: {
            badge: "How It Works",
            title: "Start in 4 Easy Steps",
            subtitle: "No complicated codes or technical steps. Just connect and go.",
            steps: [
              { title: "Log In Securely", description: "Log in with your Facebook account via our secure official connection." },
              { title: "Select Pages & Ads", description: "Pick the Facebook pages and active ads you want to connect." },
              { title: "Link Your Forms", description: "Choose how to save info when customers fill out your ad forms." },
              { title: "Automate & Reply", description: "Watch new customer leads get saved and answered automatically." }
            ]
          },
          sales_section: {
            title: "Automate Your Facebook Ads & Leads Today",
            subtitle: "Link your pages, track active ad campaigns, save lead form answers, and reply to customers automatically.",
            button1_title: "Try For Free",
            button1_url: "/auth/signup",
            button2_title: "Talk to Sales",
            button2_description: "",
            bullets: ["Easy Sign In", "Official Connection", "Cancel Anytime"]
          }
        }
      },
      {
        title: 'AI Voice Calling',
        slug: 'ai_calling',
        content: '',
        system_reserved: true,
        meta_title: 'Automate Voice Calls with AI Call Agents',
        meta_description: 'Configure custom voice bots to answer customer calls, run automated AI support prompts, and connect with external API systems.',
        status: true,
        sort_order: 8,
        dynamic_content: {
          hero: {
            badge: "WhatsApp Call Agent",
            title: "Automate Voice Calls with AI Call Agents",
            subtitle: "Configure custom voice bots to answer customer calls, run automated AI support prompts, and connect with external API systems.",
            button_text: "Get Started Free",
            button_url: "/auth/signup",
            bullet_points: [
              "Welcome greetings",
              "Prompt instruction training",
              "Speech function actions"
            ],
            side_image: '/uploads/placeholder.jpg'
          },
          capabilities: {
            badge: "PLATFORM FEATURES",
            title: "Voice Agent Capabilities",
            subtitle: "Core WhatsApp voice calling features supported in your configuration panel.",
            features: [
              {
                title: "AI Knowledge Training",
                description: "Train your voice agent with system instructions and custom prompts to answer client inquiries contextually.",
                example: "Example: Restaurant agent answering menu availability and reservations."
              },
              {
                title: "Voice & Speech Engines",
                description: "Integrate ElevenLabs and OpenAI voices to convert client speech to text and read back natural vocal replies.",
                example: "Example: Converting incoming calls to text and speaking responses back."
              },
              {
                title: "API Function Triggers",
                description: "Trigger REST APIs when keywords are spoken, collecting required parameter inputs automatically.",
                example: "Example: Triggering order status check when customer says 'status'."
              },
              {
                title: "Welcome & Hangup Config",
                description: "Configure greetings when calls answer, and set keyword triggers to play farewells and disconnect calls.",
                example: "Example: Auto disconnect when client says 'goodbye' or 'exit'."
              },
              {
                title: "Recordings & Transcripts",
                description: "Store conversation transcripts and audio recording buffers dynamically for both user and agent.",
                example: "Example: Exporting support conversation records for staff review."
              }
            ]
          },
          faqs: {
            badge: "FAQs",
            title: "Frequently Asked Questions",
            items: [
              {
                question: "Which AI Models are supported?",
                answer: "The call agent uses Gemini models configured via your API key inside the backend settings."
              },
              {
                question: "How do speech-triggered functions work?",
                answer: "You can map triggers to active keyword sets. When client speech matches a keyword, the bot calls the defined API endpoint, passes parameters, and speaks the response context."
              },
              {
                question: "Are call recordings stored?",
                answer: "Yes. All conversations are recorded, and full speech-to-text transcripts are saved inside the call history logs dashboard."
              }
            ]
          }
        }
      },
      {
        title: "Appointment Booking",
        slug: "appointment_booking",
        system_reserved: true,
        content: "Automate Appointments and Timelines on WhatsApp Flows",
        meta_title: "Appointment Booking — Automate WhatsApp Scheduling",
        meta_description: "Let clients pick dates, select practitioners, and book appointments inside WhatsApp without loading websites.",
        status: true,
        sort_order: 7,
        dynamic_content: {
          hero: {
            badge: "Automated Booking",
            title: "Automate Appointments and Timelines on WhatsApp Flows",
            subtitle: "Let clients pick dates, select practitioners, and book appointments inside WhatsApp without loading websites. Automatically sync calendars, dispatch notifications, and trigger no-show reminders.",
            button_text: "Start Booking Free",
            button_url: "/signup",
            bullet_points: [
              "Google & Outlook Sync",
              "Interactive booking maps",
              "80% lower no-show rates"
            ],
            side_image: '/uploads/placeholder.jpg'
          },
          booking_journey: {
            badge: "SCHEDULING ENGINE",
            title: "The In-Chat Booking Journey",
            description: "Provide a complete self-service scheduling journey directly within WhatsApp conversations.",
            steps: [
              {
                title: "Browse & Select",
                description: "Clients browse availability dates and pick specialist slots natively inside WhatsApp — no website redirects needed.",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Deposit & Lock",
                description: "Reduce no-shows by collecting secure booking deposit fees directly inside the chat with one-tap payment.",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Calendar Sync",
                description: "Reserved slots write immediately to Google/Outlook calendar to block conflicts in real time.",
                image: '/uploads/placeholder.jpg'
              }
            ]
          },
          usecases: {
            badge: "USE CASES",
            title: "Real-Time Scheduling Automation Examples",
            examples: [
              {
                title: "Medical Clinics",
                description: "Patients select doctors, choose open times, and answer simple pre-consultation health questions (e.g. allergies) straight from WhatsApp chat bubbles."
              },
              {
                title: "Spas & Salons",
                description: "Beauty salons and spas let customers choose specific therapist operators, book massage slots, and secure bookings via reservation links."
              },
              {
                title: "Sales Demos",
                description: "B2B consultancies sync corporate Google calendars. When prospects interact with the WhatsApp Flow, they book Zoom video meet calls."
              },
              {
                title: "Coaching & Consulting",
                description: "Lawyers, coaches, and advisory consultants collect diagnostic details, reserve slots, and handle initial deposit fees securely in-chat."
              }
            ]
          },
          architecture: {
            title: "Robust Appointment Scheduling Architecture",
            description: "Engine Features",
            steps: [
              {
                title: "Native WhatsApp Flows",
                description: "Build multi-step scheduling forms that display calendar lists natively inside WhatsApp without loading web browser links."
              },
              {
                title: "Calendar Integrations",
                description: "Establish bi-directional updates with Google Calendar, Outlook, and major CRM sheets to block booked slot items instantly."
              },
              {
                title: "No-Show Reminders",
                description: "Dispatch automated follow-up warnings (24 hours or 2 hours prior) via WhatsApp, helping businesses cut down missed bookings."
              },
              {
                title: "Timezone Sync Adaptation",
                description: "Automatically shifts slot timings based on the client's local phone coordinates, preventing scheduling errors across countries."
              }
            ]
          },
          faqs: {
            badge: "FAQs",
            title: "Questions about Scheduling?",
            items: [
              {
                question: "How does the calendar sync prevent overlap?",
                answer: "WAPI operates with real-time API integrations. Whenever a customer opens the WhatsApp Flow scheduler form, WAPI queries your Google/Outlook calendar to block out slots that contain existing events."
              },
              {
                question: "Can customers reschedule or cancel their slots?",
                answer: "Absolutely. The confirmation cards dispatched to WhatsApp contain reschedule and cancel CTA buttons. Clicking them releases the blocked calendar slot and allows picking a new timing."
              },
              {
                question: "Does it support multiple timezones?",
                answer: "Yes. Timezones are managed dynamically. When a client triggers the scheduling form, the system automatically detects their phone's local timezone settings and displays calendar slot schedules adjusted accordingly."
              }
            ]
          }
        }
      },
      {
        title: "Product Catalog",
        slug: "catalog",
        system_reserved: true,
        content: "Turn WhatsApp into a Direct Storefront for Checkout",
        meta_title: "WhatsApp Product Catalog & In-Chat Commerce",
        meta_description: "Showcase digital menus, sync stock categories, and allow shoppers to browse, build carts, and request automated secure billing links directly inside WhatsApp DMs.",
        status: true,
        sort_order: 9,
        dynamic_content: {
          hero: {
            badge: "WhatsApp Commerce",
            title: "Turn WhatsApp into a Direct Storefront for Checkout",
            subtitle: "Showcase digital menus, synced stock categories, and details directly to clients inside DMs. Allow shoppers to browse, compile carts, and request automated secure billing links in 1-click.",
            button_text: "Start Selling Now",
            button_url: "/auth/signup",
            button_2_text: "Try Catalog Demo",
            button2_url: "#catalog-demo",
            bullets: ["Auto-sync inventories", "Native Checkout Flow", "Stripe & Razorpay ready"]
          },
          live_demo: {
            badge: "LIVE DEMO",
            title: "Interact with the Catalog & Checkout Sandbox",
            description: "Add your own products on the left, then select items, add to cart, and checkout on the simulated WhatsApp screen to see the automation trigger.",
            card_title: "Store Inventory Manager",
            card_description: "Modify values dynamically to preview changes inside the phone simulator.",
            products: [
              { name: "Organic Coffee Blend", category: "Beverages", stock: 45, price: 14.99, image: "☕" },
              { name: "Matcha Ceremony Set", category: "Tea Sets", stock: 18, price: 24.50, image: "🍵" },
              { name: "Gluten-Free Croissant", category: "Bakery", stock: 12, price: 4.99, image: "🥐" }
            ]
          },
          use_cases: {
            badge: "USE CASES",
            title: "Real-Time Catalog Integration Examples",
            description: "See how top industries utilize synced digital catalogs on WhatsApp to convert conversations into sales instantly.",
            tabs: [
              {
                heading: "01. E-Commerce Checkout",
                title: "Instantly Sync Inventory & Checkout with Shopify",
                description: "Retailers link their shop databases to automatically reflect pricing adjustments, inventory levels, and details on WhatsApp catalog profiles.",
                bullets: [
                  "Customers browse collections inside their chat bubble.",
                  "Items added to cart compile into a native order summary format.",
                  "Checkout web link triggers on order placement for payment gateway integration."
                ],
                image: '/uploads/placeholder.jpg'
              },
              {
                heading: "02. Restaurant Digital Ordering",
                title: "Interactive Menu Ordering for Food Delivery",
                description: "Restaurants and bakeries list categorized menus (Appetizers, Mains, Drinks) with descriptions. Customers select sizes, spice levels, or customizations before adding dishes.",
                bullets: [
                  "Scan table QR codes to immediately pull up the WhatsApp menu.",
                  "Bot asks: 'Add spice customization?' list selection prompt.",
                  "Dispatches kitchen ticket directly to thermal printers on checkout."
                ],
                image: '/uploads/placeholder.jpg'
              },
              {
                heading: "03. Professional Service Bookings",
                title: "Digital Service Catalogues for Consultants",
                description: "Agencies, therapists, or business coaches showcase packages (1 Hour Consultation, Monthly Design Retainer, SEO Audit) directly on the dashboard.",
                bullets: [
                  "Allows prospects to pick service packages without external scheduling links.",
                  "Integrates with CRM custom fields to trigger specific support routines.",
                  "Auto-routes tickets to dedicated account specialists upon checkout."
                ],
                image: '/uploads/placeholder.jpg'
              }
            ]
          },
          capabilities: {
            badge: "Catalog Capabilities",
            title: "Everything You Need to Power Mobile Commerce",
            features: [
              {
                title: "Meta Catalog Sync",
                description: "Instantly sync existing products from Meta Business Manager or upload spreadsheet directories directly."
              },
              {
                title: "Dynamic Carts",
                description: "Allow clients to pick multiple items, increment quantities, and submit complete orders without leaving the chat viewport."
              },
              {
                title: "Auto-Invoicing",
                description: "Connect Stripe, Razorpay, or PayPal to automatically dispatch secure checkout links once items are compiled in the cart."
              },
              {
                title: "Inventory Alerts",
                description: "Trigger automated out-of-stock messages or auto-hide catalog products whose database counts drop to zero."
              }
            ]
          },
          faqs: {
            badge: "FAQs",
            title: "Questions about Catalog Integrations?",
            items: [
              {
                question: "Is a Meta Business Manager catalog required?",
                answer: "Yes, to use official WhatsApp product collections, you sync your products to Meta Catalog Manager. The WAPI app simplifies this by giving you a direct API linkage to upload items from your local spreadsheet inventory in seconds."
              },
              {
                question: "How do customers pay once they submit their orders?",
                answer: "Once the order checkout is compiled in chat, the bot triggers an automated Stripe, Razorpay, or PayPal payment transaction link. Once the customer completes the payment, the bot instantly dispatches a confirmation message and updates the order status."
              },
              {
                question: "Can I trigger chatbot automations when a customer buys?",
                answer: "Absolutely. When a customer adds items or checkout, it fires webhook signals that can trigger specific automation builders (like assigning tags, enrolling the contact in automated email flows, or routing them to human inbox specialists)."
              }
            ]
          }
        }
      },
      {
        title: "Broadcast & Bulk Messages",
        slug: "broadcast_bulk_messages",
        system_reserved: true,
        content: "Broadcast Official WhatsApp Messages to Thousands",
        meta_title: "Broadcast & Bulk Messages — WhatsApp Campaign Manager",
        meta_description: "Reach thousands of customers with Meta-approved WhatsApp broadcast templates. Schedule campaigns, personalize variables, and track real-time CTR.",
        status: true,
        sort_order: 8,
        dynamic_content: {
          hero: {
            badge: "BROADCAST CAMPAIGNS",
            title: "Broadcast Official WhatsApp Messages to Thousands",
            subtitle: "Reach your customers with 98% open rates using Meta-approved WhatsApp templates. Schedule campaigns, insert dynamic personalization tags, and measure real-time CTR.",
            button_text: "Start Broadcasting Free",
            button_url: "/signup",
            bullet_points: [
              "Official Meta Business API",
              "Schedule date & times",
              "Personalization variables"
            ],
            side_image: '/uploads/placeholder.jpg'
          },
          campaign_settings: {
            badge: "Campaign Settings",
            title: "High-Converting WhatsApp Marketing Campaign Features",
            subtitle: "Connect templates and segmented subscriber lists to dispatch bulk broadcasts safely with no risk of ban.",
            features: [
              {
                title: "Meta Approved Templates",
                description: "Build media-rich text or document templates. Submits variables instantly to Meta API for validation approval tags."
              },
              {
                title: "Smart Segment Targeting",
                description: "Filter bulk recipients accurately by CRM contact tags, custom language properties, or subscription directories."
              },
              {
                title: "Scheduled Delivery",
                description: "Launch broadcasts immediately or plan future timing schedules to trigger alerts during optimal opening hours."
              },
              {
                title: "Dynamic Link Tracking",
                description: "Inserts link tracking identifiers in CTA button templates to automatically trace CTR and client conversions."
              }
            ]
          },
          template_types: {
            badge: "Template Builder",
            title: "Marketing Template Types",
            description: "Choose the type of marketing experience to deliver. Personalize with variables, coupons, or interactive carousels.",
            types: [
              {
                title: "Standard",
                description: "Regular marketing message with text body and optional CTA button.",
                icon: "Tag",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Limited Time Offer",
                description: "With expiration countdown timer to drive urgency-based conversions.",
                icon: "Gift",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Coupon Code",
                description: "Include a copy-able promo code block for discounts and reward redemption.",
                icon: "Ticket",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Catalog",
                description: "Link your product catalog so recipients can browse directly on WhatsApp.",
                icon: "BookOpen",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Call Permission",
                description: "Request phone call opt-in with accept and decline quick-reply buttons.",
                icon: "Phone",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Carousel Product",
                description: "Horizontal scrollable product cards with prices and View Product CTAs.",
                icon: "ShoppingBag",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Carousel Media",
                description: "Horizontal image/video cards with action buttons for rich media campaigns.",
                icon: "Image",
                image: '/uploads/placeholder.jpg'
              }
            ]
          },
          faqs: {
            badge: "FAQs",
            title: "Got Questions about Broadcast Campaigns?",
            items: [
              {
                question: "What is the difference between Utility and Marketing templates?",
                answer: "Marketing templates contain promotional offers, discounts, or brand invites. Utility templates deliver transactional alerts like billing reminders, shipping details, or account codes."
              },
              {
                question: "Are WhatsApp Broadcasts safe from account bans?",
                answer: "Yes, because our application runs broadcasts using the official WhatsApp Business Cloud API. By adhering to Meta's opt-in criteria and pre-approving templates, your account runs zero risk of phone number blocking."
              },
              {
                question: "Can I personalize parameters for each individual recipient?",
                answer: "Absolutely. Using standard dynamic tags you can inject custom variables (names, coupon codes, outstanding balances) for each member of your recipient broadcast list."
              }
            ]
          }
        }
      },
      {
        title: "WhatsApp Forms",
        slug: "whatsapp_forms",
        system_reserved: true,
        content: "Interactive forms that live inside WhatsApp chats",
        meta_title: "WhatsApp Interactive Forms & Meta Flows Builder",
        meta_description: "Capture leads, feedback, and bookings with drag-and-drop forms that render natively in WhatsApp. No external links, no redirects.",
        status: true,
        sort_order: 10,
        dynamic_content: {
          hero: {
            badge: "WhatsApp Forms",
            title: "Interactive forms that live inside WhatsApp chats",
            subtitle: "Capture leads, feedback, and bookings with drag-and-drop forms that render natively in WhatsApp. No external links, no website redirects — just seamless inline data collection.",
            button_text: "Start Building Free",
            button_url: "/auth/signup",
            button_2_text: "See How It Works",
            button2_url: "#forms-workflow",
            bullets: ["No-code builder", "Meta Flows powered", "Keyword auto-trigger"],
            image: '/uploads/placeholder.jpg'
          },
          workflow: {
            badge: "Workflow",
            title: "From design to delivery in three steps",
            description: "A streamlined pipeline to create and deploy forms inside WhatsApp.",
            steps: [
              {
                title: "Design with drag & drop",
                description: "Use the visual builder to add text inputs, email, phone, dropdowns, checkboxes, and date pickers. Configure field labels, placeholders, and toggle required validation on any field.",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Publish to Meta Flows",
                description: "Once designed, publish your form to Meta's native interactive form system. Define submission settings — custom success messages and button text — to guide users after they submit.",
                image: '/uploads/placeholder.jpg'
              },
              {
                title: "Share & automate delivery",
                description: "Package your form into a Response Resource with a custom CTA button. Deploy it manually in chats or automate delivery via Keyword Triggers — when users type matching words, the form is sent automatically.",
                image: '/uploads/placeholder.jpg'
              }
            ]
          },
          capabilities: {
            badge: "Capabilities",
            title: "Everything you need to build powerful forms",
            items: [
              {
                icon: "Layout",
                title: "Drag & Drop Builder",
                description: "Design forms visually — add, reorder, and configure fields in seconds. No coding required."
              },
              {
                icon: "Grid3X3",
                title: "Rich Field Types",
                description: "Text, Text Area, Number, Email, Phone, Dropdown, Single Choice, Checkbox, and Date Picker fields."
              },
              {
                icon: "Fingerprint",
                title: "Meta Flows Powered",
                description: "Forms run on Meta's native interactive data collection system directly inside WhatsApp."
              },
              {
                icon: "Keyboard",
                title: "Keyword Auto-Trigger",
                description: "Link forms to trigger keywords. When users type matching words, the form is sent automatically."
              },
              {
                icon: "Settings",
                title: "Submission Settings",
                description: "Configure success messages, button text, and post-submission behavior for each form."
              },
              {
                icon: "Share2",
                title: "Response Resources",
                description: "Package forms into shareable message flows with custom CTA button text for manual or automated delivery."
              }
            ]
          },
          components_section: {
            badge: "Field Palette",
            title: "Available form components",
            description: "Every field type you need to capture structured data.",
            components: [
              { icon: "AlignLeft", label: "Text & Text Area", desc: "Single & multi-line inputs" },
              { icon: "Mail", label: "Email", desc: "Validated email field" },
              { icon: "Phone", label: "Phone", desc: "Validated number input" },
              { icon: "List", label: "Dropdown", desc: "Multi-option select" },
              { icon: "CheckSquare", label: "Checkbox", desc: "Multiple selection" },
              { icon: "MessageSquare", label: "Single Choice", desc: "Radio button group" },
              { icon: "Calendar", label: "Date Picker", desc: "Native date selector" },
              { icon: "FileText", label: "Number", desc: "Numeric input field" }
            ]
          },
          faqs: {
            badge: "FAQs",
            title: "Questions about WhatsApp Forms?",
            items: [
              {
                question: "How do WhatsApp Forms differ from regular web forms?",
                answer: "Unlike traditional web forms that redirect users to external pages, WhatsApp Forms render directly inside the chat conversation. This eliminates friction, reduces drop-offs, and achieves significantly higher completion rates — users never leave the familiar WhatsApp interface."
              },
              {
                question: "Can I trigger forms automatically based on user messages?",
                answer: "Absolutely. Using Keyword Triggers, you can configure specific keywords (e.g. \"Apply\", \"Register\", \"Book\") to automatically deliver your form. When a user sends a matching keyword, the system responds instantly with the interactive form — no manual intervention needed."
              },
              {
                question: "What field types are available in the form builder?",
                answer: "The visual builder supports Text Input, Text Area, Number, Email, Phone, Dropdown, Single Choice (radio), Checkbox, and Date Picker. Each field can be configured with a display label, placeholder text, and required validation toggle."
              }
            ]
          }
        }
      },
    // ─── AUTOMATION BUILDER ───────────────────────────────────────────────────
    {
      title: 'Automation Builder',
      slug: 'automation_builder',
      system_reserved: true,
      content: '',
      meta_title: 'Automation Builder — Visual No-Code Chatbot Flow Builder',
      meta_description: 'Build powerful WhatsApp chatbots visually with drag-and-drop flow nodes. Automate conversations, qualify leads, and connect webhooks without writing a single line of code.',
      status: true,
      sort_order: 12,
      dynamic_content: {
        hero: {
          badge: 'No-Code Chatbot Builder',
          title: 'Automate Conversations Visually Without Any Code',
          subtitle: 'Create smart WhatsApp chatbots using a simple drag-and-drop builder. Answer customer FAQs, capture contact parameters, branch logic conditionally, and trigger instant webhook lookups automatically.',
          button_text: 'Start Building For Free',
          button_url: '/auth/signup',
          button_2_text: 'Explore Flow Nodes',
          button2_url: '#node-directory',
          bullets: ['No credit card needed', 'Built-in template integration', 'API webhooks enabled'],
          image: '/uploads/placeholder.jpg'
        },
        flow_nodes: {
          badge: 'Visual Blocks Directory',
          title: 'All Conversational Flow Nodes',
          description: 'Connect simple, functional visual components to outline paths for any client inquiry. Filter nodes by core category to discover options.',
          nodes: [
            {
              name: 'Automation Entry',
              description: 'Launches the bot sequence whenever keyword matches, campaigns trigger, or dynamic variables match.',
              type: 'START',
              icon: 'Play'
            },
            {
              name: 'Send Message',
              description: 'Sends a rich text format layout bubble with personalized custom attributes directly to customers.',
              type: 'MESSAGING',
              icon: 'MessageSquare'
            },
            {
              name: 'Quick Reply',
              description: 'Configures clickable buttons (up to 3) allowing clients to choose options instantly without typing.',
              type: 'MESSAGING',
              icon: 'CheckCircle2'
            },
            {
              name: 'Form Flow',
              description: 'Triggers sequential nested message collections to capture customer details like a visual form.',
              type: 'MESSAGING',
              icon: 'FileText'
            },
            {
              name: 'Send Template',
              description: 'Sends pre-approved Meta message templates with headers, footers, and custom variable parameters.',
              type: 'MESSAGING',
              icon: 'Grid'
            },
            {
              name: 'Call to Action',
              description: 'Sends interactive layout buttons linked to phone dialing or external web URLs (e.g. pay links).',
              type: 'MESSAGING',
              icon: 'Sparkles'
            },
            {
              name: 'Selection List',
              description: 'Presents a structured menu list containing sections and row items (up to 10) for organized options selection.',
              type: 'INTERACTIONS',
              icon: 'Layers'
            },
            {
              name: 'Attach Media',
              description: 'Appends rich media files like PDFs, images, invoices, or audio tracks to the chat feed.',
              type: 'INTERACTIONS',
              icon: 'Share2'
            },
            {
              name: 'Send Location',
              description: 'Sends map coordinates (latitude/longitude) of offices or pickup points directly to the user.',
              type: 'INTERACTIONS',
              icon: 'MapPin'
            },
            {
              name: 'Assign Chatbot',
              description: 'Switches active chat handler responsibilities to a separate flow or sub-routine chatbot sequence.',
              type: 'INTERACTIONS',
              icon: 'Briefcase'
            },
            {
              name: 'Wait Timer',
              description: 'Delays flow progression by custom times (seconds, minutes, hours) to humanize bot pacing.',
              type: 'UTILITIES',
              icon: 'Timer'
            },
            {
              name: 'Wait for Reply',
              description: 'Halts the flow process until the customer replies. Captures their entry for evaluation.',
              type: 'UTILITIES',
              icon: 'Timer'
            },
            {
              name: 'Logic Control',
              description: 'Evaluates standard rules (business hours checks, country code filters, prior selections) to route users.',
              type: 'LOGIC',
              icon: 'GitBranch'
            },
            {
              name: 'External API',
              description: 'Performs HTTP request routines (GET, POST, PUT) to fetch or update records in dynamic databases.',
              type: 'INTEGRATIONS',
              icon: 'Database'
            },
            {
              name: 'Webhook',
              description: 'Dispatches trigger events containing user attributes to other platforms (Shopify, CRM) instantly.',
              type: 'INTEGRATIONS',
              icon: 'Share2'
            },
            {
              name: 'Save Response',
              description: 'Persists the values of user responses directly into custom fields in your database layout.',
              type: 'INTEGRATIONS',
              icon: 'Database'
            },
            {
              name: 'Google Sheets',
              description: 'Appends rows or searches values in your integrated Google Spreadsheets spreadsheet in real-time.',
              type: 'INTEGRATIONS',
              icon: 'FileText'
            },
            {
              name: 'Calendar Event',
              description: 'Connects with scheduling software to create meetings or save appointment events on the calendar.',
              type: 'INTEGRATIONS',
              icon: 'Calendar'
            },
            {
              name: 'Assign Tag',
              description: 'Appends a categorizing label (e.g. VIP, Refund Needed) to the contact profile timeline.',
              type: 'CRM',
              icon: 'Tag'
            },
            {
              name: 'Add to Segment',
              description: 'Adds the contact to a segment folder for bulk broadcasting and campaign target filtering.',
              type: 'CRM',
              icon: 'UserPlus'
            },
            {
              name: 'Update Contact',
              description: 'Modifies variables on contact models like name, preferred language, or alternate coordinates.',
              type: 'CRM',
              icon: 'UserCheck'
            }
          ]
        },
        use_cases: {
          badge: 'Use Cases',
          title: 'Proven Chatbot Flow Recipes',
          description: 'Explore how standard node categories compile into production-ready visual automation sequences.',
          tabs: [
            {
              title: 'Lead Qualification & Booking',
              sub_title: '01. LEAD GENERATION',
              side_image: '/uploads/placeholder.jpg',
              steps: [
                {
                  title: 'Automation Entry (Start)',
                  description: 'Triggers flow when user clicks Facebook Ad button payload or sends "Book".'
                },
                {
                  title: 'Form Flow (Messaging)',
                  description: 'Asks qualification details: company size, name, and email sequentially.'
                },
                {
                  title: 'External API / Webhook (Integration)',
                  description: 'Calls API webhook to check calendar availability slots dynamically.'
                },
                {
                  title: 'Calendar Event (Integration)',
                  description: 'Books meeting automatically, posts calendar event, and replies confirmation text.'
                }
              ]
            },
            {
              title: 'Order Status Track Lookup',
              sub_title: '02. CUSTOMER UTILITIES',
              side_image: '/uploads/placeholder.jpg',
              steps: [
                {
                  title: 'Automation Entry (Start)',
                  description: 'Matches incoming keywords containing "Track", "Order", or "Delivery status".'
                },
                {
                  title: 'Wait for Reply (Utilities)',
                  description: 'Asks client: "Please enter order ID". Pauses flow execution until they reply.'
                },
                {
                  title: 'Google Sheets (Integration)',
                  description: 'Searches Spreadsheet order rows automatically to find the match ID status.'
                },
                {
                  title: 'Send Message (Messaging)',
                  description: 'Pulls status variable value and triggers WhatsApp message: "Your order is Shipped".'
                }
              ]
            },
            {
              title: 'Support Triage & Escalation',
              sub_title: '03. SUPPORT SERVICE',
              side_image: '/uploads/placeholder.jpg',
              steps: [
                {
                  title: 'Automation Entry (Start)',
                  description: 'Launches when a contact sends general help queries or matches nothing else.'
                },
                {
                  title: 'Logic Control (Logic)',
                  description: 'Checks rules: Is the current server time between 9:00 AM and 6:00 PM?'
                },
                {
                  title: 'Selection List (Interactions)',
                  description: 'Displays interactive menu categories (Sales, Technical, Billing, FAQs).'
                },
                {
                  title: 'Assign Chatbot (Interactions)',
                  description: 'If customer clicks Technical, switches thread to human Support Shared Inbox.'
                }
              ]
            }
          ]
        },
        faqs: {
          badge: 'FAQs',
          title: 'Got Questions about Chatbots & Flows?',
          items: [
            {
              question: 'Do I need coding skills to build a WhatsApp chatbot?',
              answer: 'Absolutely not. Our Visual Editor is designed specifically for business users. You drag node blocks, link them using cursor lines, and configure triggers or responses in plain text.'
            },
            {
              question: 'How do API integrations or webhooks work?',
              answer: 'The Webhook block triggers dynamic API calls mid-conversation. For example, when a user enters an order ID, the chatbot can make a GET request to your Shopify backend, pull the status, and reply to the user automatically.'
            },
            {
              question: 'What happens when a customer needs human assistance?',
              answer: 'Our chatbot handover block routes the customer context to the Shared Team Inbox immediately. The automation stops running on that active thread, letting agents converse natively.'
            }
          ]
        }
      }
    },
    // ─── CTWA (CLICK TO WHATSAPP ADS) ────────────────────────────────────────
    {
      title: 'Click to WhatsApp Ads',
      slug: 'ctwa',
      content: '',
      system_reserved: true,
      meta_title: 'Click to WhatsApp Ads — Run Facebook & Instagram Ads That Open WhatsApp',
      meta_description: 'Create, manage, and optimize Facebook & Instagram ad campaigns that drive users directly into WhatsApp conversations. Built-in 3-step wizard, targeting, creatives, and real-time analytics.',
      status: true,
      sort_order: 13,
      dynamic_content: {
        hero: {
          badge: 'Click to WhatsApp Ads',
          title: 'Turn Facebook & Instagram Ads into Live WhatsApp Conversations',
          description: 'Create, manage, and optimize ad campaigns that open WhatsApp chats directly. Target the right audience, track performance in real-time, and convert leads faster.',
          button_text: 'Launch Your First Campaign',
          button_url: '/auth/signup',
          button_2_text: 'Explore Features',
          button2_url: '#ctwa-features',
          bullets: ['Facebook & Instagram', '3-Step Wizard', 'Real-Time Analytics'],
          image: '/uploads/placeholder.jpg'
        },
        structure: {
          badge: 'Structure',
          title: 'Campaign hierarchy, visualized',
          subtitle: 'Three levels that define your ad strategy — from broad targeting to precise creative delivery.',
          steps: [
            {
              title: 'Campaigns',
              description: 'Define objective, budget & schedule. Choose from engagement, traffic, awareness, or leads goals.'
            },
            {
              title: 'Ad Sets',
              description: 'Target by location, age, gender & platform. Set bids, scheduling, and delivery optimization.'
            },
            {
              title: 'Ads',
              description: 'Create the creative — image, video, or carousel — with WhatsApp CTA button and welcome experience.'
            }
          ]
        },
        features: {
          badge: 'Features',
          title: 'Built for campaign success',
          items: [
            {
              title: 'Asset Synchronization',
              description: 'Connect your Facebook Pages and Instagram accounts in one click. The system automatically syncs ad accounts, pages, and Instagram professional accounts from your Facebook Business Manager.',
              icon: 'Layers',
              image: '/uploads/placeholder.jpg'
            },
            {
              title: '3-Step Campaign Wizard',
              description: 'No Facebook Ads Manager experience needed. Our guided wizard walks you through three simple steps: campaign details, ad set targeting, and ad creative with WhatsApp CTA.',
              icon: 'Compass',
              image: '/uploads/placeholder.jpg'
            },
            {
              title: 'Location & Demographic Targeting',
              description: 'Reach the right audience with precision. Target by country, age range, gender, and platform. Set daily budgets, bidding strategies, and optimization goals.',
              icon: 'Users',
              image: '/uploads/placeholder.jpg'
            },
            {
              title: 'Multiple Creative Formats',
              description: 'Choose from image, video, or carousel ad formats. Each creative supports a WhatsApp CTA button and can be paired with a WhatsApp Welcome Experience.',
              icon: 'Palette',
              image: '/uploads/placeholder.jpg'
            },
            {
              title: 'WhatsApp Welcome Experience',
              description: 'Set the perfect first impression. Configure a greeting message and ice breaker suggestions that users see when they click your ad and land in WhatsApp.',
              icon: 'MessageCircle',
              image: '/uploads/placeholder.jpg'
            },
            {
              title: 'Real-Time Performance Analytics',
              description: 'Monitor impressions, clicks, CTR, conversions, demographics breakdown, and platform performance. Use interactive charts to identify winning creatives and optimize underperformers.',
              icon: 'LineChart',
              image: '/uploads/placeholder.jpg'
            }
          ]
        },
        steps_launch: {
          badge: 'Wizard',
          title: 'Three simple steps to launch',
          description: 'From concept to live campaign in minutes.',
          steps: [
            {
              title: 'Campaign Setup',
              description: 'Choose your campaign objective — engagement, traffic, awareness, or leads. Define the campaign name, set daily budget, select the special ad category, and pick your optimization goal.'
            },
            {
              title: 'Targeting Configuration',
              description: 'Define who sees your ads. Set targeting by gender, age range, and platforms (Facebook, Instagram, or both). Configure ad set name, daily budget, schedule start/end times, and billing event.'
            },
            {
              title: 'Creative & Welcome',
              description: 'Upload your ad creative — image, video, or carousel. Add the WhatsApp CTA button with your WhatsApp Business number. Configure the Welcome Experience with a greeting message and ice breaker suggestions.'
            }
          ]
        },
        faqs: {
          badge: 'FAQs',
          title: 'Click to WhatsApp Ads — common questions',
          items: [
            {
              question: 'What is Click to WhatsApp Ads and how does it work?',
              answer: 'Click to WhatsApp Ads are Facebook and Instagram advertisements that include a Call-to-Action button opening a WhatsApp chat conversation. When users tap the ad CTA, they\'re taken directly into a WhatsApp chat with your business — no forms, no landing pages, no friction.'
            },
            {
              question: 'Do I need a Facebook Business Manager to create ads?',
              answer: 'Yes. Our system connects to your existing Facebook Business Manager to sync your ad accounts, Facebook Pages, and Instagram professional accounts. Once connected, you can create, manage, and track campaigns directly from our dashboard without ever opening Ads Manager.'
            },
            {
              question: 'What ad formats and creative types are supported?',
              answer: 'We support image, video, and carousel ad formats. Each creative can include a WhatsApp CTA button and be paired with a Welcome Experience — a customizable greeting message with ice breaker suggestion buttons that appear when users land in your WhatsApp chat.'
            }
          ]
        }
      }
    },
    // ─── SHARED TEAM INBOX ──────────────────────────────────────────────────
    {
      title: 'Shared Team Inbox',
      slug: 'shared_team_inbox',
      content: '',
      system_reserved: true,
      meta_title: 'Shared Team Inbox — Collaborate & Manage Customer Chats Together',
      meta_description: 'Bring all your WhatsApp, Instagram, and Facebook conversations into a single desktop viewport. Setup multi-agent routing, private notes, and AI response recommendations.',
      status: true,
      sort_order: 14,
      dynamic_content: {
        hero: {
          badge: 'Omnichannel Team Hub',
          title: 'One Unified Shared Inbox for Collaboration',
          subtitle: 'Stop sharing phones or scanning QR codes. Bring all WhatsApp, Instagram, and Facebook conversations into a single desktop viewport. Help your agents close leads 10x faster with integrated AI.',
          button_text: 'Start Free Trial',
          button_url: '/auth/signup',
          button_2_text: 'Try Live Playground',
          button2_url: '#playground-sec',
          bullets: ['Multi-Agent Routing', 'AI Response Suggestion', 'Mask Numbers (Privacy)'],
          image: '/uploads/placeholder.jpg'
        },
        sandbox: {
          badge: 'Interactive Sandbox',
          title: 'Take the Team Inbox for a Test Drive',
          subtitle: 'Click agent assignments, generate replies using simulated AI, and experience the UI in real-time.',
          image: '/uploads/placeholder.jpg'
        },
        features: {
          badge: 'Engineered for Results',
          title: 'Everything You Need to Automate Customer Success',
          cards: [
            {
              icon: 'Inbox',
              title: 'Unified Inbox Dashboard',
              description: 'Consolidate customer message streams from WhatsApp API, Instagram DMs, and Facebook Messenger into one view. No orphan conversations.'
            },
            {
              icon: 'Users',
              title: 'Smart Agent Routing',
              description: 'Assign conversations manually or setup automated routing parameters to balance workflow queues across support departments instantly.'
            },
            {
              icon: 'Brain',
              title: 'AI Suggested Replies',
              description: 'Generate context-appropriate answers dynamically in the text area based on user ticket histories. Review, insert, and send in 1-click.'
            },
            {
              icon: 'Sparkles',
              title: 'Transform Message Tones',
              description: 'Improve message copy drafts. Rephrase drafts instantly to sound highly professional, friendly, or compact before dispatching.'
            },
            {
              icon: 'MessageSquare',
              title: 'Private Internal Notes',
              description: 'Discuss issues directly on the client timeline. Leave private mentions and agent coordination notes completely hidden from customers.'
            },
            {
              icon: 'ShieldAlert',
              title: 'Customer Number Masking',
              description: 'Secure business data. Mask client telephone numbers from agents to protect databases, reduce information leakage, and enforce compliance.'
            }
          ]
        },
        team: {
          badge: 'Team Collaboration',
          title: 'Build Better Collaborations Behind the Scenes',
          description: 'Enable your agents to coordinate on customer issues in real-time. Share labels, leave private internal instructions, and track agent activity logs without switching windows.',
          side_image: '/uploads/placeholder.jpg',
          cards: [
            {
              icon: 'Layers',
              title: 'Prevent Collision & Duplicate Replies',
              description: 'See who is viewing or replying to a chat in real-time to avoid sending overlapping answers.'
            },
            {
              icon: 'Tag',
              title: 'Assign Shared Tags & Filters',
              description: 'Classify contacts using global tags like "Refund" or "VIP Inquirer" so any agent can search and filters queues.'
            }
          ]
        },
        counter: {
          badge: 'Performance Impact',
          title: 'Grow Your Business on Solid Numbers',
          subtitle: 'See how adding a multi-agent Shared Inbox affects key business performance indicators. By automating drafts and routing chats instantly, teams respond faster and keep customers happier.',
          counters: [
            {
              counts: '75%',
              title: 'Quicker Response Times',
              description: 'AI drafting tools and canned templates help agents resolve customer queries in seconds.'
            },
            {
              counts: '10x',
              title: 'Productivity Boost',
              description: 'Multiple support agents work simultaneously under a single profile number.'
            },
            {
              counts: '0',
              title: 'Missed Messages',
              description: 'Shared visibility prevents messages from slipping through shifts unhandled.'
            }
          ]
        },
        faqs: {
          badge: 'FAQs',
          title: 'Got Questions about the Shared Inbox?',
          items: [
            {
              question: 'Do agents need their own separate mobile devices?',
              answer: 'No. The entire workspace runs on a single official WhatsApp Business API profile or social page. Support agents login through their own dashboard accounts and share access dynamically.'
            },
            {
              question: 'How does the contact masking / privacy control feature work?',
              answer: 'Admins can enable contact masking in settings. Once activated, phone numbers are masked on the screen (e.g. +1 •••• ••-9922). Agents can send and receive texts, but cannot view or export complete contact numbers.'
            },
            {
              question: 'Can we write notes to other team members during a chat?',
              answer: 'Yes. Private Internal Notes can be written directly on the chat flow. They are highlighted with a distinct yellow theme and are completely invisible to customers.'
            },
            {
              question: 'How do AI suggestions and text transformation work?',
              answer: 'Our integrated LLM evaluates the client question and context to draft a reply instantly. Agents can hit the "Suggest Reply" button to insert it or use the rewrite panel to adjust tone guidelines.'
            }
          ]
        }
      }
    }
    ];

    for (const pageData of pages) {
      await Page.findOneAndUpdate(
        { slug: pageData.slug },
        pageData,
        { upsert: true, returnDocument: 'after' }
      );
    }

    console.log('Pages seeded successfully!');
  } catch (error) {
    console.error('Error seeding pages:', error);
    throw error;
  }
}

export default seedPages;
