import { Guide, User, Role } from '../models/index.js';

const seedGuide = async () => {
    try {
        console.log('Seeding guides...');

        const superAdminRole = await Role.findOne({ name: 'super_admin' });

        const admin = await User.findOne({ role_id: superAdminRole._id });
        const adminId = admin ? admin._id : null;
        console.log(adminId, 'adminId');

        const guides = [
            {
                title: 'Subscription & Billing',
                category: 'Getting Started',
                sub_title: 'Manage your plan, billing, and usage limits',
                slug: 'getting-started',
                description: 'The Subscription Management feature is the central hub for managing your Wapi platform plan, billing details, and service limits. It provides real-time visibility into feature usage while offering flexible options to scale your business as needed.',
                order: 1,
                sections: [
                    {
                        title: 'Overview & Key Capabilities',
                        content: `
<p>The Subscription Management module provides a centralized interface to control your entire billing and plan lifecycle.</p>

<ul>
  <li><strong>Centralized Control:</strong> Manage your subscription plans, billing cycles, and payment methods from a single dashboard.</li>
  <li><strong>Real-time Tracking:</strong> Monitor usage limits such as contacts, campaigns, and AI agents with live indicators.</li>
  <li><strong>Flexible Scaling:</strong> Upgrade or downgrade your plan anytime based on your business requirements.</li>
</ul>

<p>This ensures you always have full visibility and control over your platform usage and costs.</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/33.png',
                                caption: 'Subscription dashboard overview'
                            }
                        ]
                    },
                    {
                        title: 'Dashboard & Plan Details',
                        content: `
<p>The subscription dashboard is designed with clear sections to give you quick insights into your current plan and billing status.</p>

<h4>Current Plan Details</h4>
<ul>
  <li><strong>Plan Name:</strong> Displays your active subscription tier (e.g., Plan 1).</li>
  <li><strong>Status:</strong> Shows whether your plan is Active, Expired, or Canceled.</li>
  <li><strong>Renewal Date:</strong> Indicates the next billing cycle date.</li>
</ul>

<h4>Billing & Lifecycle</h4>
<p>You can track your financial activity and subscription lifecycle directly from this dashboard.</p>

<ul>
  <li>View billing history and payment records</li>
  <li>Understand your current usage and limits</li>
  <li>Track subscription validity and renewal timelines</li>
</ul>
`
                    },
                    {
                        title: 'Plan Management Actions',
                        content: `
<p>You can easily modify your subscription based on your business needs using the plan management options.</p>

<ul>
  <li><strong>Upgrade:</strong> Instantly increase limits and unlock advanced features.</li>
  <li><strong>Downgrade:</strong> Switch to a lower plan to optimize costs.</li>
  <li><strong>Cancel:</strong> Stop recurring billing and restrict access after the current cycle ends.</li>
</ul>

<p>All actions are available through the <strong>Manage Plan</strong> option, ensuring a smooth and flexible experience.</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/34.png',
                                caption: 'Subscription dashboard overview'
                            }
                        ]
                    },
                    {
                        title: 'Payment Methods',
                        content: `
<p>The platform supports multiple payment options for seamless transactions.</p>

<ul>
  <li><strong>Stripe:</strong> Secure card payments and subscriptions</li>
  <li><strong>Razorpay:</strong> Popular payment gateway for fast transactions</li>
  <li><strong>PayPal:</strong> International payments support</li>
  <li><strong>Manual:</strong> Offline or custom payment handling</li>
</ul>

<p>You can select or update your preferred payment method during checkout or subscription updates.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Account Setup',
                category: 'Getting Started',
                sub_title: 'How to connect your waba?',
                slug: 'getting-started',
                description: 'After registering and logging into the platform, and after creating workspace. A workspace acts as a dedicated environment for managing your WhatsApp Business Account (WABA). whole platforms advance feature need mandotory waba connection.',
                order: 2,
                sections: [
                    {
                        title: 'Connection Methods',
                        content: `
                            <p>To use Wapi  effectively, you must connect your WhatsApp Business Account (WABA). Choose the method that best suits your technical preference:</p>
                            <ul>
                                <li><strong>Method A: Embedded Signup (Recommended)</strong> - The fastest way to connect. Authenticate directly via Meta.</li>
                                <li><strong>Method B: QR Code Connection</strong> - Quickly link your device by scanning a code.</li>
                                <li><strong>Method C: Manual (Cloud API)</strong> - Manually input identifiers from your Meta Developer App.</li>
                            </ul>
                        `,
                        images: []
                    },
                    {
                        title: 'Method A: Embedded Signup (Recommended)',
                        content: `
                            <p>Embedded Signup is the preferred choice for faster onboarding. Follow these steps:</p>
                            <ol>
                                <li><strong>Step 1: Click "Connect WhatsApp"</strong> - Locate the connect button on the Integrations page.</li>
                                <li><strong>Step 2: Login with Facebook</strong> - A Meta popup will open. Login with your admin account.</li>
                                <li><strong>Step 3: Business Account</strong> - Select or create your Meta Business Account.</li>
                                <li><strong>Step 4: Select WABA</strong> - Choose your existing WABA or create a new one.</li>
                                <li><strong>Step 5: Add Phone Number</strong> - Enter the business phone number you wish to use.</li>
                                <li><strong>Step 6: Verify Number</strong> - Enter the 6-digit OTP received via SMS or Voice.</li>
                                <li><strong>Step 7: Grant Permissions</strong> - Allow access to manage messages and settings.</li>
                                <li><strong>Step 8: Complete</strong> - Your account is now "Connected".</li>
                            </ol>
                        `,
                        images: [
                            { url: 'https://docs.pixelstrap.net/wapi/assets/images/waba-connection/es1.png', caption: 'Step 2: Login with Facebook' },
                            { url: 'https://docs.pixelstrap.net/wapi/assets/images/waba-connection/es2.png', caption: 'Step 3: Select Business Account' },
                            { url: 'https://docs.pixelstrap.net/wapi/assets/images/waba-connection/es3.png', caption: 'Step 4: Select WABA' },
                            { url: 'https://docs.pixelstrap.net/wapi/assets/images/waba-connection/es5.png', caption: 'Step 5: Add Phone Number' },
                            { url: 'https://docs.pixelstrap.net/wapi/assets/images/waba-connection/step5.png', caption: 'Step 6: Verify Phone Number' },
                            { url: 'https://docs.pixelstrap.net/wapi/assets/images/waba-connection/es6.png', caption: 'Step 7: Grant Permissions' },
                            { url: 'https://docs.pixelstrap.net/wapi/assets/images/waba-connection/es7.png', caption: 'Step 8: Setup Complete' }
                        ]
                    },
                    {
                        title: 'Method B: Manual (Cloud API)',
                        content: ` <p>Use this method if you prefer to manually input identifiers from your Meta Developer App. You will need the following details:</p>

     <ul>
      <li><strong>Phone Number ID</strong></li>
      <li><strong>WhatsApp Business ID</strong></li>
      <li><strong>Registered Phone Number</strong></li>
      <li><strong>Business ID</strong></li>
      <li><strong>App ID</strong></li>
      <li><strong>Permanent Access Token</strong></li>
    </ul>

    <h4>Where to find these details?</h4>

    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th align="left">Requirement</th>
          <th align="left">Where to find it</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Phone Number ID</strong></td>
          <td>Meta Developer Portal → WhatsApp → API Setup → Phone Number ID</td>
        </tr>
        <tr>
          <td><strong>WhatsApp Business ID</strong></td>
          <td>Meta Developer Portal → WhatsApp → API Setup → WhatsApp Business Account ID</td>
        </tr>
        <tr>
          <td><strong>Registered Phone Number</strong></td>
          <td>Meta Developer Portal → WhatsApp → Quick Start → Phone Numbers section</td>
        </tr>
        <tr>
          <td><strong>Business ID</strong></td>
          <td>Meta Business Settings → Business Info → Business Manager ID</td>
        </tr>
        <tr>
          <td><strong>App ID</strong></td>
          <td>Meta Developer Portal → App Dashboard → App ID (top bar)</td>
        </tr>
        <tr>
          <td><strong>Permanent Access Token</strong></td>
          <td>Meta Business Settings → System Users → Generate Access Token</td>
        </tr>
      </tbody>
    </table>

    <p>Make sure all values are correct before saving to ensure a successful connection.</p>
  `,
                        images: []
                    },
                    {
                        title: 'Method C: QR Code Connection',
                        content: `
                            <p>Quickly link your device by scanning a code, similar to WhatsApp Web:</p>
                            <ul>
                                <li>Open WhatsApp on your mobile phone.</li>
                                <li>Tap Menu (⋮) or Settings (⚙️) and select <strong>Linked Devices</strong>.</li>
                                <li>Tap on <strong>Link a Device</strong>.</li>
                                <li>Point your phone to current screen to capture the QR code.</li>
                            </ul>
                        `,
                        images: []
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Webhook Setup',
                category: 'Getting Started',
                sub_title: 'Guide to setting up webhook integration with Meta',
                slug: 'getting-started',
                description: 'Learn how to set up and configure a webhook with Meta to receive real-time WhatsApp message and event updates. This guide walks you through connecting your callback URL, verifying the webhook, and ensuring your integration works smoothly.',
                order: 3,
                sections: [
                    {
                        title: 'Configure Webhook in Meta',
                        content: `In the Webhook Controls section, you will find your Webhook URL and Verification Token.

Copy both values carefully.

Now go to your Meta App Dashboard and navigate to:
WhatsApp → Configuration

Paste the Webhook URL and Verification Token into the respective fields.

Click on "Verify and Save" to complete the webhook setup and start receiving real-time WhatsApp events.`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/3.png',
                                caption: 'Webhook Controls section showing Webhook URL and Verification Token'
                            }
                        ]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'WABA Manage',
                category: 'Getting Started',
                sub_title: 'Manage phone numbers and disconnect WABA',
                slug: 'getting-started',
                description: 'Once your WhatsApp Business Account (WABA) is successfully connected, all verified phone numbers will be automatically synced and displayed in this section. You can easily manage, monitor, and track the status of each number from a centralized dashboard.',
                order: 4,
                sections: [
                    {
                        title: 'Disconnect WABA Account',
                        content: `
  <p>To remove your WhatsApp Business Account connection from this workspace, click the <strong>Disconnect WABA Account</strong> button.</p>

  <p>Disconnecting will immediately stop all services that require an active WABA connection.</p>

  <p>If your WABA was connected using a QR code, this action will also log out the session from all linked devices in your WhatsApp application.</p>

  <p><strong>Note:</strong> You will need to reconnect your WABA to use these services again.</p>
`,
                        images: []
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Chat Inbox',
                category: 'Chat Management',
                sub_title: 'Manage and respond to customer conversations in one place',
                slug: 'chat-management',
                description: 'WA Chat is a centralized inbox for managing WhatsApp conversations in real time. It allows multiple agents to collaborate efficiently and requires a connected WhatsApp Business Account (WABA) to operate.',
                order: 1,
                sections: [
                    {
                        title: 'Chat Interface Overview',
                        content: `
        <p>The Chat Inbox provides a unified interface to manage all your customer conversations in one place.</p>

        <p>You can view active chats, send and receive messages in real time, and access full conversation history.</p>

        <p>The message composer allows you to send text, media, and attachments, enabling smooth and efficient communication.</p>

        <p>This interface helps agents handle multiple conversations without switching between screens.</p>
      `,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/chat-inbox.png',
                                caption: 'chat inbox'
                            }
                        ]
                    },
                    {
                        title: 'Contact Management & Actions',
                        content: `
        <p>Each contact includes management options to help organize and handle conversations effectively.</p>

        <ul>
          <li><strong>Assign Agent:</strong> Assign a specific agent to manage the conversation.</li>
          <li><strong>AI Calling Agent:</strong> Assign an AI agent for voice-based interactions.</li>
          <li><strong>Tags:</strong> Add labels to organize and filter contacts.</li>
          <li><strong>Media:</strong> View all shared media files within the conversation.</li>
          <li><strong>Notes:</strong> Add internal notes for better context and tracking.</li>
        </ul>

        <p>These features improve collaboration and help maintain better customer context.</p>
      `,
                        images: []
                    },
                    {
                        title: 'AI Suggestions & Message Transformation',
                        content: `
        <p>The Chat Inbox includes AI-powered tools to enhance your messaging experience.</p>

        <h4>AI Reply Suggestions</h4>
        <p>Get smart reply suggestions based on previous conversation history. Responses are generated according to the selected tone, helping you reply faster and more consistently.</p>

        <h4>Transform Text Message</h4>
        <p>You can transform your message using options such as:</p>
        <ul>
          <li>Summarize</li>
          <li>Improve</li>
          <li>Translate</li>
          <li>Casualize</li>
          <li>Formalize</li>
        </ul>

        <p>These tools help refine your message before sending it.</p>

        <p><strong>Note:</strong> To use AI features, you must configure an API key.</p>
        <p>Go to <strong>AI Settings</strong> → Select AI model → Enter API key → Save.</p>
      `,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/aisuggest.png',
                                caption: 'AI suggestion and transform text message options in chat input'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ai1.png',
                                caption: 'AI suggestion and transform text message options in chat input'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ai2.png',
                                caption: 'AI suggestion and transform text message options in chat input'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ai3.png',
                                caption: 'AI suggestion and transform text message options in chat input'
                            },
                        ]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'AI Settings',
                category: 'Chat Management',
                sub_title: 'How to setup AI',
                slug: 'chat-management',
                description: 'The AI Configuration engine integrates LLMs (OpenAI, Gemini, Grok) to power smart automated responses and lead qualification with full cost and personality control.',
                order: 2,
                sections: [
                    {
                        title: 'AI Settings',
                        content: `
<p>The AI Configuration engine allows you to integrate powerful Large Language Models (LLMs) to automate responses and qualify leads effectively.</p>

<h4>Setup Process</h4>
<ol>
    <li><strong>Select Model:</strong> Choose your preferred AI model (OpenAI, Gemini, or Grok) from the dropdown.</li>
    <li><strong>Paste API Key:</strong> Enter your secret API key obtained from the provider's platform.</li>
    <li><strong>Save Settings:</strong> Click the save button to store your configuration.</li>
    <li><strong>AI Activation:</strong> Once saved, AI features like suggestions and message transformation will be activated across the platform.</li>
</ol>

<h4>API Key Acquisition Flow</h4>
<ul>
    <li><strong>Account Setup:</strong> Sign up on the provider's platform:
        <ul>
            <li><strong>OpenAI:</strong> <a href="https://platform.openai.com/" target="_blank">platform.openai.com</a></li>
            <li><strong>Google AI Studio (Gemini):</strong> <a href="https://aistudio.google.com/" target="_blank">aistudio.google.com</a></li>
        </ul>
    </li>
    <li><strong>Billing/Credits:</strong> Ensure you have active credits or a payment method linked. <em>Note: Gemini often provides a free tier for developers.</em></li>
    <li><strong>Create Secret Key:</strong> Navigate to the API Keys section and click <strong>"Create New Secret Key"</strong>.</li>
    <li><strong>Paste & Secure:</strong> Copy the key immediately (it won't be shown again) and paste it into the <strong>Wapi AI Config vault</strong>.</li>
</ul>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/44.png',
                                caption: 'chat appearance'
                            }
                        ]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Chat Appearance',
                category: 'Chat Management',
                sub_title: 'Customize chat theme and interface',
                slug: 'chat-management',
                description: 'Customize your chat interface to match your brand identity. Modify colors, apply background styles, and create a clean, WhatsApp-like chat experience for better user engagement.',
                order: 3,
                sections: [
                    {
                        title: 'Customize Chat Theme',
                        content: `
<p>You can personalize the chat interface to resemble a WhatsApp-style experience. This includes adjusting chat bubble colors, background styles, and overall layout.</p>

<p>Choose colors that align with your brand while maintaining readability and a modern look.</p>

<p>Applying a clean and minimal design helps improve user interaction and enhances the messaging experience.</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/2.png',
                                caption: 'chat appearance'
                            }
                        ]
                    },
                    {
                        title: 'Apply Background & Colors',
                        content: `
<p>Enhance your chat UI by setting custom backgrounds such as solid colors, gradients, or images.</p>

<p>You can also define different colors for sender and receiver chat bubbles to clearly distinguish conversations.</p>

<p><strong>Tip:</strong> Use light backgrounds with contrasting text colors for better readability.</p>
`,
                        images: []
                    },
                    {
                        title: 'WhatsApp Style Layout',
                        content: `
<p>Enable a WhatsApp-inspired layout to give users a familiar messaging experience.</p>

<p>This includes rounded chat bubbles, proper spacing, timestamp alignment, and message grouping.</p>

<p>The layout ensures a smooth and intuitive chat flow similar to modern messaging apps.</p>
`,
                        images: []
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Pipeline Board',
                category: 'Chat Management',
                sub_title: 'Manage your automated funnel pipelines effortlessly',
                slug: 'chat-management',
                description: 'The Pipeline Board is the strategic command center for your business workflows. It provides a visual, highly interactive Kanban interface designed to manage your automated funnel pipelines effortlessly.',
                order: 4,
                sections: [
                    {
                        title: 'Executive Overview',
                        content: `
<p>The Pipeline Board serves as the strategic command center for your business workflows. It transforms static conversational data into dynamic, actionable workflows via a visual Kanban interface.</p>

<ul>
  <li><strong>Visual Architecture:</strong> Manage customer onboarding or high-value sales with absolute clarity.</li>
  <li><strong>Lead Retention:</strong> Ensure no lead falls through the cracks by tracking every stage of the journey.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/kf1.png',
                            caption: 'Pipeline Board Overview'
                        }]
                    },
                    {
                        title: 'Pipeline Initialization & Creation',
                        content: `
<p>Wapi supports multiple discrete pipeline instances, allowing separate workflows for different departments (e.g., Sales vs. Support).</p>

<ul>
  <li><strong>Funnel Type (Critical):</strong> You must designate the data source for the pipeline:
    <ul>
      <li><strong>Contact:</strong> Pulls from your unified contact database.</li>
      <li><strong>Form Submission:</strong> Pulls from incoming WhatsApp Forms.</li>
      <li><strong>Agent:</strong> Tracks specific human agent tasks.</li>
    </ul>
  </li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/kf2.png',
                            caption: 'Create Pipeline Configuration'
                        }]
                    },
                    {
                        title: 'Master Dashboard Actions',
                        content: `
<p>Execute top-level commands directly from your pipeline cards:</p>
<ul>
  <li><strong>Manage:</strong> Launch the interactive Kanban board environment.</li>
  <li><strong>Edit:</strong> Modify pipeline nomenclature or descriptions as goals pivot.</li>
  <li><strong>Delete:</strong> Permanently erase the pipeline and its configurations.</li>
</ul>
`
                    },
                    {
                        title: 'Interactive Kanban Management',
                        content: `
<p>This environment is powered by a seamless drag-and-drop architecture designed for rapid data triage.</p>

<ul>
  <li><strong>Data List & Allocation:</strong> Unassigned data accumulates in the right-hand panel. Drag items into stages to initiate tracking.</li>
  <li><strong>Stage Customization:</strong> Add new columns, rename stages, or reorder the flow to reconstruct your linear progression.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/kf.png',
                            caption: 'Kanban Pipeline Management Interface'
                        }]
                    },
                    {
                        title: 'Granular Task & Archive Protocol',
                        content: `
<p>Communicate urgency and maintain board cleanliness with these advanced tools:</p>

<ul>
  <li><strong>Item Priorities:</strong> High (critical escalations), Medium (standard velocity), or Low (background tasks).</li>
  <li><strong>Archive System:</strong> When a journey completes (e.g., "Closed Won"), archive the card to preserve data for future auditing without cluttering active stages.</li>
</ul>
`
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Template Overview',
                category: 'Template',
                sub_title: 'WhatsApp Templates Basic Detail',
                slug: 'template',
                description: 'WhatsApp Templates are structured, pre-approved message payloads required by Meta to initiate or restart business-to-customer conversations. These templates form the backbone of your automated communication strategy, enabling proactive engagement while ensuring compliance with WhatsApp\'s global messaging policies.\n\n**Requirement:** You must have a connected WhatsApp Business API (WABA)',
                order: 1,
                sections: [
                    {
                        title: 'Ready to Use Templates',
                        content: `
<p>The Admin Template Library provides a collection of pre-built WhatsApp message templates that are ready to use.</p>

<p>These templates are designed for different use cases such as marketing, utility, authentication, and customer engagement, helping you save time and maintain consistency.</p>

<p>You can browse templates by category or industry, preview their content, and quickly select the one that fits your needs. Use these templates as a starting point and make relevant changes to create your own custom templates.</p>

<p><strong>Tip:</strong> Use the search and filter options to quickly find relevant templates and streamline your workflow.</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/5.png',
                                caption: 'Ready to use templates'
                            }
                        ]
                    },
                    {
                        title: 'Template Category Standard',
                        content: `
<ul>
    <li><strong>Marketing:</strong> Used for promotions, announcements, and product updates. These are strategic tools for driving conversions and engagement.</li>
    <li><strong>Utility:</strong> Critical transactional updates such as order confirmations, payment receipts, and delivery tracking notifications.</li>
    <li><strong>Authentication:</strong> High-security messages used for providing One-Time Passwords (OTPs) and account verification codes.</li>
</ul>
`,
                        images: []
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Custom Utility Template Creation',
                category: 'Template',
                sub_title: 'How to create your own utility templates',
                slug: 'template',
                description: 'Navigate to Channels → Sidebar → Templates. Choose Custom and click the green "+ Create new Template" button at the top-right to build from scratch.',
                order: 2,
                sections: [
                    {
                        title: 'Basic Configuration',
                        content: `
<p>To begin creating your own template, enter your <strong>Template Name</strong>, select the <strong>Language</strong>, and set <strong>Category = Utility</strong>.</p>

<p><strong>Naming Requirement:</strong> Template names must consist strictly of lowercase letters, numbers, and underscores (e.g., <code>order_update_01</code>).</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tc2.png',
                                caption: 'Interactive buttons'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tc3.png',
                                caption: 'basic configuration'
                            }
                        ]
                    },
                    {
                        title: 'Structural Component Guide',
                        content: `
<p>Build your message using these standard components to ensure a premium user experience.</p>

<ul>
    <li><strong>Header (Optional):</strong> Supports Text (max 60 chars) or Media (Images, Video, Documents, Location). <br><em>Example: "Order Confirmation" or a company logo.</em></li>
    <li><strong>Body (Required):</strong> The core message content. Supports dynamic variables for personalization using curly brackets (e.g., <code>{{1}}</code>). <br><em>Example: "Hi {{1}}, your order #{{2}} is ready for pickup."</em></li>
    <li><strong>Footer (Optional):</strong> Small text at the bottom for disclaimers or helpful notes. <br><em>Example: "Thank you for your time"</em></li>
</ul>

<div>
<h4>Interactive Buttons</h4>
<p>Add interactive buttons to your message to drive user actions and engagement.</p>
<ul>
    <li><strong>Call-To-Action (URL):</strong> Redirect users to a website or tracking page. Requires Button Title and URL.</li>
    <li><strong>Call-To-Action (Phone):</strong> Allows users to directly call a number. Requires Button Title and Phone Number.</li>
    <li><strong>Quick Replies:</strong> Predefined response options users can tap for instant interaction (e.g., "Yes", "Cancel").</li>
</ul>

<h6>How to Add Buttons</h6>
<ol>
    <li><strong>Select Type:</strong> Choose between Quick Replies, Call-To-Action, or ALL.</li>
    <li><strong>Enter Details:</strong> Provide the required Button Title, URL, or Phone Number.</li>
    <li><strong>Extend:</strong> Click the green <strong>"+ Add"</strong> button to include additional buttons.</li>
</ol>
</div>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tc4.png',
                                caption: 'Header '
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tc5.png',
                                caption: 'Interactive buttons'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tc6.png',
                                caption: 'Interactive buttons'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tc7.png',
                                caption: 'Interactive buttons'
                            }
                        ]
                    },
                    {
                        title: 'Review & Handover',
                        content: `
<p>Before final submission, use the <strong>Live Preview</strong> panel on the right to verify the visual layout across different devices.</p>

<p>Once satisfied, click <strong>"Submit for Approval"</strong>. Meta typically reviews utility templates within minutes to 24 hours.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tc8.png',
                            caption: 'review and submit'
                        }]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Custom Marketing Template Creation',
                category: 'Template',
                sub_title: 'How to create marketing templates for promotions',
                slug: 'template',
                description: 'Used for promotions, announcements, and product updates. These are strategic tools for driving conversions and engagement.\n\nQuickly configure your Marketing template by selecting the appropriate category and experience type.',
                order: 3,
                sections: [
                    {
                        title: 'Basic Setup',
                        content: `
<p>Navigate to <strong>Templates</strong>, select <strong>Custom</strong>, and set <strong>Category = Marketing</strong> using standard naming (lowercase/numbers/underscores).</p>

<h4>Select Marketing Template Type</h4>
<p>Note: You can select Specific marketing template types.</p>
<ul>
    <li><a href="#standard-marketing-breakdown">Standard Marketing</a></li>
    <li><a href="#limited-time-offer-breakdown">Limited Time Offer</a></li>
    <li><a href="#coupon-code-breakdown">Coupon Code</a></li>
    <li><a href="#catalog-template-breakdown">Catalog</a></li>
    <li><a href="#call-permission-breakdown">Call Permission</a></li>
    <li><a href="#carousel-product-breakdown">Carousel Product</a></li>
    <li><a href="#carousel-media-breakdown">Carousel Media</a></li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm1.png',
                            caption: 'select marketing template type'
                        }]
                    },
                    {
                        title: 'Standard Marketing Breakdown',
                        content: `
<h4>1. Template Header (Optional)</h4>
<p>Enhance impact with a custom text or media attachment.</p>
<ul>
    <li>TEXT (60 Chars)</li>
    <li>IMAGE</li>
    <li>VIDEO</li>
    <li>DOCUMENT</li>
</ul>

<h4>2. Message Body *</h4>
<p>Core content with rich text and dynamic variables.</p>
<p>Use <code>{{1}}</code> to insert dynamic parameters like names or order IDs.</p>

<h4>3. Template Footer (Optional)</h4>
<p>Short informational text at the bottom (max 60 characters).</p>

<h4>4. Interactive Buttons</h4>
<p>Add Quick Replies or Call-to-Action (URL/Phone) to drive actions.</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm2.png',
                                caption: 'standard marketing template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm3.png',
                                caption: 'standard marketing template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm4.png',
                                caption: 'standard marketing template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm5.png',
                                caption: 'standard marketing template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tp1.png',
                                caption: 'standard marketing template'
                            }
                        ]
                    },
                    {
                        title: 'Limited Time Offer Breakdown',
                        content: `
<h4>1. Offer Text *</h4>
<p>Displays prominently alongside the expiration timer (max 60 characters).</p>

<h4>2. Message Body *</h4>
<p>Main message content. Supports rich text and variables.</p>
<p>Use <code>{{1}}</code> for dynamic values like customer name or product details.</p>

<h4>3. Interactive Buttons</h4>
<p>Limited Time Offers typically require Call-to-Action (URL/Phone) buttons.</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm6.png',
                                caption: 'limited time offer template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm7.png',
                                caption: 'limited time offer template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm8.png',
                                caption: 'limited time offer template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tp2.png',
                                caption: 'limited time offer template'
                            }
                        ]
                    },
                    {
                        title: 'Coupon Code Breakdown',
                        content: `
<h4>1. Message Body *</h4>
<p>Main content of your message. Supports rich text and dynamic variables.</p>
<p>Use <code>{{1}}</code> to add dynamic parameters like discount amounts or customer names.</p>

<h4>2. Interactive Buttons</h4>
<p>Drive engagement with action-oriented buttons:</p>
<ul>
    <li><strong>Call-to-Action:</strong> Add up to 2 URL buttons to redirect users.</li>
    <li><strong>Copy Code:</strong> Add a specialized button that copies the coupon code to the user's clipboard.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm9.png',
                            caption: 'coupon code template'
                        },
                        {
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm10.png',
                            caption: 'coupon code template'
                        },
                        {
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tp3.png',
                            caption: 'coupon code template'
                        }]
                    },
                    {
                        title: 'Catalog Template Breakdown',
                        content: `
<h4>1. Message Body *</h4>
<p>The main content of your message. Supports rich text and variables.</p>
<p>Use <code>{{1}}</code> to add static/dynamic variables to your message.</p>

<h4>2. Variable Examples *</h4>
<p>You must provide realistic examples for all variables used in the body.</p>
<p>Example: VARIABLE <code>{{1}}</code> → "Standard Edition"</p>
<p><strong>Note:</strong> These examples are mandatory for Meta's template review process.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm11.png',
                            caption: 'catalog template'
                        },
                        {
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tp4.png',
                            caption: 'catalog template'
                        }]
                    },
                    {
                        title: 'Call Permission Breakdown',
                        content: `
<h4>1. Message Body *</h4>
<p>Compose a message asking your customer for their formal opt-in to receive phone calls.</p>
<p>Example: "Are you okay with us connecting with you via call?"</p>

<h4>2. Call Permission Request</h4>
<p>This template automatically includes the <code>call_permission</code> flag in its payload. No additional configuration is required beyond the message body.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm12.png',
                            caption: 'call permission template'
                        },
                        {
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tp5.png',
                            caption: 'call permission template'
                        }]
                    },
                    {
                        title: 'Carousel Product Breakdown',
                        content: `
<h4>1. Message Body *</h4>
<p>Main question or context for the carousel (min 1, max 1600 characters). Supports variables.</p>
<p>Example: "Which of these books would you like to buy?"</p>

<h4>2. Product Cards *</h4>
<p>Add between 2 and 10 cards to showcase products from your catalog.</p>
<ul>
    <li><strong>Product Header:</strong> Dynamically linked via your product catalog.</li>
    <li><strong>Button Text:</strong> Fixed to "View" for all cards in a Product Carousel.</li>
</ul>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm13.png',
                                caption: 'carousel product template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm14.png',
                                caption: 'carousel product template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tp6.png',
                                caption: 'carousel product template'
                            }
                        ]
                    },
                    {
                        title: 'Carousel Media Breakdown',
                        content: `
<h4>1. Message Body *</h4>
<p>The primary text content that accompanies your media carousel.</p>

<h4>2. Shared Button Structure *</h4>
<p>Define the buttons that will appear on every card in the carousel.</p>
<ul>
    <li><strong>URL Button:</strong> Redirect customers to a specific link.</li>
    <li><strong>Quick Reply:</strong> Predefined responses for users to tap.</li>
</ul>
<p><strong>Note:</strong> All cards share the same button structure; only the button text can be customized per card.</p>

<h4>3. Media Cards *</h4>
<p>Add between 2 and 10 media cards to your carousel.</p>
<ul>
    <li><strong>Card Image:</strong> Upload JPG or PNG images (Max 5MB).</li>
    <li><strong>Card Body Text:</strong> Specific description for each card (Max 200 characters).</li>
</ul>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm13.png',
                                caption: 'carousel product template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tm15.png',
                                caption: 'carousel product template'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tp7.png',
                                caption: 'carousel product template'
                            }
                        ]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Custom Authentication Template Creation',
                category: 'Template',
                sub_title: 'How to create secure OTP templates',
                slug: 'template',
                description: 'High-security messages used for providing One-Time Passwords (OTPs) and account verification codes.\n\nQuickly configure your Authentication template by selecting the appropriate category and experience type.',
                order: 4,
                sections: [
                    {
                        title: 'Basic Setup',
                        content: `
<p>Navigate to <strong>Templates</strong>, select <strong>Custom</strong>, and set <strong>Category = Authentication</strong> using standard naming (lowercase/numbers/underscores).</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ta1.png',
                                caption: 'basic setup'
                            }
                        ]
                    },
                    {
                        title: 'Authentication Configuration',
                        content: `
<h4>Message Body</h4>
<p>Authentication content is strictly formatted. Use <code>{{1}}</code> for the OTP code and <code>{{2}}</code> for expiry minutes.</p>

<h4>Verification Content *</h4>
<p>"Your verification code is <code>{{1}}</code>. Valid for <code>{{2}}</code> minutes."</p>
<p><strong>Note:</strong> Marketing or promotional content is strictly prohibited in this category.</p>

<h4>Button Text</h4>
<p>The text shown on the OTP action button. Fixed to <strong>"Copy Code"</strong> for authentication templates. It is immutable; you cannot change it.</p>

<h4>OTP Configuration</h4>
<p>Define the security parameters for your one-time passwords.</p>
<ul>
    <li><strong>OTP Code Length:</strong> Choose between 4 to 8 digits for your security code.</li>
    <li><strong>Code Expiry:</strong> Set validity duration between 1 to 90 minutes.</li>
</ul>

<h4>Additional Options</h4>
<p>Enhance security and branding with optional features.</p>
<ul>
    <li><strong>Security Recommendation:</strong> Enable this to automatically append: "For your security, do not share this code."</li>
    <li><strong>Footer Text (Optional):</strong> Add a secondary line at the bottom (max 60 characters).</li>
</ul>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ta2.png',
                                caption: 'authentication template configuration'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ta3.png',
                                caption: 'authentication template configuration'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ta4.png',
                                caption: 'authentication template configuration'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ta5.png',
                                caption: 'authentication template configuration'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/tp8.png',
                                caption: 'authentication template configuration'
                            }
                        ]
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Google Account Setup',
                category: 'Google Integration',
                sub_title: 'Connect and sync your Google workspace',
                slug: 'google-integration',
                description: 'The Google Account Integration module allows you to securely connect your Google Workspace with the platform. This connection enables seamless automation such as scheduling events, syncing with Google Calendar, and storing data in Google Sheets. By linking your account, you ensure real-time synchronization of appointments and customer data across your Google services.',
                order: 1,
                sections: [
                    {
                        title: 'Account Authorization',
                        content: `
<p>To start using Google services within the platform, you first need to authorize access to your Google account.</p>

<p>Click the <strong>Connect Google Account</strong> button in the top right corner. Follow the Google OAuth prompt to select your account and grant necessary permissions. Once connected, your account will appear in the management table with an Active status.</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ga1.png',
                                caption: 'google account authorization'
                            }
                        ]
                    },
                    {
                        title: 'Managing Connected Accounts',
                        content: `
<p>View and manage all authorized Google accounts from the central management table.</p>

<ul>
    <li><strong>Email:</strong> The primary email address of the connected Google account.</li>
    <li><strong>Status:</strong> Indicates if the connection is currently Active and functional.</li>
    <li><strong>Created At:</strong> The timestamp of when the account was first linked.</li>
    <li><strong>Actions:</strong> Icons to navigate to Calendar management, Sync data, or Remove the account. In action there are three icons:
        <ul>
            <li>Calendar Manage</li>
            <li>Google Sheet Manage</li>
            <li>Delete google account</li>
        </ul>
    </li>
</ul>
`,
                        images: []
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Manage Google Calendar',
                category: 'Google Integration',
                sub_title: 'Manage and sync your calendars',
                slug: 'google-integration',
                description: 'Easily manage and synchronize your Google Calendars after connecting your account. You can view existing calendars, create new ones, and organize scheduling efficiently. This ensures all your events and appointments stay updated and accessible from a single platform.',
                order: 2,
                sections: [
                    {
                        title: 'Calendar Management',
                        content: `
<p>Manage multiple calendars once your account is connected. You can view existing calendars or create new ones directly from the platform.</p>

<ul>
    <li><strong>Calendar Name:</strong> Title of your Google Calendar.</li>
    <li><strong>Linked Status:</strong> Shows if the calendar is currently synced (Linked / Unlinked).</li>
    <li><strong>Create Calendar:</strong> Use the <strong>Create Calendar</strong> button to add a new calendar to your Google account via a simple naming modal.</li>
    <li><strong>Actions:</strong> Icons to navigate to:
        <ul>
            <li>Event manage</li>
            <li>Linked calendar</li>
            <li>Delete calendar</li>
        </ul>
    </li>
</ul>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/gs1.png',
                                caption: 'calendar management'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/gs2.png',
                                caption: 'calendar management'
                            }
                        ]
                    },
                    {
                        title: 'Linking Calendar',
                        content: `
<p>Linking a calendar enables the platform to read and write events to it for automation purposes.</p>

<p>Click the <strong>Link</strong> icon to synchronize a specific calendar with Wapi. Once linked, appointment bookings will automatically appear in this calendar. You can Unlink or Delete calendars as needed.</p>
`,
                        images: []
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Calendar Event Management',
                category: 'Google Integration',
                sub_title: 'Manage and track calendar events',
                slug: 'google-integration',
                description: 'The Calendar Events dashboard provides a clear overview of all scheduled activities, with multiple view options to help you manage, track, and organize events more effectively.',
                order: 3,
                sections: [
                    {
                        title: 'Calendar Events Dashboard Overview',
                        content: `
        <p>The Calendar Events dashboard serves as a centralized place to view and manage all your scheduled activities.</p>

        <p>It allows you to track upcoming meetings, appointments, and events in real time, ensuring you never miss important schedules.</p>

        <p>You can easily navigate between dates, search for specific events, and refresh the data to stay updated with the latest changes.</p>

        <p>The dashboard is designed to provide both a quick overview and detailed insights into your scheduling data, making it easier to plan and manage workloads efficiently.</p>
      `,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/gs3.png',
                                caption: 'Calendar Events dashboard showing month view with scheduled activities'
                            }
                        ]
                    },
                    {
                        title: 'Calendar Views & Event Management',
                        content: `
        <p>The platform provides multiple visualization modes to help you manage your events more effectively.</p>

        <h4>Available Views</h4>
        <ul>
          <li><strong>List View:</strong> Displays all events in a searchable list format.</li>
          <li><strong>Calendar View:</strong> Shows events in Month, Week, and Day layouts.</li>
        </ul>

        <h4>Month View</h4>
        <p>Gives a high-level overview of events across the entire month, useful for long-term planning.</p>

        <h4>Week View</h4>
        <p>Provides a detailed hourly breakdown of events within a specific week, ideal for managing daily schedules.</p>

        <p>You can switch between views anytime to better organize and track your activities.</p>
      `,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/gs4.png',
                                caption: 'Calendar week view showing detailed hourly event breakdown'
                            }
                        ]
                    },
                    {
                        title: 'Add New Event',
                        content: `
    <p>To create a new event, click on the <strong>"Add New Event"</strong> button located at the top-right corner of the Calendar Events dashboard.</p>

    <p>A form will open where you need to provide the following details:</p>

    <ul>
      <li><strong>Event Title:</strong> Enter a clear name for your event or meeting.</li>
      <li><strong>Start Time:</strong> Select the date and time when the event begins.</li>
      <li><strong>End Time:</strong> Select the date and time when the event ends.</li>
      <li><strong>Description:</strong> Add any additional information or notes related to the event.</li>
    </ul>

    <p>After entering all the required details, click <strong>"Save"</strong> to create the event.</p>

    <p>Once saved, the event will automatically appear in both <strong>List View</strong> and <strong>Calendar View</strong>, allowing you to easily track, manage, and review your schedule.</p>

    <p><strong>Tip:</strong> Make sure the end time is later than the start time to avoid scheduling conflicts.</p>
  `,
                        images: []
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Manage Google Sheets',
                category: 'Google Integration',
                sub_title: 'Store and manage data in sheets',
                slug: 'google-integration',
                description: 'Automatically log and manage customer data, feedback, and automation results in Google Sheets. This integration helps you maintain structured records, generate reports, and analyze data efficiently within your Google Workspace.',
                order: 4,
                sections: [
                    {
                        title: 'Google Sheets Overview',
                        content: `
        <p>The Google Sheets integration allows you to store and manage structured data directly within your connected Google account.</p>

        <p>You can log customer data, feedback, and automation results for reporting and analysis purposes.</p>

        <ul>
          <li><strong>Spreadsheet Name:</strong> The title of your linked Google Sheet.</li>
          <li><strong>Spreadsheet ID:</strong> A unique identifier automatically generated for each sheet.</li>
          <li><strong>Append Data:</strong> Add new rows manually or automatically to store data in selected columns.</li>
        </ul>

        <p>This helps you maintain organized records and easily access them whenever needed.</p>
      `,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/gs5.png',
                            caption: 'Google Sheets integration overview'
                        }]
                    },
                    {
                        title: 'Create and Manage Sheets',
                        content: `
        <p>To create a new sheet, click on the <strong>"Add New Sheet"</strong> button.</p>

        <p>Enter a name for your spreadsheet, and the system will automatically generate a <strong>Spreadsheet ID</strong> for it.</p>

        <p>Once created, you can manage your sheet by clicking on the <strong>write (edit) icon</strong>.</p>

        <p>Inside the editor, you can:</p>

        <ul>
          <li>Add new rows to store data</li>
          <li>Define and organize columns</li>
          <li>Structure your spreadsheet based on your data requirements</li>
        </ul>

        <p>This allows you to build and maintain your spreadsheet directly from the platform without needing to switch to Google Sheets manually.</p>
      `,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/gs6.png',
                                caption: 'Google Sheets integration overview'
                            }
                        ]
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'WhatsApp Website Widget',
                category: 'Tools & Utilities',
                sub_title: 'Add WhatsApp chat widget to your website',
                slug: 'tools-utilities',
                description: 'The WhatsApp Chat Widget allows you to add a clickable chat button to your website, enabling visitors to start conversations instantly. It helps improve customer engagement, boost conversions, and provide real-time support directly through WhatsApp.',
                order: 1,
                sections: [
                    {
                        title: 'Widget Overview',
                        content: `
    <p>The WhatsApp Website Widget allows you to integrate a floating chat button on your website.</p>

    <p>This enables visitors to instantly start a conversation with your business via WhatsApp, improving engagement and customer support.</p>

    <p>You can fully customize the widget appearance and call-to-action to match your brand identity.</p>

    <p>By clicking on the <strong>"Manage"</strong> option, you can view all your created widgets.</p>

    <p>From there, you can:</p>
    <ul>
      <li>Create new widgets</li>
      <li>Edit existing widget configurations</li>
      <li>Delete widgets that are no longer needed</li>
    </ul>

    <p>This helps you efficiently manage multiple widgets across different websites or use cases.</p>
  `,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/10.png',
                                caption: 'WhatsApp Chat Widget setup interface'
                            }
                        ]
                    },
                    {
                        title: 'Setup & Configuration Steps',
                        content: `
    <p>Follow these simple steps to add a WhatsApp chat button to your website using Wapi.</p>

    <ol>
      <li><strong>Configure Widget:</strong> Enter your WhatsApp number, customize colors, and set your welcome message to match your brand.</li>
      <li><strong>Generate Snippet:</strong> Click <strong>"Save Changes"</strong> and then <strong>"Embed Code"</strong> to generate your script.</li>
      <li><strong>Paste & Go Live:</strong> Copy the script and paste it before the closing <code>&lt;/body&gt;</code> tag of your website.</li>
    </ol>

    <h4>Pro Tips for Customization</h4>
    <ul>
      <li><strong>CTA:</strong> Use engaging text like "Chat with Us" or "Expert Support".</li>
      <li><strong>Branding:</strong> Upload your logo to build trust.</li>
      <li><strong>Positioning:</strong> Place the widget where it doesn’t block important UI elements.</li>
      <li><strong>Pre-filled Message:</strong> Help users start conversations instantly.</li>
    </ul>

    <h4>Benefits</h4>
    <ul>
      <li><strong>Higher Conversion:</strong> Achieve better click-through rates than traditional forms.</li>
      <li><strong>Personalization:</strong> Real-time, human-like communication experience.</li>
      <li><strong>Better Growth:</strong> Faster engagement compared to email or SMS.</li>
      <li><strong>Instant Leads:</strong> Capture user details with consent.</li>
    </ul>
  `,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/11.png',
                            caption: 'WhatsApp Chat Widget setup interface'
                        }]
                    },
                    {
                        title: 'Manage Widgets',
                        content: `
    <p>By clicking on the <strong>"Manage"</strong> button, you can view all your created WhatsApp Website Widgets.</p>

    <p>From this section, you can:</p>

    <ul>
      <li>Create new widgets</li>
      <li>Edit existing widget configurations</li>
      <li>Delete widgets that are no longer needed</li>
    </ul>

    <p>This allows you to manage multiple widgets efficiently across different websites or campaigns.</p>
  `,
                        images: []
                    },
                    {
                        title: 'Step 1: Appearance Settings',
                        content: `
    <p>In this step, configure the widget button appearance and position.</p>

    <ul>
      <li><strong>Phone Number:</strong> Enter your WhatsApp number (e.g. 9876543210).</li>
      <li><strong>Widget Position:</strong> Choose where the widget appears:
        <ul>
          <li>Bottom Right</li>
          <li>Bottom Left</li>
        </ul>
      </li>
      <li><strong>Button Color:</strong> Set the widget button color (e.g. <code>var(--primary)</code>).</li>
      <li><strong>Logo/Image:</strong> Upload your brand logo (PNG, JPG, SVG — max 2MB, recommended 80x80px).</li>
    </ul>

    <p>This step defines how your widget looks and where it appears on your website.</p>
  `,
                        images: []
                    },
                    {
                        title: 'Step 2: Header Configuration',
                        content: `
    <p>Customize the chat window header to match your brand identity.</p>

    <ul>
      <li><strong>Header Title:</strong> Example: "Chat with us"</li>
      <li><strong>Header Background:</strong> Set color (e.g. <code>var(--primary)</code>)</li>
      <li><strong>Header Text Color:</strong> Set text color (e.g. <code>var(--white)</code>)</li>
    </ul>

    <p>This section controls the top portion of your chat widget interface.</p>
  `,
                        images: []
                    },
                    {
                        title: 'Step 3: Body & Welcome Message',
                        content: `
    <p>Define the message and appearance of the chat body.</p>

    <ul>
      <li><strong>Welcome Message:</strong> Example:
        <br>Welcome to our support! Thank you for reaching out to us on WhatsApp.</li>
      <li><strong>Message Bubble Color:</strong> (e.g. <code>var(--white)</code>)</li>
      <li><strong>Message Text Color:</strong> (e.g. <code>var(--dark-gray)</code>)</li>
      <li><strong>Background Style:</strong> Choose color or image (e.g. <code>var(--whatsapp-light-bg)</code>)</li>
      <li><strong>Auto-Open on Load:</strong> Enable to automatically show chat popup on page load</li>
    </ul>

    <p>This step helps you personalize the chat experience for users.</p>
  `,
                        images: []
                    },
                    {
                        title: 'Step 4: Action Button Setup',
                        content: `
    <p>Configure the final call-to-action button for user interaction.</p>

    <ul>
      <li><strong>Button Label:</strong> Example: "Start Chat on WhatsApp"</li>
      <li><strong>Button Background:</strong> (e.g. <code>var(--primary)</code>)</li>
      <li><strong>Button Text Color:</strong> (e.g. <code>var(--white)</code>)</li>
      <li><strong>Pre-filled Message:</strong> Example: "Hi, I need help!!"</li>
    </ul>

    <p>The pre-filled message will automatically appear in the user’s WhatsApp when they click the button, making it easier to start a conversation.</p>
  `,
                        images: []
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'WhatsApp Link Generator',
                category: 'Tools & Utilities',
                sub_title: 'Create shareable WhatsApp chat links',
                slug: 'tools-utilities',
                description: 'The WhatsApp Link Generator helps you create direct chat links and QR codes for your WhatsApp number. These links can be shared across websites, ads, or social media to let users start conversations instantly.',
                order: 2,
                sections: [
                    {
                        title: 'Link Generator Overview',
                        content: `
    <p>The WhatsApp Link Generator allows you to create direct chat links for your business number.</p>

    <p>These links can be shared across websites, marketing campaigns, or social platforms to drive instant conversations.</p>

    <p>You can also generate QR codes for offline sharing.</p>

    <p>By clicking on the <strong>"Manage"</strong> option, you can view and manage all your created links.</p>

    <p>From there, you can:</p>
    <ul>
      <li>Create new WhatsApp chat links</li>
      <li>Edit existing links and messages</li>
      <li>Delete links that are no longer required</li>
    </ul>

    <p>This helps you organize and reuse links efficiently across different campaigns.</p>
  `,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/10.png',
                                caption: 'WhatsApp Chat Widget setup interface'
                            }
                        ]
                    },
                    {
                        title: 'Simple Steps to Generate WhatsApp Link',
                        content: `
    <p>Follow these simple steps to create and share your WhatsApp chat link:</p>

    <ol>
      <li>
        <strong>Configure WhatsApp Number:</strong><br>
        Select your country to apply the correct dial code automatically. Enter your active WhatsApp number without leading zeros or special characters.
      </li>

      <li>
        <strong>Add Custom Welcome Message:</strong><br>
        Write a personalized message that will be pre-filled in the user's chat input when they open WhatsApp.
      </li>

      <li>
        <strong>Generate & Deploy Link:</strong><br>
        Click on generate to create your short link and QR code. You can copy the link or download the QR code to use in campaigns.
      </li>
    </ol>

    <h4>Pro Tips for Success</h4>
    <ul>
      <li>Ensure your phone number format is correct to avoid errors</li>
      <li>Use strong CTAs like "Chat with Us" or "Get Support"</li>
      <li>Add your link to social media bios to increase engagement</li>
    </ul>

    <h4>Marketing Tip</h4>
    <p>Add your WhatsApp QR code to banners, business cards, and packaging to connect offline users directly to WhatsApp.</p>
  `,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/12.png',
                                caption: 'WhatsApp Chat Widget setup interface'
                            }
                        ]
                    },
                    {
                        title: 'Create WhatsApp Link',
                        content: `
    <p>Create a direct chat link with a pre-filled message to simplify customer communication.</p>

    <h4>WhatsApp Number</h4>
    <p>Select your country code (e.g. <strong>+91</strong>) and enter your phone number.</p>
    <p><em>Example:</em> 9876543210</p>
    <p><strong>Preview:</strong> +91 XXXXXXXXXX</p>

    <h4>Welcome Message</h4>
    <p>Enter a message that will automatically appear in the user's WhatsApp chat.</p>
    <p><em>Example:</em> Hi! I'm interested in your services...</p>

    <p>This message helps users start conversations quickly without typing.</p>

    <h4>Generate Link</h4>
    <p>Click on <strong>"Generate Link"</strong> to create your WhatsApp chat link instantly.</p>

    <p>Once generated, you can copy and use the link anywhere to start receiving messages.</p>
  `,
                        images: []
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Badges Management',
                category: 'Asset Management',
                sub_title: 'Organize and segment contacts using tags',
                slug: 'asset-management',
                description: 'The Tags (Badges) feature helps you organize and segment your contacts efficiently by assigning labels based on behavior, interest, or lifecycle stage. This improves communication, targeting, and overall customer management.',
                order: 1,
                sections: [
                    {
                        title: 'Overview & Benefits',
                        content: `
<p>The Tags feature is a powerful tool designed to help you organize and segment your contacts efficiently.</p>

<p>By assigning descriptive labels to your customers, you can categorize them based on their behavior, interests, or lifecycle stage.</p>

<ul>
  <li><strong>Contact Categorization:</strong> Group contacts into categories like "Leads", "VIPs", or "Recent Buyers".</li>
  <li><strong>Easy Segmentation:</strong> Create targeted campaigns using specific tag combinations.</li>
  <li><strong>Better Management:</strong> Quickly identify contact needs and improve team workflow.</li>
</ul>

<p>This results in more personalized communication and higher engagement rates.</p>
`,
                        images: []
                    },
                    {
                        title: 'Tags Dashboard & Management',
                        content: `
<p>The Tags Dashboard is the central hub for managing all your tags in one place.</p>

<ul>
  <li><strong>Tag List:</strong> View all created tags along with assigned contact counts.</li>
  <li><strong>Creation Tool:</strong> Quickly create new tags as your business grows.</li>
  <li><strong>Edit & Delete:</strong> Update tag names or remove unused ones.</li>
  <li><strong>Search & Filter:</strong> Easily find tags within large datasets.</li>
</ul>

<p>This centralized system ensures your contact database remains clean, organized, and easy to manage.</p>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/13.png',
                                caption: 'Tags management dashboard'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/14.png',
                                caption: 'Tags management dashboard'
                            }
                        ]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Media Library',
                category: 'Asset Management',
                sub_title: 'Store and manage your media assets',
                slug: 'asset-management',
                description: 'The Media Library acts as a centralized storage system for all your business media, including images, videos, and documents. It enables quick access, efficient reuse, and faster communication with customers.',
                order: 2,
                sections: [
                    {
                        title: 'Overview & Benefits',
                        content: `
<p>The Media Library is your centralized digital vault for WhatsApp communication.</p>

<p>It allows you to upload, store, and organize images, videos, and documents for quick access.</p>

<ul>
  <li><strong>Asset Reuse:</strong> Reuse promotional content and documents across multiple chats.</li>
  <li><strong>Instant Response:</strong> Access frequently used media directly while chatting.</li>
  <li><strong>Organized Storage:</strong> Maintain a structured repository of all business assets.</li>
</ul>

<p>This helps your team respond faster and maintain a professional communication flow.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/media.png',
                            caption: 'Media library overview'
                        }]
                    },
                    {
                        title: 'Access & Upload Workflow',
                        content: `
<p>Follow these steps to upload and manage your media files:</p>

<ol>
  <li><strong>Sidebar Navigation:</strong> Go to the <strong>Media</strong> section from the main sidebar.</li>
  <li><strong>Initiate Upload:</strong> Click on <strong>"+ Add New"</strong> or <strong>"Upload Media"</strong>.</li>
  <li><strong>Drag & Drop:</strong> Select files from your device (supported formats: JPG, PNG, MP4, PDF).</li>
  <li><strong>Finalize:</strong> Once uploaded, files are instantly available for all agents.</li>
</ol>

<p>This workflow ensures quick and easy media management across your team.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/15.png',
                            caption: 'Media library overview'
                        }]
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Teams Management',
                category: 'Access Management',
                sub_title: 'Manage your team and their permissions',
                slug: 'access-management',
                description: 'The Teams Management module enables role-based access control (RBAC) by allowing you to create teams with predefined permissions. These teams act as permission blueprints that can be assigned to agents for consistent and secure access control across the platform.',
                order: 1,
                sections: [
                    {
                        title: 'Overview & Benefits',
                        content: `
<p>The Teams Management feature provides a structured way to control access across your platform using Role-Based Access Control (RBAC).</p>

<ul>
  <li><strong>Access Control:</strong> Limit module visibility based on team responsibilities.</li>
  <li><strong>Team Segmentation:</strong> Organize agents into groups like Sales, Support, or Marketing.</li>
  <li><strong>Blueprint Utility:</strong> Teams act as reusable permission templates for agents.</li>
</ul>

<p>This ensures consistent access control and improves operational efficiency.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/16.png',
                            caption: 'Teams management overview'
                        }]
                    },
                    {
                        title: 'Create & Configure Teams',
                        content: `
<p>Follow these steps to create and configure a team:</p>

<ol>
  <li><strong>Navigate:</strong> Go to the Teams module from the sidebar.</li>
  <li><strong>Create:</strong> Click <strong>"+ Create New Team"</strong>.</li>
  <li><strong>Define:</strong> Enter team name and set status to Active.</li>
  <li><strong>Assign Permissions:</strong> Configure access for modules like:
    <ul>
      <li>Chat & Inbox</li>
      <li>Automation & Flows</li>
      <li>Media & Tools</li>
      <li>AI Models</li>
    </ul>
  </li>
  <li><strong>Save:</strong> Click Create Team.</li>
</ol>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/17.png',
                            caption: 'Create & configure teams'
                        }]
                    },
                    {
                        title: 'Manage Teams',
                        content: `
<ul>
  <li><strong>Edit Team:</strong> Update name or permissions anytime</li>
  <li><strong>Delete Team:</strong> Remove unused teams</li>
  <li><strong>Deactivate:</strong> Restrict access without deleting</li>
</ul>

<p>This helps maintain a clean and flexible permission structure.</p>
`
                    },
                    {
                        title: 'Assign Teams to Agents',
                        content: `
<p>Teams can be assigned to agents during creation.</p>

<p>Once assigned, agents automatically inherit all permissions defined in that team.</p>

<p>This ensures consistency and eliminates the need to configure permissions individually.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Agent Management',
                category: 'Access Management',
                sub_title: 'Manage agents, permissions, and tasks',
                slug: 'access-management',
                description: 'The Agent Management system allows you to onboard team members, assign them to teams, and control their access and visibility. It also includes task management features to track performance and coordinate workflows efficiently.',
                order: 2,
                sections: [
                    {
                        title: 'Overview & Capabilities',
                        content: `
<p>Agents are the frontline of your WhatsApp communication system.</p>

<ul>
  <li><strong>Profile Control:</strong> Manage agent identity and details</li>
  <li><strong>Team Linking:</strong> Assign teams to inherit permissions</li>
  <li><strong>Privacy Logic:</strong> Restrict access using features like "Hide Phone"</li>
</ul>

<p>This ensures secure and structured communication handling.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/18.png',
                            caption: 'Agent management overview'
                        }]
                    },
                    {
                        title: 'Agent Onboarding Workflow',
                        content: `
<p>Follow these steps to create a new agent:</p>

<ol>
  <li><strong>Navigate:</strong> Go to Agents module</li>
  <li><strong>Create:</strong> Click <strong>"+ Create Agent"</strong></li>
  <li><strong>Profile:</strong> Enter name, email, and phone number</li>
  <li><strong>Assign Team:</strong> Select a team to define permissions</li>
  <li><strong>Security:</strong> Enable "Hide Phone" if required</li>
  <li><strong>Activate:</strong> Set status and save</li>
</ol>

<p><strong>Note:</strong> Every agent must be linked to a team.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/19.png',
                            caption: 'Agent management overview'
                        }]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Agent Task Management',
                category: 'Access Management',
                sub_title: 'Assign, track, and manage agent tasks',
                slug: 'access-management',
                description: 'Agent Task Management allows you to assign tasks to agents, track their progress, and manage workflows efficiently. This module improves team productivity and ensures better coordination across support and sales operations.',
                order: 3,
                sections: [
                    {
                        title: 'Overview & Purpose',
                        content: `
<p>The Agent Task Management module helps you organize and monitor tasks assigned to your agents.</p>

<p>It ensures that responsibilities are clearly defined and progress is tracked in real time.</p>

<ul>
  <li><strong>Task Assignment:</strong> Assign tasks directly to specific agents</li>
  <li><strong>Progress Tracking:</strong> Monitor status updates and completion</li>
  <li><strong>Collaboration:</strong> Enable communication within tasks</li>
  <li><strong>Priority Handling:</strong> Manage urgency using priority levels</li>
</ul>

<p>This improves operational efficiency and keeps your team aligned.</p>
`
                    },
                    {
                        title: 'Navigation Flow',
                        content: `
<p>Follow these steps to access the task dashboard:</p>

<ol>
  <li><strong>Open Agents Module:</strong> Navigate to the Agents section</li>
  <li><strong>Select Agent:</strong> Locate the desired agent from the list</li>
  <li><strong>Open Tasks:</strong> Click on the <strong>Task (Clipboard) icon</strong></li>
</ol>

<p>This will redirect you to the selected agent’s task dashboard.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/49.png',
                            caption: 'Agent task management overview'
                        }]
                    },
                    {
                        title: 'Task Dashboard Structure',
                        content: `
<p>The task dashboard is divided into two main sections:</p>

<ul>
  <li><strong>Left Panel:</strong>
    <ul>
      <li>Task list</li>
      <li>Search bar</li>
      <li>Priority filters (All, Low, Medium, High)</li>
    </ul>
  </li>

  <li><strong>Right Panel:</strong>
    <ul>
      <li>Task details view</li>
      <li>Interactive collaboration interface</li>
    </ul>
  </li>
</ul>

<p>This layout helps you manage tasks efficiently with quick access and clarity.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/47.png',
                            caption: 'Agent task management overview'
                        }]
                    },
                    {
                        title: 'Create New Task',
                        content: `
<p>You can create tasks quickly using the "+" button available in the dashboard.</p>

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
  <thead>
    <tr>
      <th align="left">Field</th>
      <th align="left">Description</th>
      <th align="left">Required</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Task Title</strong></td>
      <td>A short and clear task name</td>
      <td>Yes</td>
    </tr>
    <tr>
      <td><strong>Description</strong></td>
      <td>Detailed instructions or notes</td>
      <td>Yes</td>
    </tr>
    <tr>
      <td><strong>Priority</strong></td>
      <td>Low / Medium / High</td>
      <td>Yes</td>
    </tr>
    <tr>
      <td><strong>Status</strong></td>
      <td>Initial task state (e.g. Pending)</td>
      <td>Yes</td>
    </tr>
    <tr>
      <td><strong>Due Date</strong></td>
      <td>Optional deadline</td>
      <td>No</td>
    </tr>
  </tbody>
</table>

<p>Once created, tasks will appear instantly in the agent's task dashboard.</p>
`, images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/48.png',
                            caption: 'Agent task management overview'
                        }]
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Automation Builder',
                category: 'Automation',
                sub_title: 'Create automated WhatsApp flows with visual builder',
                slug: 'automation',
                description: 'Automation Flows allow you to design powerful, logic-based customer journeys using a visual drag-and-drop builder. These flows help automate repetitive interactions, improve response time, and enhance customer engagement.',
                order: 1,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Automation Flows are the core of your WhatsApp automation strategy. Using a visual builder, you can create intelligent workflows that respond instantly to user actions.</p>

<p><strong>Efficiency Fact:</strong> Automated flows can handle up to 90% of routine customer inquiries, reducing manual workload and improving response speed.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/20.png',
                            caption: 'Automation builder overview'
                        }
                        ]
                    },
                    {
                        title: 'Automation Builder Interface',
                        content: `
<p>The builder provides a drag-and-drop interface to design conversation flows.</p>

<ul>
  <li><strong>Canvas:</strong> Main workspace to arrange and connect nodes</li>
  <li><strong>Trigger Nodes:</strong> Start flow using Keyword, Event, or API</li>
  <li><strong>Action Nodes:</strong> Send messages, media, or buttons</li>
  <li><strong>Logic Nodes:</strong> Add conditions (If/Else) or delays</li>
</ul>

<p>This structure allows you to create dynamic and flexible conversation paths.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/21.png',
                            caption: 'Automation builder overview'
                        }]
                    },
                    {
                        title: 'Implementation Workflow',
                        content: `
<p>Follow these steps to create and activate a flow:</p>

<ol>
  <li><strong>Initiate Flow:</strong> Go to Automation Flows → Click "+ Create New Flow"</li>
  <li><strong>Build Logic:</strong> Add a Keyword Trigger (e.g., "Hello", "Help") and connect it to a Message node</li>
  <li><strong>Save & Activate:</strong> Validate connections → Click Save → Set status to Active</li>
</ol>
`
                    },
                    {
                        title: 'Example Use Case',
                        content: `
<p><strong>Post-Purchase Engagement Flow:</strong></p>

<ul>
  <li><strong>Trigger:</strong> Order status changes to "Delivered"</li>
  <li><strong>Action:</strong> Send feedback message with buttons</li>
  <li><strong>Logic:</strong>
    <ul>
      <li>If Positive → Send coupon</li>
      <li>If Negative → Notify agent</li>
    </ul>
  </li>
</ul>

<p>This helps automate customer follow-ups and improve satisfaction.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Predefined Actions',
                category: 'Automation',
                sub_title: 'Automate common responses and system behaviors',
                slug: 'automation',
                description: 'Predefined Actions provide automatic responses for common scenarios like welcome messages, offline replies, and unassigned chats. These always-on automations ensure consistent communication even when agents are unavailable.',
                order: 2,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Predefined Actions are the foundation of automated communication in your WhatsApp system.</p>

<p>They ensure that customers always receive timely and professional responses, even when agents are offline.</p>

<p><strong>Always-On Communication:</strong> These actions act as a fallback layer to maintain engagement at all times.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/22.png',
                            caption: 'Predefined actions overview'
                        }]
                    },
                    {
                        title: 'Available Actions',
                        content: `
<ul>
  <li><strong>Out of Working Hours:</strong> Auto-reply when messages arrive outside business hours</li>
  <li><strong>Welcome Message:</strong> First message for new users</li>
  <li><strong>Delayed Reply:</strong> Triggered if agent response is delayed</li>
  <li><strong>Fallback Message:</strong> Sent when no flow or keyword matches</li>
  <li><strong>Re-engagement Message:</strong> Revives inactive chats</li>
  <li><strong>Round Robin:</strong> Distributes chats evenly among agents</li>
</ul>
`
                    },
                    {
                        title: 'Configuration Workflow',
                        content: `
<p>Follow these steps to configure predefined actions:</p>

<ol>
  <li><strong>Set Working Hours:</strong> Define business days and time slots</li>
  <li><strong>Enable Action:</strong> Toggle required automation (e.g., Welcome Message)</li>
  <li><strong>Customize Content:</strong> Edit messages and timing (e.g., delay duration)</li>
</ol>

<p>This ensures all automated responses align with your business logic and tone.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Quick Replies',
                category: 'Automation',
                sub_title: 'Create and use predefined responses for faster replies',
                slug: 'automation',
                description: 'Quick Replies allow you to create reusable message templates for common customer interactions. This helps agents respond instantly, maintain consistency, and improve overall communication efficiency.',
                order: 3,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>The Quick Replies module helps you respond to customers quickly using pre-written messages.</p>

<p>Instead of typing repetitive responses, agents can select from saved replies to maintain speed and consistency.</p>

<ul>
  <li><strong>Faster Responses:</strong> Reduce typing time for common queries</li>
  <li><strong>Consistency:</strong> Ensure uniform communication across all agents</li>
  <li><strong>Easy Access:</strong> Search, categorize, and mark replies as favorites</li>
</ul>

<p>This feature is especially useful for support teams handling high volumes of similar queries.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/qr1.png',
                            caption: 'Quick replies overview'
                        }]
                    },
                    {
                        title: 'Create Quick Reply',
                        content: `
<p>Follow these steps to create a new quick reply:</p>

<ol>
  <li><strong>Navigate:</strong> Go to Quick Replies module</li>
  <li><strong>Add New:</strong> Click <strong>"+ Add Quick Reply"</strong></li>
  <li><strong>Enter Content:</strong> Add your response message (required)</li>
  <li><strong>Save:</strong> Store the reply for future use</li>
</ol>

<p><strong>Content Field:</strong> This is where you define the exact message that will be sent. You can include links, instructions, or standard greetings.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/qr2.png',
                            caption: 'Quick replies overview'
                        }]
                    },
                    {
                        title: 'Manage Quick Replies',
                        content: `
<p>You can easily manage all your saved replies from the dashboard.</p>

<ul>
  <li><strong>Search:</strong> Quickly find replies using keywords</li>
  <li><strong>Favorite:</strong> Mark important replies for quick access</li>
  <li><strong>Edit:</strong> Update message content anytime</li>
  <li><strong>Delete:</strong> Remove unused replies</li>
</ul>

<p>This ensures your response library stays organized and relevant.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'AI Call Assistant',
                category: 'Automation',
                sub_title: 'Automate voice calls with AI-powered assistants',
                slug: 'automation',
                description: 'The AI Call Assistant enables businesses to handle incoming and outgoing calls using intelligent voice automation. It combines speech recognition, AI reasoning, and natural voice responses to deliver human-like conversations and automate support workflows 24/7.',
                order: 4,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>The AI Call Assistant brings advanced voice automation to your business by enabling AI agents to handle phone calls independently.</p>

<p>Unlike traditional IVR systems that rely on rigid menus, this assistant understands natural speech, responds intelligently, and adapts to user intent in real time.</p>

<ul>
  <li><strong>Natural Conversations:</strong> Engage users with human-like voice interactions</li>
  <li><strong>24/7 Availability:</strong> Handle calls anytime without manual intervention</li>
  <li><strong>Smart Processing:</strong> Understand queries and generate contextual responses</li>
  <li><strong>API Integration:</strong> Fetch real-time data such as bookings or order status</li>
</ul>

<p>This makes it ideal for automating customer support, bookings, and inquiry handling at scale.</p>
<p>Setting up the AI Call Assistant involves a structured multi-step configuration process. Each step ensures the assistant performs accurately and reliably.</p>
`
                    },
                    {
                        title: 'Step 1: Basic Setup',
                        content: `
<ul>
  <li><strong>Assistant Name:</strong> Internal name for identification</li>
  <li><strong>Welcome Greeting:</strong> First message played when a call starts</li>
  <li><strong>Status Toggle:</strong> Enable or disable the assistant</li>
</ul>

<p><strong>Tip:</strong> Use a short and friendly greeting like "Hello, I’m your AI assistant. How can I assist you today?"</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/28.png',
                            caption: 'AI Call Assistant overview'
                        }]
                    },
                    {
                        title: 'Step 2: AI Configuration',
                        content: `
<ul>
  <li><strong>Model Selection:</strong> Choose the AI engine for processing conversations</li>
  <li><strong>Instructions:</strong> Define behavior, tone, and response rules</li>
  <li><strong>Knowledge Source:</strong> Link external data or documentation</li>
</ul>

<p>This step defines how your assistant thinks and responds.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/29.png',
                            caption: 'AI Call Assistant overview'
                        }]
                    },
                    {
                        title: 'Step 3: Actions & Integrations',
                        content: `
<p>This layer allows the assistant to perform real-world operations.</p>

<ul>
  <li>Connect APIs using function tools</li>
  <li>Define structured actions using JSON</li>
  <li>Enable tasks like booking, tracking, or data retrieval</li>
</ul>

<p>This transforms the assistant from a responder into an action-driven system.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/30.png',
                            caption: 'AI Call Assistant overview'
                        }]
                    },
                    {
                        title: 'Step 4: Voice & Recognition',
                        content: `
<ul>
  <li><strong>Voice Provider:</strong> Select a voice engine (e.g., premium voice services)</li>
  <li><strong>Voice Style:</strong> Customize tone and clarity</li>
  <li><strong>Speech Recognition:</strong> Enable accurate voice-to-text processing</li>
</ul>

<p>This ensures clear communication and accurate understanding of callers.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/31.png',
                            caption: 'AI Call Assistant overview'
                        }]
                    },
                    {
                        title: 'Step 5: Call Connectivity',
                        content: `
<p>This final step connects your assistant to the calling system.</p>

<ul>
  <li>Enable call recording</li>
  <li>Activate transcription for logs</li>
  <li>Define call ending behavior</li>
  <li>Set exit keywords (e.g., "bye")</li>
  <li>Customize closing message</li>
</ul>

<p>Once configured, your AI Call Assistant is ready to handle real customer calls automatically.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/32.png',
                            caption: 'AI Call Assistant overview'
                        }]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'WhatsApp Form',
                category: 'Automation',
                sub_title: 'Create interactive forms and collect data within WhatsApp',
                slug: 'automation',
                description: 'WhatsApp Forms allow you to build interactive, no-code forms that run directly inside WhatsApp chats. These forms help capture structured data such as leads, feedback, and appointment details with a seamless user experience and higher response rates.',
                order: 5,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>The WhatsApp Form module enables you to design and deploy interactive forms directly within chat conversations.</p>

<p>Instead of redirecting users to external pages, forms are presented inside WhatsApp, making the experience faster and more engaging.</p>

<ul>
  <li><strong>Seamless Experience:</strong> Users can complete forms without leaving chat</li>
  <li><strong>Higher Conversion:</strong> Reduced friction leads to better response rates</li>
  <li><strong>Structured Data:</strong> Capture organized inputs like leads, feedback, and bookings</li>
</ul>

<p><strong>Meta Flows:</strong> These forms are powered by Meta Flows, enabling dynamic and interactive data collection directly within WhatsApp.</p>
`
                    },
                    {
                        title: 'Step 1: Basic Setup',
                        content: `
<ul>
  <li><strong>Form Name:</strong> Internal identifier for the form (e.g., "Lead Capture Form")</li>
  <li><strong>Description:</strong> Short explanation of the form’s purpose</li>
  <li><strong>Category:</strong> Select a Meta-supported category</li>
  <li><strong>Submission Settings:</strong> Define what happens after submission</li>
</ul>

<p>This step establishes the identity and behavior of your form.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/af1.png',
                            caption: 'WhatsApp Form overview'
                        }]
                    },
                    {
                        title: 'Step 2: Form Designer',
                        content: `
<p>The visual builder allows you to design your form using drag-and-drop components.</p>

<h4>Available Components</h4>
<ul>
  <li><strong>Basic:</strong> Heading, Text Input, Text Area, Number</li>
  <li><strong>Contact:</strong> Email, Phone</li>
  <li><strong>Selection:</strong> Dropdown, Single Choice, Checkbox</li>
  <li><strong>Date & Time:</strong> Date Picker</li>
</ul>

<h4>Field Configuration</h4>
<ul>
  <li><strong>Display Label:</strong> Visible field name for users</li>
  <li><strong>Field Name:</strong> Unique key used in APIs</li>
  <li><strong>Placeholder:</strong> Input hint text</li>
  <li><strong>Required:</strong> Make field mandatory</li>
</ul>

<p>This builder helps you create flexible and user-friendly forms.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/af2.png',
                            caption: 'WhatsApp Form overview'
                        }]
                    },
                    {
                        title: 'Response Resources',
                        content: `
<p>Response Resources allow you to package your form into a message that can be shared with users.</p>

<ol>
  <li>Navigate to Response Resources</li>
  <li>Select <strong>Form Flow</strong> type</li>
  <li>Click <strong>Add Form Flow</strong></li>
  <li>Enter resource name and message</li>
  <li>Customize button text (e.g., "Start Inquiry")</li>
  <li>Select your published form</li>
</ol>

<p><strong>Note:</strong> Only published forms will be available for selection.</p>
`
                    },
                    {
                        title: 'Keyword Automation',
                        content: `
<p>You can automate form delivery by linking it to keywords.</p>

<ol>
  <li>Go to Keyword Trigger</li>
  <li>Click <strong>Add New Keyword Action</strong></li>
  <li>Define trigger keywords (e.g., "Apply", "Form")</li>
  <li>Select matching type (Exact, Contains, Starts With)</li>
  <li>Choose <strong>Form Flow</strong> as reply type</li>
</ol>

<p>When a user sends a matching keyword, the system automatically responds with your form.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Appointment Booking',
                category: 'Automation',
                sub_title: 'Automate scheduling and manage bookings efficiently',
                slug: 'automation',
                description: 'The Appointment Booking module helps you create and manage scheduling services directly within WhatsApp. It allows customers to book time slots, automates reminders, handles payments, and integrates with tools like Google Calendar for seamless appointment management.',
                order: 6,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>The Appointment Booking module simplifies how businesses handle scheduling by offering a fully automated booking system.</p>

<p>Customers can book appointments through WhatsApp or a booking link, while the platform manages availability, reminders, and updates.</p>

<ul>
  <li><strong>Automated Scheduling:</strong> Reduce manual coordination</li>
  <li><strong>Smart Reminders:</strong> Minimize no-shows</li>
  <li><strong>Team Availability:</strong> Manage slots across services</li>
  <li><strong>Integrated Workflow:</strong> Sync with calendars and payments</li>
</ul>
`
                    },
                    {
                        title: 'Create Booking Configuration',
                        content: `
<p>To create a new booking service, navigate to <strong>Automation → Appointment Booking</strong> and click <strong>Add Configuration</strong>.</p>

<p>This opens a multi-step setup process where you define your booking rules, availability, and integrations.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ab1.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Step 1: General Information',
                        content: `
<ul>
  <li><strong>Configuration Name:</strong> Name of your service</li>
  <li><strong>Location:</strong> Online or physical address</li>
  <li><strong>Description:</strong> Brief service details</li>
  <li><strong>Timezone:</strong> Ensures accurate scheduling</li>
  <li><strong>Duration:</strong> Length of each appointment</li>
  <li><strong>Max Daily Appointments:</strong> Limit bookings per day</li>
  <li><strong>Break Time:</strong> Buffer between slots</li>
  <li><strong>Advance Booking Limit:</strong> Control future bookings</li>
  <li><strong>Allow Overlap:</strong> Enable multiple bookings per slot</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/a1.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Step 2: Notification Templates',
                        content: `
<p>Configure automated WhatsApp messages for each stage of the booking lifecycle.</p>

<ul>
  <li><strong>Success Message:</strong> Sent after booking</li>
  <li><strong>Confirmation:</strong> Confirms appointment details</li>
  <li><strong>Reminder:</strong> Notifies before appointment time</li>
  <li><strong>Cancellation:</strong> Sent when appointment is canceled</li>
  <li><strong>Reschedule:</strong> Sent when timing is updated</li>
</ul>

<p>You can enable or disable automated communication as needed.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/a2.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Step 3: Payment & Financial Setup',
                        content: `
<ul>
  <li><strong>Booking Fee:</strong> Base service cost</li>
  <li><strong>Tax:</strong> Apply percentage-based tax</li>
  <li><strong>Total Amount:</strong> Final payable amount</li>
  <li><strong>Currency:</strong> Select transaction currency</li>
  <li><strong>Payment Gateway:</strong> Choose provider</li>
  <li><strong>Partial Payment:</strong> Allow deposit-based booking</li>
  <li><strong>Auto Payment Link:</strong> Send link after booking</li>
</ul>

<p>This ensures smooth payment collection and tracking.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/a3.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Step 4: Integrations',
                        content: `
<p>Connect your booking system with Google services for automation and data synchronization.</p>

<ul>
  <li><strong>Google Meet:</strong> Automatically generate meeting links for each booking</li>
  <li><strong>Google Account:</strong> Select your connected Google account</li>
  <li><strong>Calendar ID:</strong> Sync appointments with a specific Google Calendar</li>
  <li><strong>Spreadsheet ID:</strong> Store booking data in Google Sheets</li>
</ul>

<p><strong>Note:</strong> Selecting a Google Account is optional. However, once a Google Account is selected, both <strong>Calendar ID</strong> and <strong>Spreadsheet ID</strong> become mandatory to enable proper synchronization.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/a4.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Step 5: Availability Setup',
                        content: `
<p>Define when your service is available for booking.</p>

<ul>
  <li><strong>Working Days:</strong> Select active days</li>
  <li><strong>Time Slots:</strong> Set daily availability</li>
  <li><strong>Multiple Intervals:</strong> Add different shifts</li>
</ul>

<p>All time slots follow the timezone defined earlier.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/a5.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Step 6: Questionnaire',
                        content: `
<p>Collect additional details from customers during booking.</p>

<ul>
  <li><strong>Intro Message:</strong> Welcome message for booking flow</li>
  <li><strong>Custom Questions:</strong> Add fields like text, number, or selection</li>
</ul>

<p>This helps gather important customer information before confirmation.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/a6.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Booking Records Management',
                        content: `
<p>All appointments are stored in a centralized dashboard for easy tracking.</p>

<ul>
  <li><strong>Customer Name:</strong> Booking user details</li>
  <li><strong>Date & Time:</strong> Scheduled slot</li>
  <li><strong>Status:</strong> Booked, Confirmed, Rescheduled, or Canceled</li>
  <li><strong>Payment Status:</strong> Paid or Unpaid</li>
</ul>

<p>You can also update bookings, send payment links, or delete records.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ab2.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Booking Details & Status Management',
                        content: `
<p>Each booking includes detailed information for better management.</p>

<ul>
  <li><strong>Appointment Info:</strong> Time, date, and meeting links</li>
  <li><strong>Customer Details:</strong> Contact information</li>
  <li><strong>Responses:</strong> Answers from questionnaire</li>
  <li><strong>Financial Summary:</strong> Payment breakdown</li>
</ul>

<p>You can update status (Pending, Confirmed, Rescheduled, Canceled) and trigger automated notifications.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ab3.png',
                            caption: 'Appointment Booking overview'
                        },
                        {
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ab4.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Payment Link Handling',
                        content: `
<p>For unpaid bookings, you can manually send payment links.</p>

<ul>
  <li>Select your payment gateway</li>
  <li>Send secure payment link via WhatsApp</li>
  <li>Track payment status automatically</li>
</ul>

<p>Once payment is completed, the system updates records instantly.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/ab5.png',
                            caption: 'Appointment Booking overview'
                        }]
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Response Resources',
                category: 'Automation Resources',
                sub_title: 'Create and manage reusable communication assets',
                slug: 'automation-resources',
                description: 'Response Resources act as a centralized content library for managing reusable WhatsApp communication assets. From simple text replies to advanced automation flows, this module helps teams respond faster, maintain consistency, and power both manual and automated interactions.',
                order: 1,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Response Resources provide a centralized system to create, store, and manage reusable communication content.</p>

<p>These resources can be used manually by agents during live chats or automatically triggered via automation flows and keyword-based actions.</p>

<ul>
  <li><strong>Consistency:</strong> Maintain uniform messaging across teams</li>
  <li><strong>Speed:</strong> Reduce response time with pre-built content</li>
  <li><strong>Automation Ready:</strong> Plug into workflows and triggers</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/23.png',
                            caption: 'Appointment Booking overview'
                        }]
                    },
                    {
                        title: 'Dashboard Structure',
                        content: `
<p>The interface is designed for quick access and efficient management of all your content assets.</p>

<ul>
  <li><strong>Content Types Panel:</strong> Filter assets by category (Text, Media, Flow, etc.)</li>
  <li><strong>Global Search:</strong> Quickly find specific content</li>
  <li><strong>Material List:</strong> View and manage all saved resources</li>
</ul>

<p><strong>Tip:</strong> Use clear naming conventions like <code>Welcome_New_User</code> for faster identification during live chats.</p>
`
                    },
                    {
                        title: 'Content Types',
                        content: `
<p>The platform supports multiple types of reusable content to handle different communication needs.</p>

<h4>Text Messages</h4>
<p>Create reusable text responses for FAQs, greetings, and updates. Supports basic formatting and works across manual and automated flows.</p>

<h4>Images</h4>
<p>Upload and share visual content (JPG, PNG, GIF). Useful for product previews, guides, and support references.</p>

<h4>Documents</h4>
<p>Manage files like PDFs, Word, or Excel documents. Ideal for invoices, brochures, and official communication.</p>

<h4>Videos</h4>
<p>Share video content such as tutorials, demos, or promotional clips to enhance engagement.</p>

<h4>Stickers</h4>
<p>Add a conversational and friendly touch using custom stickers in chats.</p>

<h4>Form Flow</h4>
<p>Build interactive multi-step forms to collect structured user input directly within WhatsApp.</p>

<h4>Message Flows</h4>
<p>Create automated conversation sequences with logic-based responses for dynamic interactions.</p>

<h4>Message Templates</h4>
<p>Use Meta-approved templates for sending notifications, alerts, and proactive messages.</p>

<h4>Product Catalogs</h4>
<p>Showcase your products and services directly in WhatsApp for seamless browsing and sales.</p>

<h4>Chatbot</h4>
<p>Configure AI-powered assistants to automatically handle customer queries and reduce manual workload.</p>
`
                    },
                    {
                        title: 'Create New Resource',
                        content: `
<p>Follow these steps to create a new resource:</p>

<ol>
  <li><strong>Select Type:</strong> Choose the content category from the sidebar</li>
  <li><strong>Click Add:</strong> Use the + Add button for that type</li>
  <li><strong>Enter Details:</strong> Provide a name and content or upload file</li>
  <li><strong>Save:</strong> Click Create to store the resource</li>
</ol>

<p>Once saved, the resource becomes available for use in chats, automation flows, and triggers.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Reply Materials',
                category: 'Automation Resources',
                sub_title: 'Centralized library for text, media, and document assets',
                slug: 'automation-resources',
                description: 'Reply Materials serve as your centralized content library for managing reusable WhatsApp communication assets. From quick text snippets to high-quality videos and documents, this module helps teams respond faster, maintain consistency, and power automated interactions.',
                order: 2,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Reply Materials provide a unified system to store and manage all the media assets you use in your conversations and automations.</p>

<p>By centralizing your assets, you can:</p>
<ul>
  <li><strong>Maintain Consistency:</strong> Ensure every agent uses the same approved media and text.</li>
  <li><strong>Boost Productivity:</strong> Access snippets and files instantly without searching your local drive.</li>
  <li><strong>Enhance Automations:</strong> Link these materials directly to your Message Flows and Triggers.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/r1.png',
                            caption: 'Reply Materials Central Library'
                        }]
                    },
                    {
                        title: 'Text & Visual Media',
                        content: `
<p>Quickly share formatted text and eye-catching visual content to keep your customers engaged.</p>

<h4>Text Messages</h4>
<p>Create and manage quick text snippets for faster responses. Ideal for FAQs, greetings, and simplified administrative updates. Text messages support basic formatting and can be reused across multiple automation triggers.</p>

<h4>Images</h4>
<p>Upload and manage image files for quick sharing. Supports JPG, PNG, and GIF formats. Visual content significantly improves engagement and helps in demonstrating products or providing visual proof in support chats.</p>

<h4>Stickers</h4>
<p>Upload and manage sticker files for quick sharing. Add a personalized and informal touch to your customer interactions to build better brand relationships.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/24.png',
                            caption: 'Managing Visual Assets'
                        },
                        {
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/r1.png',
                            caption: 'Managing Visual Assets'
                        },
                        {
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/r4.png',
                            caption: 'Using Stickers'
                        }
                        ]
                    },
                    {
                        title: 'Documents & Videos',
                        content: `
<p>Deliver complex information and high-impact demonstrations through rich media files.</p>

<h4>Documents</h4>
<p>Upload and manage documents like PDF, Word, and Excel. Share brochures, invoices, guides, and other official documentation directly through WhatsApp with ease.</p>

<h4>Videos</h4>
<p>Upload and manage video files for quick sharing. Perfect for product demos, tutorials, or promotional content that requires more than just a static image.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/r2.png',
                            caption: 'Managing Documents and Videos'
                        },
                        {
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/r3.png',
                            caption: 'Managing Documents and Videos'
                        }
                        ]
                    },
                    {
                        title: 'Asset Management',
                        content: `
<p>To create a new resource, navigate to the specific media category in the sidebar and click the <strong>+ Add</strong> button.</p>

<ul>
  <li><strong>Naming:</strong> Use clear names like "Welcome_Image" or "Pricing_PDF" for easy searching.</li>
  <li><strong>Search:</strong> Use the global search bar to find assets by name or type instantly.</li>
  <li><strong>Reusability:</strong> Once created, these materials can be selected as "Sources" in your Message Flows and Sequence steps.</li>
</ul>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Message Flows',
                category: 'Automation Resources',
                sub_title: 'Create and manage automated message sequences for customer engagement',
                slug: 'automation-resources',
                description: 'Message Flows allow you to design complex, multi-step conversation sequences that respond dynamically to user behavior. By combining templates, media, and smart delays, you can build powerful onboarding, follow-up, and engagement funnels.',
                order: 3,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Message Flows are the core of automated customer engagement, allowing you to move beyond single-reply interactions into full conversational funnels.</p>

<p>Use Message Flows to automate:</p>
<ul>
  <li><strong>User Onboarding:</strong> Send a sequence of helpful tips over several days.</li>
  <li><strong>Re-engagement:</strong> Follow up with users who haven't interacted recently.</li>
  <li><strong>Sales Funnels:</strong> Guide users from product discovery to purchase.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/r6.png',
                            caption: 'Message Flows Dashboard'
                        }]
                    },
                    {
                        title: 'Building a Sequence',
                        content: `
<p>Each flow is composed of multiple "Steps" that trigger in order based on your timing rules.</p>

<ol>
  <li><strong>Add Step:</strong> Click the "Add Step" button to insert a new message into the sequence.</li>
  <li><strong>Select Source:</strong> Choose between standard WhatsApp Templates, Product Catalogs, or Reply Materials.</li>
  <li><strong>Order:</strong> Steps execute sequentially from top to bottom.</li>
</ol>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/r7.png',
                            caption: 'Adding a Sequence Step'
                        }]
                    },
                    {
                        title: 'Timing & Scheduling',
                        content: `
<p>Control exactly when each message in your flow is delivered to the customer.</p>

<ul>
  <li><strong>Delay Value:</strong> The amount of time to wait after the previous step (or trigger).</li>
  <li><strong>Unit:</strong> Choose between Minutes, Hours, or Days for your delay.</li>
  <li><strong>Send Anytime:</strong> If enabled, messages will send as soon as the delay expires. If disabled, you can restrict sending to specific business hours.</li>
</ul>

<p><strong>Note:</strong> Setting a delay of "0 Hours" will send the message immediately when the flow is triggered.</p>
`
                    },
                    {
                        title: 'Flow Management',
                        content: `
<p>Monitor and maintain your automated sequences directly from the dashboard.</p>

<ul>
  <li><strong>Status Toggle:</strong> Quickly activate or deactivate entire flows.</li>
  <li><strong>View Steps:</strong> Drill down into any flow to edit content, timing, or order.</li>
  <li><strong>Global Search:</strong> Find flows by name or description.</li>
</ul>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Advanced Automation Tools',
                category: 'Automation Resources',
                sub_title: 'Power your business with Forms, AI, Templates, and Catalogs',
                slug: 'automation-resources',
                description: 'Take your WhatsApp automation to the next level with our suite of advanced tools. From AI-powered chatbots and interactive form flows to Meta-approved message templates and integrated product catalogs, these features help you convert leads and scale your operations.',
                order: 4,
                sections: [
                    {
                        title: 'Form Flows',
                        content: `
<h4>Interactive Data Collection</h4>
<p>Form Flows allow you to create and manage multi-step interactive forms. Collect user information, survey responses, or service requests through a structured conversational interface directly within WhatsApp.</p>

<p><strong>Important:</strong> Forms must be created and <strong>Published</strong> using the WhatsApp Form builder before they can be used to create a Form Flow.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/r5.png',
                            caption: 'Form Flow Setup'
                        }]
                    },
                    {
                        title: 'AI Chatbots',
                        content: `
<h4>Intelligent Automated Assistants</h4>
<p>Manage your AI chatbots and configure intelligent automated assistants that can handle common customer queries without the need for human intervention.</p>

<ul>
  <li><strong>24/7 Availability:</strong> Respond to customers instantly at any time of day.</li>
  <li><strong>AI Powered:</strong> Use advanced models to understand and resolve complex queries.</li>
  <li><strong>Scalable:</strong> Handle thousands of conversations simultaneously.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/r8.png',
                            caption: 'AI Chatbot Configuration'
                        }]
                    },
                    {
                        title: 'Message Templates',
                        content: `
<h4>Meta-Approved Proactive Messaging</h4>
<p>Create and manage automated message templates for customer engagement. Use Meta-approved templates for proactive outbound messaging and notifications outside the 24-hour window.</p>

<p>Templates support dynamic variables (like names, order IDs, or dates) to ensure your automated notifications feel personal and relevant.</p>
`
                    },
                    {
                        title: 'Product Catalogs',
                        content: `
<h4>WhatsApp E-commerce Integration</h4>
<p>Manage your product catalogues within Wapi and showcase your products and services directly to users on WhatsApp. This allows for easier e-commerce integration and a seamless shopping experience.</p>

<ul>
  <li><strong>Direct Browsing:</strong> Users can view your full catalog without leaving the chat.</li>
  <li><strong>Cart Management:</strong> Customers can add items to a cart and send orders directly.</li>
  <li><strong>Higher Conversion:</strong> Reduce friction in the buying journey.</li>
</ul>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Keyword Triggers',
                category: 'Automation Resources',
                sub_title: 'Intelligent triggers for instant automated responses',
                slug: 'automation-resources',
                description: 'Keyword Triggers are the intelligent triggers of the Wapi automation suite. By mapping specific user inputs to predefined Response Resources, you can ensure your customers receive instant, accurate responses 24/7, without any manual agent intervention.',
                order: 5,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Keyword Triggers eliminate response latency, providing users with the exact information they need the moment they ask for it. Whether it is a simple greeting or a complex product inquiry, Keyword Triggers handle it instantly.</p>

<ul>
  <li><strong>24/7 Support:</strong> Never keep a customer waiting for a basic answer.</li>
  <li><strong>Precision:</strong> Map specific phrases to the exact resources they need.</li>
  <li><strong>Efficiency:</strong> Reduce manual workload for your support team.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/25.png',
                            caption: 'Keyword Trigger Setup'
                        }]
                    },
                    {
                        title: 'Matching Intelligence',
                        content: `
<p>Effective automation requires precise keyword matching logic. Wapi offers sophisticated matching methods to ensure your triggers are both flexible and accurate.</p>

<h4>Exact Match</h4>
<p>Triggers only if the user message matches the keyword exactly, character for character. (e.g., "Price")</p>

<h4>Contains</h4>
<p>Triggers if the keyword is found anywhere within the user's message. (e.g., "Send me the bill")</p>

<h4>Partial Match (Typo Tolerance)</h4>
<p>Uses fuzzy logic to handle slight variations or common typos in user input. (e.g., "Suport")</p>

<h4>Starts / Ends With</h4>
<p>Triggers if the message begins or ends with the specific keyword phrase. (e.g., "Order status")</p>
`
                    },
                    {
                        title: 'Provisioning Protocol',
                        content: `
<p>Follow this 3-step workflow to establish a new keyword-based automated response:</p>

<ol>
  <li><strong>Trigger Definition:</strong> Navigate to Keyword Trigger and click <strong>+ New Keyword Action</strong>. Enter multiple variations of your keyword and select your preferred Matching Method.</li>
  <li><strong>Asset Assignment:</strong> Choose the Response Resources you want to send (Text, Image, Template, etc.). Use the category tabs to filter and search your material library.</li>
  <li><strong>Validation & Launch:</strong> Review the Summary panel showing your keywords and linked assets. Click <strong>Create Action</strong> to push the automation to live production.</li>
</ol>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/26.png',
                            caption: 'Assigning Reply Materials'
                        }]
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Payment Gateways',
                category: 'Payment Integrations',
                sub_title: 'Securely integrate payment processors (Razorpay, Stripe, PayPal)',
                slug: 'payment-integrations',
                description: 'The Payment Gateways configuration module allows you to securely integrate popular payment processors into your Wapi platform. Enable automated payment collection for your subscription plans and service bookings.',
                order: 1,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>By configuring your credentials for Razorpay, Stripe, or PayPal, you enable automated payment collection. This ensures a seamless transaction experience for your customers and automated billing management for your business.</p>
`
                    },
                    {
                        title: 'Dashboard Navigation',
                        content: `
<p>The Payment Gateways dashboard provides a centralized view of all your active and pending payment integrations:</p>
<ul>
  <li><strong>Search Gateways:</strong> Filter through your configured gateways by their display names.</li>
  <li><strong>Add New Gateway:</strong> Click the <strong>"+ Add Gateway"</strong> button to start a new integration.</li>
  <li><strong>Management Table:</strong> View provider types, creation dates, and manage actions (Edit/Delete).</li>
</ul>
`
                    },
                    {
                        title: 'Adding a New Gateway',
                        content: `
<p>To integrate a new payment processor, follow these steps in the <strong>Add Gateway</strong> modal:</p>

<ul>
  <li><strong>Display Name:</strong> Enter a recognizable name (e.g., "Primary Razorpay Account").</li>
  <li><strong>Gateway Provider:</strong> Select from:
    <ul>
      <li><strong>Razorpay:</strong> Extensive UPI support (India).</li>
      <li><strong>Stripe:</strong> Global standard for card payments.</li>
      <li><strong>PayPal:</strong> Trusted worldwide digital payments.</li>
    </ul>
  </li>
  <li><strong>Key ID & Secret:</strong> Paste your API keys provided by the gateway's developer dashboard.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/p1.png',
                            caption: 'Add Gateway Configuration'
                        }]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Payment Transactions',
                category: 'Payment Integrations',
                sub_title: 'Comprehensive history and status tracking of all payments',
                slug: 'payment-integrations',
                description: 'The Payment Transactions module provides a comprehensive history of all financial activities. Track payments, monitor statuses, and maintain a clear audit trail of charges and services.',
                order: 1,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Ensure complete transparency and simplify financial record-keeping by tracking all past and present transaction records in chronological order.</p>

<ul>
  <li><strong>Transaction History:</strong> Chronological record of all activities.</li>
  <li><strong>Status Tracking:</strong> Real-time updates for successful or pending payments.</li>
  <li><strong>Easy Reconciliation:</strong> Match payments with appointments or custom orders.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/pt.png',
                            caption: 'Payment Transactions Ledger'
                        }]
                    },
                    {
                        title: 'Interface & Table breakdown',
                        content: `
<p>The main transaction table captures essential data points for every record:</p>

<table class="table">
  <thead>
    <tr>
      <th>Column</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Order ID</strong></td>
      <td>Unique alphanumeric identifier for tracking.</td>
    </tr>
    <tr>
      <td><strong>Context</strong></td>
      <td>Payment source (e.g., Appointment, Subscription, Custom).</td>
    </tr>
    <tr>
      <td><strong>Amount</strong></td>
      <td>Total value with currency symbol.</td>
    </tr>
    <tr>
      <td><strong>Status</strong></td>
      <td>Current state (Paid or Pending).</td>
    </tr>
    <tr>
      <td><strong>Gateway</strong></td>
      <td>The provider used (Razorpay, Stripe, etc.).</td>
    </tr>
  </tbody>
</table>
`
                    },
                    {
                        title: 'Status Definitions',
                        content: `
<p>Every transaction is assigned a status to indicate its progress:</p>
<ul>
  <li><strong>Paid:</strong> Successfully processed and funds received.</li>
  <li><strong>Pending:</strong> Initiated but not concluded. May require user action.</li>
</ul>
`
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Click To WhatsApp Ads',
                category: 'Marketing',
                sub_title: 'Launch high-converting WhatsApp campaigns from Facebook',
                slug: 'marketing',
                description: 'The Click To WhatsApp Ads module lets you manage your Facebook advertising assets and launch high-converting WhatsApp campaigns directly from Wapi. Bridge Facebook\'s reach with WhatsApp\'s personal engagement.',
                order: 1,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Launch ads on Facebook and Instagram that open a chat directly in WhatsApp. This powerful integration helps you drive sales and provide instant customer support through your marketing funnel.</p>

<ul>
  <li><strong>Asset Synchronization:</strong> Automatically sync Facebook Pages and Ad Accounts.</li>
  <li><strong>Guided Campaign Creation:</strong> 3-step wizard for objectives, targeting, and creatives.</li>
  <li><strong>Real-time Analytics:</strong> Monitor spend, reach, and conversion metrics.</li>
</ul>
`
                    },
                    {
                        title: 'Asset Management',
                        content: `
<p>Before launching campaigns, synchronize your Facebook assets. Wapi provides a unified view of your connected Pages and Ad Accounts.</p>

<ul>
  <li><strong>Sync Social Accounts:</strong> Use the "Sync Social Account" button to refresh your Facebook Pages.</li>
  <li><strong>Sync Ads:</strong> Periodically sync to reflect changes made in Facebook Ads Manager.</li>
  <li><strong>Status Monitoring:</strong> Instantly check if an account is Active and has a valid payment method.</li>
</ul>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/fb.png',
                                caption: 'Facebook Pages Synchronization'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/fb1.png',
                                caption: 'Ad Accounts Management'
                            }
                        ]
                    },
                    {
                        title: 'Campaign Hierarchy',
                        content: `
<p>Manage your ads using the standard Facebook hierarchy for granular control:</p>

<ul>
  <li><strong>Campaigns Level:</strong> View high-level objectives (e.g., Awareness, Sales) and set global budgets.</li>
  <li><strong>Ad Sets Level:</strong> Manage demographic targeting, placements, and specific ad set statuses.</li>
  <li><strong>Ads (Creative) Level:</strong> Review and edit specific ad creatives and monitor individual performance.</li>
</ul>
`
                    },
                    {
                        title: 'Creating a Campaign',
                        content: `
<p>Our 3-step wizard simplifies the complex Facebook ad creation process:</p>

<ol>
  <li><strong>Step 1: Campaign Information:</strong> Set your name, objective (Traffic/Sales), and daily budget.</li>
  <li><strong>Step 2: Targeting Configuration:</strong> Use the interactive map to select locations and refine demographics by age and gender.</li>
  <li><strong>Step 3: Creative & Welcome Experience:</strong> Design the ad creative and define the greeting text users see when they click your ad.</li>
</ol>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/cm1.png',
                                caption: 'Step 1: Campaign Information'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/cm2.png',
                                caption: 'Step 2: Targeting Configuration'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/c3.png',
                                caption: 'Step 3: Creative & Welcome Experience'
                            }
                        ]
                    },
                    {
                        title: 'Performance Analytics',
                        content: `
<p>Optimize your ROI by monitoring campaign performance through our real-time analytics engine:</p>

<ul>
  <li><strong>Metric Overview:</strong> Track Total Spend, Impressions, Reach, and Link Clicks.</li>
  <li><strong>Audience Demographics:</strong> Visualize gender and age distribution.</li>
  <li><strong>Platform Breakdown:</strong> See whether Facebook or Instagram is driving more traffic.</li>
</ul>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/fb4.png',
                                caption: 'Ad Dashboard Overview'
                            },
                        ]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Broadcast Campaigns',
                category: 'Marketing',
                sub_title: 'Power your WhatsApp marketing with bulk template broadcasts',
                slug: 'marketing',
                description: 'The Campaign module is the mission control for your WhatsApp marketing strategy. It enables businesses to broadcast approved message templates to targeted audiences, either through instant delivery or strategic scheduling.',
                order: 2,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Reach thousands of contacts simultaneously with Meta-approved message templates. Whether it is for promotions, reminders, or notifications, Broadcast Campaigns ensure high-impact communication.</p>

<ul>
  <li><strong>Bulk Broadcasting:</strong> Reach your entire audience at once.</li>
  <li><strong>Intelligent Scheduling:</strong> Plan campaigns for maximum engagement at specific times.</li>
  <li><strong>Real-time Tracking:</strong> Monitor sent, delivered, and read statuses instantly.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/camapign.png',
                            caption: 'Broadcast Campaigns Dashboard'
                        }]
                    },
                    {
                        title: 'Intelligence Dashboard',
                        content: `
<p>The campaign list page provides immediate insights into your performance and platform limits:</p>

<ul>
  <li><strong>Remaining Limit:</strong> Allocation based on your current messaging tier.</li>
  <li><strong>Conversion Funnel:</strong> Real-time tracking of Sent, Delivered, and Read counts.</li>
  <li><strong>Campaign Status:</strong> Indicators for Completed, Live, Draft, or Suspended campaigns.</li>
</ul>
`
                    },
                    {
                        title: 'Creation Protocol',
                        content: `
<p>Launching a successful campaign follows a sequential 5-step workflow:</p>

<ol>
  <li><strong>Step 1: Basic Information:</strong> Define the campaign identity with clear names (e.g., "Summer Sale 2024").</li>
  <li><strong>Step 2: WhatsApp Configuration:</strong> Select the source WABA ID and choose from your approved message templates.</li>
  <li><strong>Step 3: Variable Mapping:</strong> Inject dynamic values (names, coupon codes) into placeholders with real-time preview.</li>
  <li><strong>Step 4: Recipients Selection:</strong> Choose between All Contacts, Specific Individuals, or Segments by Tags.</li>
  <li><strong>Step 5: Schedule & Launch:</strong> Send immediately or schedule for future automated delivery.</li>
</ol>
`,
                        images: [
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/36.png',
                                caption: 'Step 1: Basic Information'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/37.png',
                                caption: 'Step 2: Template Selection'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/38.png',
                                caption: 'Step 3: Variable Mapping'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/39.png',
                                caption: 'Step 4: Recipient Selection'
                            },
                            {
                                url: 'https://docs.pixelstrap.net/wapi/assets/images/user/40.png',
                                caption: 'Step 5: Schedule & Launch'
                            }
                        ]
                    },
                    {
                        title: 'Operational Logic',
                        content: `
<p>Once launched, messages are dispatched via the WhatsApp Business API. The system monitors the full engagement funnel from <strong>Sent</strong> to <strong>Delivered</strong> and finally <strong>Read</strong>, allowing you to measure true ROI.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Order Management',
                category: 'Marketing',
                sub_title: 'Monitor and manage your WhatsApp orders',
                slug: 'marketing',
                description: 'The Order Management feature transforms WhatsApp into a powerful sales and order processing channel. It enables businesses to manage the complete lifecycle of customer orders—from initial inquiry and cart submission to final delivery.',
                order: 3,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Manage the complete lifecycle of customer orders—from initial inquiry and cart submission to final delivery—all within a single, conversation-driven platform.</p>

<ul>
  <li><strong>Commerce Hub:</strong> End-to-end order handling integrated directly with WhatsApp carts.</li>
  <li><strong>Real-time Sync:</strong> Automated status updates ensure transparency and build customer trust.</li>
  <li><strong>Smart Alerts:</strong> Trigger automated WhatsApp messages upon every status change.</li>
</ul>
`
                    },
                    {
                        title: 'Key Capabilities',
                        content: `
<p>Wapi’s Order Management module provides the essential toolset to transform WhatsApp conversations into revenue-generating commerce channels.</p>

<h4>Operational Features</h4>
<ul>
  <li><strong>Unified Commerce View:</strong> Centralized dashboard for all incoming WhatsApp cart submissions.</li>
  <li><strong>Milestone Tracking:</strong> Monitor every stage from "Received" to "Delivered".</li>
  <li><strong>Inventory Integration:</strong> Direct connection with Meta Business Catalog for accurate SKU mapping.</li>
</ul>

<h4>Engagement & Automation</h4>
<ul>
  <li><strong>Autonomous Alert Logic:</strong> Trigger instant status-based WhatsApp templates.</li>
  <li><strong>Fulfillment Workflow:</strong> Manage agent assignments and order progress in one place.</li>
</ul>
`
                    },
                    {
                        title: 'Autonomous Status Notifications',
                        content: `
<p>Eliminate manual communication by triggering pre-configured WhatsApp templates whenever an order's status is updated.</p>

<p><strong>Configurable Status Templates:</strong></p>
<ul>
  <li><strong>Order Received:</strong> Automatic confirmation sent upon initial purchase.</li>
  <li><strong>Pending:</strong> Notifies customer that the order is awaiting review.</li>
  <li><strong>Confirmed:</strong> Confirms that the order is being prepared for fulfillment.</li>
  <li><strong>Shipped/Out for Delivery:</strong> Provides real-time tracking milestones.</li>
  <li><strong>Delivered:</strong> Sends a final transaction closure and feedback request.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/order.png',
                            caption: 'Configuring Order Status Automations'
                        }]
                    },
                    {
                        title: 'The Order Lifecycle Protocol',
                        content: `
<p>Manage your commerce transactions through this professional 3-step sequential workflow:</p>

<ol>
  <li><strong>Step 1: Order Reception:</strong> System creates a record with "Received" status and alerts fulfillment agents.</li>
  <li><strong>Step 2: Status Synchronization:</strong> As fulfillment progresses (Processing, Shipped), agents update the status to trigger corresponding templates.</li>
  <li><strong>Step 3: Lifecycle Finalization:</strong> Mark as "Delivered" to finalize the transaction and trigger post-purchase flows.</li>
</ol>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Product Catalogs',
                category: 'Marketing',
                sub_title: 'Manage and update your product catalog',
                slug: 'marketing',
                description: 'Catalogue Management enables businesses to synchronize their Meta (Facebook) Business catalogs with the Wapi platform. Showcase, manage, and sell products directly within WhatsApp conversations and automated commerce workflows.',
                order: 4,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Catalogue Management enables businesses to synchronize their Meta (Facebook) Business catalogs with the Wapi platform. Showcase, manage, and sell products directly within WhatsApp conversations and automated commerce workflows.</p>

<ul>
  <li><strong>Meta Sync:</strong> Seamless synchronization with Meta Commerce Manager assets.</li>
  <li><strong>Centralized Control:</strong> Manage all product listings from a single unified dashboard.</li>
  <li><strong>Conversational Commerce:</strong> Enable customers to browse and purchase products in real-time.</li>
</ul>
`
                    },
                    {
                        title: 'Key Capabilities',
                        content: `
<p>Leverage the power of integrated commerce with these core functionalities:</p>

<ul>
  <li><strong>Sync Meta Catalog:</strong> Connect and import your existing Meta Business Manager catalogs.</li>
  <li><strong>Product Management:</strong> Search, filter, and organize synced product data in a unified view.</li>
  <li><strong>WhatsApp Shareable:</strong> Use products directly in chats, campaigns, and chatbots.</li>
  <li><strong>Real-time Updates:</strong> Regular sync ensures your platform data matches Meta listings.</li>
</ul>
`
                    },
                    {
                        title: 'Meta Catalogue Integration',
                        content: `
<p>Follow these steps to connect your Facebook Business catalog with the platform:</p>

<ol>
  <li><strong>Step 1: Connect Meta Account:</strong> Navigate to settings and authorize your Meta account via OAuth.</li>
  <li><strong>Step 2: Select Catalogue:</strong> Choose the specific catalog from your Meta Commerce Manager.</li>
  <li><strong>Step 3: Protocol Synchronization:</strong> Initiate the sync to import titles, IDs, pricing, and media assets.</li>
  <li><strong>Step 4: Link to WABA:</strong> Verify the link between your catalog and active WABA for commerce messaging.</li>
</ol>

<p><strong>Requirement:</strong> Only approved and active catalogs from Meta Commerce Manager can be synced. Ensure proper admin permissions.</p>
`
                    },
                    {
                        title: 'Operational Management',
                        content: `
<p>Once synced, access the <strong>Manage Products</strong> dashboard to review imported listings:</p>

<ul>
  <li><strong>View Listings:</strong> Review sync status, images, and pricing.</li>
  <li><strong>Search & Filter:</strong> Quickly locate specific SKUs or categories.</li>
  <li><strong>Listing Organization:</strong> Group products for various sales workflows.</li>
</ul>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Event Notifications',
                category: 'Marketing',
                sub_title: 'Get real-time WhatsApp event updates sent directly to your server',
                slug: 'marketing',
                description: 'Event Notifications allow you to get real-time WhatsApp event updates sent directly to your server. This webhook integration acts as a bridge between Wapi and your external ecosystem, ensuring your backend systems remain instantly synchronized.',
                order: 5,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Configure your secure webhook URL, and Wapi will automatically deliver real-time data payloads (such as custom "order received" events) directly to your endpoint whenever they are triggered.</p>

<ul>
  <li><strong>Real-Time Delivery:</strong> Instant data transfer to your server.</li>
  <li><strong>System Synchronization:</strong> Keep your CRM or ERP updated with conversation activities.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/webhook.png',
                            caption: 'Event Notifications Overview'
                        }]
                    },
                    {
                        title: 'Webhook Configuration',
                        content: `
<p>Setting up a webhook involves creating an endpoint in Wapi and mapping external payloads to specific message triggers.</p>

<ul>
  <li><strong>Dynamic Endpoint Creation:</strong> Generate unique URLs for different sources.</li>
  <li><strong>Cross-Platform Mapping:</strong> Align external keys (e.g., "order_status") with WhatsApp triggers.</li>
  <li><strong>Real-time Fulfillment:</strong> Instantly notify customers of shipment or payment updates.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/webhook1.png',
                            caption: 'Create Event Notification Modal'
                        }]
                    },
                    {
                        title: 'Implementation Protocol',
                        content: `
<p>Follow these steps to synchronize your business events with WhatsApp messages:</p>

<ol>
  <li><strong>Step 1: Generate Webhook URL:</strong> Create a new webhook in Wapi and copy the generated URL.</li>
  <li><strong>Step 2: External System Setup:</strong> Paste the URL into your platform's settings (e.g., Shopify, WooCommerce).</li>
  <li><strong>Step 3: Trigger & Template Mapping:</strong> Map the incoming event to a specific WhatsApp Template and activate.</li>
</ol>
`
                    },
                    {
                        title: 'Scenario: Payment Failure Alert',
                        content: `
<p>Recover lost revenue with proactive conversational alerts:</p>
<ul>
  <li><strong>Trigger Source:</strong> Payment Gateway (Stripe/Razorpay).</li>
  <li><strong>Event:</strong> charge.failed.</li>
  <li><strong>Wapi Action:</strong> Send "Payment Link" template with a direct checkout button.</li>
</ul>
`
                    }
                ],
                status: true,
                created_by: adminId
            },

            {
                title: 'Contact Directory',
                category: 'Contacts & Tools',
                sub_title: 'Centralize and manage your customer database',
                slug: 'contacts-tools',
                description: 'The Contact Management module serves as the primary CRM hub for Wapi. It enables businesses to centralize, organize, and segment their customer database for highly targeted WhatsApp campaigns and automated workflows.',
                order: 1,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>The Contact Management module enables businesses to consolidate leads from every touchpoint—campaigns, forms, and chatbots—into a single, actionable database with real-time tracking.</p>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/contacts.png',
                            caption: 'Contact Directory Dashboard'
                        }]
                    },
                    {
                        title: 'Operational Infrastructure',
                        content: `
<p>The Contacts interface provides high-visibility management of your customer growth and platform limits:</p>

<ul>
  <li><strong>Health Metrics:</strong> Real-time tracking of contact count vs. plan limits.</li>
  <li><strong>Global Discovery:</strong> Instant keyword search to locate customers by name or phone number.</li>
  <li><strong>Dynamic Data Fields:</strong> Customize the data grid to show attributes relevant to your sales flow.</li>
</ul>

<p><strong>Pro Tip:</strong> Use the "Refresh" button periodically to ensure real-time accuracy across team members.</p>
`
                    },
                    {
                        title: 'Data Attribute Taxonomy',
                        content: `
<p>Capture a rich spectrum of data points for high-fidelity personalization:</p>

<ul>
  <li><strong>Phone Identity:</strong> Mandatory unique identifier with country code.</li>
  <li><strong>Lead Tags:</strong> Dynamic labels (Lead, VIP, Refund) for segment-based messaging.</li>
  <li><strong>Lead Source:</strong> Track origin (Ads, Website, QR) to measure campaign ROI.</li>
  <li><strong>Firmographics:</strong> Capture Company Name and Business associations.</li>
  <li><strong>Preferences:</strong> Set preferred language to localize automated responses.</li>
  <li><strong>Sales Notes:</strong> Internal context for agent-to-agent visibility.</li>
</ul>
`
                    },
                    {
                        title: 'Segment Management',
                        content: `
<p>Segments allow you to group contacts for bulk actions. For example, you can create a "Festival Buyers" segment and bulk-add contacts to it for seasonal promotions.</p>

<ul>
  <li><strong>Create Segments:</strong> Define logical groupings for your audience.</li>
  <li><strong>Bulk Action:</strong> Select multiple contacts and add them to a segment instantly.</li>
</ul>
`
                    },
                    {
                        title: 'Pipeline Integration',
                        content: `
<p>Manage your leads through a Kanban-style pipeline dashboard for better conversion tracking.</p>

<ul>
  <li><strong>Pipeline Entry:</strong> You can only add contacts to a pipeline after you have created a funnel of type "Contact".</li>
  <li><strong>Kanban View:</strong> Move contacts across stages to visualize your sales progress.</li>
</ul>
`
                    },
                    {
                        title: 'Provisioning Protocol',
                        content: `
<ol>
  <li><strong>Step 1: Initiation:</strong> Click the <strong>+ Add Contact</strong> button on the header.</li>
  <li><strong>Step 2: Mandatory Entry:</strong> Input the phone number including the country code.</li>
  <li><strong>Step 3: Enrichment:</strong> Assign tags, lead source, and sales notes to categorize the lead.</li>
  <li><strong>Step 4: Database Sync:</strong> Click "Create Contact" to finalize.</li>
</ol>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/43.png',
                            caption: 'Create Contact Details'
                        }]
                    },
                    {
                        title: 'Operational Synergy',
                        content: `
<p>Import thousands of leads via CSV to instantly trigger <strong>Welcome Campaigns</strong> or <strong>Automation Flows</strong>. Pair contact tags with <strong>WhatsApp Broadcasts</strong> for high-impact targeted messaging.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Segments',
                category: 'Contacts & Tools',
                sub_title: 'Manage your contact segments',
                slug: 'contacts-tools',
                description: 'The Segments module allows you to create logical groupings of your contacts for targeted messaging and organized CRM management. Group users based on behavior, purchase history, or demographics.',
                order: 2,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Segments provide a way to organize your contact directory into manageable groups. This ensures that your marketing broadcasts and automation flows are delivered to the right audience at the right time.</p>

<ul>
  <li><strong>Logical Grouping:</strong> Categorize users (e.g., "VIP Users", "Festival Buyers").</li>
  <li><strong>Targeted Messaging:</strong> Select specific segments when launching campaigns.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/seg1.png',
                            caption: 'Segments Management Dashboard'
                        }]
                    },
                    {
                        title: 'Dashboard Navigation',
                        content: `
<p>The Segments dashboard provides a high-level view of your audience organization:</p>

<ul>
  <li><strong>Segment List:</strong> View segment names, descriptions, and the total number of contacts assigned to each.</li>
  <li><strong>Search & Filter:</strong> Quickly locate a specific segment using the search bar.</li>
  <li><strong>Creation Date:</strong> Track when segments were established for historical context.</li>
</ul>
`
                    },
                    {
                        title: 'Creating a Segment',
                        content: `
<p>Follow these steps to establish a new contact grouping:</p>

<ol>
  <li><strong>Step 1: Initiation:</strong> Click the <strong>+ Add Segment</strong> button on the dashboard header.</li>
  <li><strong>Step 2: Identification:</strong> Enter a clear Name and Description (e.g., "High Value Customers").</li>
  <li><strong>Step 3: Contact Selection:</strong> Choose the contacts you wish to include in this logical group.</li>
  <li><strong>Step 4: Save:</strong> Click "Save" to finalize the segment.</li>
</ol>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/seg2.png',
                            caption: 'Create Segment Modal'
                        }]
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Data Fields',
                category: 'Contacts & Tools',
                sub_title: 'Set up personalized data fields for contacts',
                slug: 'contacts-tools',
                description: 'Custom Fields are dynamic data attributes that allow businesses to extend default contact profiles with business-specific information. Drive highly targeted automation and personalization across the Wapi ecosystem.',
                order: 3,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Store tailored details like "Membership ID", "Last Purchase Category", or "Preferred Agent" to create a 360-degree view of your customer.</p>

<ul>
  <li><strong>Advanced Personalization:</strong> Use attributes as variables in message templates (e.g., {{membership_id}}).</li>
  <li><strong>Granular Segmentation:</strong> Filter your contact list based on specific values for targeted broadcasts.</li>
  <li><strong>Flexible Types:</strong> Support for text, select menus, numbers, and long-form text areas.</li>
</ul>
`
                    },
                    {
                        title: 'Custom Fields Dashboard',
                        content: `
<p>Centralize the management of all your bespoke data attributes from a high-visibility interface:</p>

<ul>
  <li><strong>Remaining Capacity:</strong> Real-time tracking of current fields vs. plan limits (e.g., 46 / 50).</li>
  <li><strong>Attribute Grid:</strong> A searchable list displaying field types, required status, and configuration states.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/custom-columns.png',
                            caption: 'Custom Fields Management Dashboard'
                        }]
                    },
                    {
                        title: 'Interface Data Points',
                        content: `
<p>The management grid provides a comprehensive overview of every active attribute:</p>

<table class="table">
  <thead>
    <tr>
      <th>Column</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Label / Type</strong></td>
      <td>The user-facing name and technical input type (e.g., "textarea").</td>
    </tr>
    <tr>
      <td><strong>Limits</strong></td>
      <td>Validation constraints for text or numerical data entry.</td>
    </tr>
    <tr>
      <td><strong>Required Status</strong></td>
      <td>Indicates if the field is mandatory during contact creation.</td>
    </tr>
    <tr>
      <td><strong>Options</strong></td>
      <td>Pre-defined choices for "Select" type dropdown menus.</td>
    </tr>
  </tbody>
</table>
`
                    },
                    {
                        title: 'Provisioning Protocol',
                        content: `
<ol>
  <li><strong>Step 1: Initiation:</strong> Click "Create New Field" to open the initialization modal.</li>
  <li><strong>Step 2: Define Label:</strong> Enter a clear name (e.g., "Lead Source"). The internal identifier will auto-generate.</li>
  <li><strong>Step 3: Select Input Type:</strong> Choose between Text, Textarea, Select, or Number.</li>
  <li><strong>Step 4: Toggle Governance:</strong> Enable "Required" or "Visibility" settings as needed.</li>
  <li><strong>Step 5: Persistence:</strong> Click "Create" to finalize and inject the field into your CRM.</li>
</ol>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/45.png',
                            caption: 'Define New Custom Field'
                        }]
                    },
                    {
                        title: 'Lifecycle & Integration',
                        content: `
<p>Custom fields are integrated deep into the contact management lifecycle:</p>
<p><strong>Provisioning &rarr; Data Ingestion &rarr; Strategic Filtering &rarr; Targeted Execution</strong></p>
<p>For example, capture "Lead Source" as "Facebook Ads", filter for that value, and run a high-conversion broadcast specifically for that segment.</p>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Import Logs',
                category: 'Contacts & Tools',
                sub_title: 'Monitor background contact import tasks',
                slug: 'contacts-tools',
                description: 'The Import Jobs engine handles bulk contact uploads in the background, ensuring smooth performance even with 10k+ records. Prevent system lag and monitor your data ingestion in real-time.',
                order: 4,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Efficiently manage bulk data tasks without interrupting your daily workflows. The asynchronous engine offloads processing to the background, providing detailed feedback for every record.</p>

<ul>
  <li><strong>Async Engine:</strong> Prevents system lag during massive bulk uploads.</li>
  <li><strong>Live Tracking:</strong> Monitor the progress of your jobs in real-time.</li>
  <li><strong>Error Logs:</strong> Get detailed feedback for failed rows to fix formatting issues.</li>
</ul>
`
                    },
                    {
                        title: 'Dashboard Overview',
                        content: `
<p>The Import Logs dashboard provides a chronological record of all bulk activities:</p>

<ul>
  <li><strong>Job List:</strong> History of every CSV upload initiated on the platform.</li>
  <li><strong>Live Status:</strong> Track states such as <strong>Pending</strong>, <strong>Processing</strong>, or <strong>Completed</strong>.</li>
  <li><strong>Metrics:</strong> View total record counts vs. success ratios for each job.</li>
</ul>
`
                    },
                    {
                        title: 'Import Protocol',
                        content: `
<p>The system follows a professional 4-step sequence to ensure data integrity:</p>
<p><strong>Upload CSV &rarr; Worker Queue &rarr; Schema Validation &rarr; Database Persistence</strong></p>
<p><strong>Resolution:</strong> If rows are skipped, you can download the error logs to identify formatting errors or duplicates before re-uploading.</p>
`
                    },
                    {
                        title: 'Scenario: Bulk Processing',
                        content: `
<p>When uploading 5,000 contacts, the system offloads the CSV to background workers. Total processing time is approximately <strong>45 seconds</strong>, and your UI remains fully interactive for chat management during the task.</p>
`
                    },
                    {
                        title: 'Troubleshooting',
                        content: `
<table class="table">
  <thead>
    <tr>
      <th>Issue</th>
      <th>Cause</th>
      <th>Solution</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Stuck 'Pending'</strong></td>
      <td>High Server Load</td>
      <td>Wait and refresh after 1 minute.</td>
    </tr>
    <tr>
      <td><strong>Row Skipped</strong></td>
      <td>Duplicate Data</td>
      <td>Verify if the contact already exists.</td>
    </tr>
    <tr>
      <td><strong>Job Failed</strong></td>
      <td>Format Error</td>
      <td>Verify CSV headers and delimiters.</td>
    </tr>
  </tbody>
</table>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'AI Config',
                category: 'Contacts & Tools',
                sub_title: 'Configure your AI assistant preferences',
                slug: 'contacts-tools',
                description: 'The AI Configuration engine integrates LLMs (OpenAI, Gemini, Grok) to power smart automated responses and lead qualification with full cost and personality control.',
                order: 5,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Integrate state-of-the-art LLMs to provide 24/7 human-like automated replies and smart lead categorization. Maintain full control over personality and operational costs.</p>

<ul>
  <li><strong>Multi-Model:</strong> Support for GPT-4o, Gemini 1.5 Pro, xAI Grok, and more.</li>
  <li><strong>Secure Vault:</strong> Encrypted API key storage with SHA-256 protection.</li>
  <li><strong>Live Status:</strong> Real-time connectivity pings to ensure your AI is always online.</li>
</ul>
`
                    },
                    {
                        title: 'Dashboard Overview',
                        content: `
<p>Manage your AI assistant\'s core settings from a unified interface:</p>

<ul>
  <li><strong>AI Model Selector:</strong> Choose the "brain" for your automated assistant.</li>
  <li><strong>Key Vault:</strong> Secure credential management for your chosen provider.</li>
  <li><strong>Connectivity Monitor:</strong> Live validation of your API status (Connected/Disconnected).</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/44.png',
                            caption: 'AI Configuration Dashboard'
                        }]
                    },
                    {
                        title: 'AI Provider Selection',
                        content: `
<p>Wapi supports a diverse range of industry-leading providers:</p>
<ul>
  <li><strong>GPT-4o (OpenAI):</strong> The creative standard for complex reasoning.</li>
  <li><strong>Gemini 1.5 Pro (Google):</strong> High-performance multimodal powerhouse.</li>
  <li><strong>xAI Grok:</strong> Known for real-time knowledge and concise logic.</li>
  <li><strong>DeepSeek Chat:</strong> Optimized for high-volume efficiency.</li>
</ul>
`
                    },
                    {
                        title: 'Configuration Protocol',
                        content: `
<p>The system follows a secure 4-step implementation lifecycle:</p>
<p><strong>Select Model &rarr; Paste API Key &rarr; Ping Validation &rarr; AI Activation</strong></p>

<p><strong>Security Note:</strong> Your API keys are never stored in plain text. They are encrypted end-to-end to prevent unauthorized access.</p>
`
                    },
                    {
                        title: 'API Key Acquisition Flow',
                        content: `
<ol>
  <li><strong>Step 1: Account Setup:</strong> Sign up on the provider\'s platform (e.g., OpenAI or Google AI Studio).</li>
  <li><strong>Step 2: Billing/Credits:</strong> Ensure active credits or a payment method is linked.</li>
  <li><strong>Step 3: Create Secret Key:</strong> Navigate to the API Keys section and generate a new key.</li>
  <li><strong>Step 4: Paste & Secure:</strong> Copy and paste the key into the Wapi vault immediately.</li>
</ol>
`
                    }
                ],
                status: true,
                created_by: adminId
            },
            {
                title: 'Integration Tools',
                category: 'Contacts & Tools',
                sub_title: 'Integrate Wapi into your own applications',
                slug: 'contacts-tools',
                description: 'The WAPI platform provides a comprehensive REST API that enables developers to integrate WhatsApp marketing capabilities into their own applications and services. Our API follows industry-standard practices for secure access.',
                order: 6,
                sections: [
                    {
                        title: 'Overview',
                        content: `
<p>Extend the power of Wapi to your own software ecosystem. Our comprehensive REST API provides secure, reliable access to all platform features, enabling seamless cross-platform synchronization.</p>

<ul>
  <li><strong>Developer-First:</strong> Built with industry-standard practices.</li>
  <li><strong>Secure Access:</strong> Robust authentication via unique API credentials.</li>
  <li><strong>Full Coverage:</strong> Programmatic access to messages, templates, and contacts.</li>
</ul>
`,
                        images: [{
                            url: 'https://docs.pixelstrap.net/wapi/assets/images/user/developers-api.png',
                            caption: 'Developer Integration Hub'
                        }]
                    },
                    {
                        title: 'API Authentication',
                        content: `
<p>All API requests require authentication using your unique API keys to ensure data security:</p>

<ul>
  <li><strong>Key Generation:</strong> Navigate to <strong>Settings &rarr; API Keys</strong> to generate your credentials.</li>
  <li><strong>Authentication Header:</strong> Include the header <code>Authorization: Bearer YOUR_API_KEY</code> with every request.</li>
  <li><strong>Security:</strong> Store your keys securely. Never expose them in public or client-side code.</li>
</ul>
`
                    },
                    {
                        title: 'Available Endpoints',
                        content: `
<p>Our API provides programmatic access to all major platform modules:</p>

<ul>
  <li><strong>Message Management:</strong> Send, receive, and manage WhatsApp messages programmatically.</li>
  <li><strong>Template Operations:</strong> Create, update, and manage Meta-approved message templates.</li>
  <li><strong>Contact Management:</strong> Add, update, and organize customer profiles and segments.</li>
</ul>
`
                    }
                ],
                status: true,
                created_by: adminId
            },


        ]

        const categoryPositions = {
            'Getting Started': 1,
            'Chat Management': 2,
            'Template': 3,
            'Google Integration': 4,
            'Tools & Utilities': 5,
            'Asset Management': 6,
            'Access Management': 7,
            'Automation': 8,
            'Automation Resources': 9,
            'Payment Integrations': 10,
            'Marketing': 11,
            'Contacts & Tools': 12
        };

        for (const guideData of guides) {
            guideData.position = categoryPositions[guideData.category] || 999;
            await Guide.findOneAndUpdate(
                { title: guideData.title, category: guideData.category },
                guideData,
                { upsert: true, returnDocument: 'after' }
            );
        }

        console.log('Guides seeded successfully!');
    } catch (error) {
        console.error('Error seeding guides:', error);
    }
};

export default seedGuide;
