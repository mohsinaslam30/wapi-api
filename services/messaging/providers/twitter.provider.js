// DISABLED: Twitter integration not working
// All Twitter provider functionality commented out

class TwitterProvider {
    constructor() {
        this.apiBaseUrl = 'https://api.twitter.com/2';
        this.uploadBaseUrl = 'https://upload.twitter.com/1.1';
    }

    async _getValidAccessToken() { throw new Error('Twitter integration is currently disabled.'); }
    async _refreshConnectionToken() { throw new Error('Twitter integration is currently disabled.'); }
    async resolveUserId() { throw new Error('Twitter integration is currently disabled.'); }
    _getAuthHeader() { return {}; }
    async sendTextMessage() { throw new Error('Twitter integration is currently disabled.'); }
    async sendMediaMessage() { throw new Error('Twitter integration is currently disabled.'); }
    async _uploadMedia() { throw new Error('Twitter integration is currently disabled.'); }
    async exchangeCodeForToken() { throw new Error('Twitter integration is currently disabled.'); }
    async refreshAccessToken() { throw new Error('Twitter integration is currently disabled.'); }
    async getUserProfile() { throw new Error('Twitter integration is currently disabled.'); }
    async revokeToken() { throw new Error('Twitter integration is currently disabled.'); }
    async getUserProfileSDK() { throw new Error('Twitter integration is currently disabled.'); }
    async sendTextMessageSDK() { throw new Error('Twitter integration is currently disabled.'); }
    async sendMediaMessageSDK() { throw new Error('Twitter integration is currently disabled.'); }
    async getDMEvents() { throw new Error('Twitter integration is currently disabled.'); }
    async getUserProfileById() { throw new Error('Twitter integration is currently disabled.'); }
}

export default new TwitterProvider();
