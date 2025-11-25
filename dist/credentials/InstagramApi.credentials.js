"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramApi = void 0;
class InstagramApi {
    constructor() {
        this.name = 'instagramApi';
        this.displayName = 'Instagram API';
        this.icon = 'file:facebook.svg';
        this.documentationUrl = 'https://github.com/MookieLian/n8n-nodes-instagram#credentials';
        this.properties = [
            {
                displayName: 'Access Token',
                name: 'accessToken',
                type: 'string',
                typeOptions: { password: true },
                required: true,
                default: '',
                description: 'Instagram Graph API user access token with publish permissions',
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                qs: {
                    access_token: '={{$credentials.accessToken}}',
                },
            },
        };
        this.test = {
            request: {
                method: 'GET',
                url: 'https://graph.facebook.com/v22.0/me',
                qs: {
                    fields: 'id',
                },
            },
        };
    }
}
exports.InstagramApi = InstagramApi;
//# sourceMappingURL=InstagramApi.credentials.js.map