import mongoose from 'mongoose';

const bulletSchema = new mongoose.Schema({
    title: { type: String },
    points: [{ type: String }]
}, { _id: false });

const sidePanelSchema = new mongoose.Schema({
    badge: { type: String },
    title: { type: String },
    description: { type: String },
    bullets: [bulletSchema],
    footer: [bulletSchema]
}, { _id: false });

const loginPageSchema = new mongoose.Schema({
    title: { type: String },
    subtitle: { type: String },
    button_text: { type: String },
    forgot_password_text: { type: String },
    signup_text: { type: String },
    signup_link_text: { type: String },
    side_panel: sidePanelSchema
}, { _id: false });

const registerPageSchema = new mongoose.Schema({
    title: { type: String },
    subtitle: { type: String },
    button_text: { type: String },
    login_text: { type: String },
    login_link_text: { type: String },
    side_panel: sidePanelSchema
}, { _id: false });

const forgotPasswordPageSchema = new mongoose.Schema({
    title: { type: String },
    subtitle: { type: String },
    button_text: { type: String },
    back_to_login_text: { type: String },
    login_link_text: { type: String },
    side_panel: sidePanelSchema
}, { _id: false });

const otpPageSchema = new mongoose.Schema({
    title: { type: String },
    subtitle: { type: String },
    button_text: { type: String },
    resend_text: { type: String },
    footer_text: { type: String },
    side_panel: sidePanelSchema
}, { _id: false });

const resetPasswordPageSchema = new mongoose.Schema({
    title: { type: String },
    subtitle: { type: String },
    button_text: { type: String },
    back_to_login_text: { type: String },
    login_link_text: { type: String },
    side_panel: sidePanelSchema
}, { _id: false });

const authPageSetupSchema = new mongoose.Schema({
    login_page: loginPageSchema,
    register_page: registerPageSchema,
    forgot_password_page: forgotPasswordPageSchema,
    otp_page: otpPageSchema,
    reset_password_page: resetPasswordPageSchema
}, {
    timestamps: true
});

export default mongoose.model('AuthPageSetup', authPageSetupSchema);
