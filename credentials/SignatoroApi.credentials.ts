import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SignatoroApi implements ICredentialType {
	name = 'signatoroApi';

	displayName = 'Signatoro API';

	icon: Icon = { light: 'file:../icons/signatoro.svg', dark: 'file:../icons/signatoro.dark.svg' };

	documentationUrl = 'https://signatoro.com/docs/install-signature/agent';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'On signatoro.com, open your signature page, then "For tools and assistants" > "Generate API key". A key made for an AI agent always signs as that agent.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Lists the key's signatures: checks the key without fetching one, so
	// the test never counts against the Free plan's monthly requests.
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://signatoro.com',
			url: '/api/v1/signatures',
			method: 'GET',
		},
	};
}
