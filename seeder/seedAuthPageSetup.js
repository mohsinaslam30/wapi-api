import { AuthPageSetup } from '../models/index.js';

const seedAuthPageSetup = async () => {
  try {
    console.log('Seeding Auth Page Setup...');

    const authData = {
      login_page: {
        title: "Welcome Back",
        subtitle: "Sign in to manage campaigns, automation, templates, and chats.",
        button_text: "Sign In",
        forgot_password_text: "Forgot password?",
        signup_text: "Don't have an account?",
        signup_link_text: "Create an account",
        side_panel: {
          title: "Grow Your Business with WhatsApp",
          description: "Manage chats, send campaigns, automate alerts, and grow sales – all managed from one platform.",
          bullets: [
            { title: "50K+ Active Contacts", points: [] },
            { title: "5M+ WhatsApp Messages Delivered", points: [] },
            { title: "99.9% Message Delivery Rate", points: [] },
            { title: "Official WhatsApp API", points: [] }
          ]
        }
      },
      register_page: {
        title: "Create Your Account",
        subtitle: "Automate chats, campaigns, and engagement on WhatsApp.",
        button_text: "Sign up",
        login_text: "Already using Wapi?",
        login_link_text: "Sign in here",
        side_panel: {
          badge: "Start Your Free Trial",
          title: "Join 10,000+ businesses growing with us",
          description: "Everything you need to manage customer relationships and scale your WhatsApp business operations.",
          bullets: [
            { title: "Shared team inbox & multi-agent access", points: [] },
            { title: "WhatsApp campaign & broadcast tools", points: [] },
            { title: "Smart automation workflows & chatbots", points: [] },
            { title: "Real-time delivery & engagement analytics", points: [] },
            { title: "Official API integrations & webhooks", points: [] },
            { title: "Smart AI template suggestions", points: [] }
          ],
          footer: [
            { title: "99.9%", points: ["Uptime"] },
            { title: "10K+", points: ["Businesses onboarded"] },
            { title: "24/7", points: ["Expert support"] }
          ]
        }
      },
      forgot_password_page: {
        title: "Forgot Password?",
        subtitle: "No worries! Enter your email and we'll send you otp.",
        button_text: "Send OTP",
        back_to_login_text: "Back to login",
        login_link_text: "Sign in here",
        side_panel: {
          title: "Reset Your Password in 3 Easy Steps",
          description: "We'll help you regain access to your account securely and quickly.",
          bullets: [
            { title: "Enter Email", points: ["Provide your account email"] },
            { title: "Receive OTP", points: ["receive a verification OTP"] },
            { title: "Reset Password", points: ["Create new password"] }
          ],
          footer: [
            {
              title: "Your Security is Our Priority",
              points: ["All password reset requests are encrypted and verified through your registered email address."]
            }
          ]
        }
      },
      otp_page: {
        title: "Enter Verification Code",
        subtitle: "Code sent to",
        button_text: "Verify & Continue",
        resend_text: "Resend code",
        footer_text: "Need help? Contact support@wapi.com",
        side_panel: {
          title: "Verify Your Email Address",
          description: "We've sent a 6-digit verification code to keep your account secure.",
          bullets: [
            { title: "Check Your Inbox", points: ["We sent the code to email"] },
            { title: "Valid for 10 Minutes", points: ["The code expires soon. Request a new one if needed."] }
          ],
          footer: [
            {
              title: "Didn't receive it?",
              points: [
                "Check your spam or junk folder",
                "Ensure email is correct",
                "Wait a moment and request a new code"
              ]
            }
          ]
        }
      },
      reset_password_page: {
        title: "Reset Your Password",
        subtitle: "Creating new password for email",
        button_text: "Reset Password",
        back_to_login_text: "Remember your password?",
        login_link_text: "Sign in here",
        side_panel: {
          badge: "Secure Password Reset",
          title: "Create a Strong New Password",
          description: "Protect your account with a secure password that meets our security standards.",
          bullets: [
            {
              title: "Password Best Practices",
              points: [
                "Use a unique password not used elsewhere",
                "Mix uppercase, lowercase, numbers & symbols",
                "Avoid personal information or common words",
                "Consider using a password manager"
              ]
            }
          ],
          footer: [
            { title: "Bank-level encryption", points: [] },
            { title: "Two-factor authentication", points: [] },
            { title: "Session monitoring", points: [] },
            { title: "Activity logs", points: [] }
          ]
        }
      }
    };

    await AuthPageSetup.findOneAndUpdate({}, authData, { upsert: true, returnDocument: 'after' });

    console.log('Auth Page Setup seeded successfully!');
  } catch (error) {
    console.error('Error seeding Auth Page Setup:', error);
  }
};

export default seedAuthPageSetup;
