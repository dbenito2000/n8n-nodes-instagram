import { type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { userDescription } from './resources/user';
import { companyDescription } from './resources/company';

export class Instagram implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Instagram',
		name: 'instagram',
		icon: { light: 'file:instagram.svg', dark: 'file:instagram.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Instagram API',
		defaults: {
			name: 'Instagram',
		},
		usableAsTool: true,
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'instagramApi', required: true }],
		requestDefaults: {
			baseURL: 'https://graph.facebook.com/',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'User',
						value: 'user',
					},
					{
						name: 'Company',
						value: 'company',
					},
				],
				default: 'user',
			},
			...userDescription,
			...companyDescription,
		],
	};
}
