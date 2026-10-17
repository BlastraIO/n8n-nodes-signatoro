import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IExecuteFunctions,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

const BASE_URL = 'https://signatoro.com';

/**
 * Errors the API answers when the email can still go out without a
 * signature: nothing saved yet (404) or a Free month used up (429). The
 * API's own next_step for both is "send without the signature".
 */
const SEND_WITHOUT = new Set([404, 429]);

type SignatureReply = IDataObject & {
	html: string;
	text: string;
	agent?: { disclosure?: { label?: string | null } };
};

export class Signatoro implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Signatoro',
		name: 'signatoro',
		icon: { light: 'file:signatoro.svg', dark: 'file:signatoro.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] === "list" ? "List signatures" : "Get signature"}}',
		description:
			"Add the email signature saved on Signatoro, a person's or an AI agent's with its AI disclosure line, to emails your workflow or agent sends",
		defaults: {
			name: 'Signatoro',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'signatoroApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [{ name: 'Signature', value: 'signature' }],
				default: 'signature',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['signature'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get a signature',
						description:
							"Get the saved signature as HTML and text, with the sender's details, to add after the email body",
					},
					{
						name: 'List',
						value: 'list',
						action: 'List signatures',
						description:
							"List the signatures this API key can send with: yours and your AI agents'",
					},
				],
				default: 'get',
			},
			{
				displayName: 'Signature Name or ID',
				name: 'signature',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getSignatures' },
				displayOptions: { show: { resource: ['signature'], operation: ['get'] } },
				default: 'me',
				description:
					'Whose signature: yours, or one of your AI agents\' (signed as the agent, with its AI disclosure line). A key made for an agent always signs as that agent. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				displayOptions: { show: { resource: ['signature'], operation: ['get'] } },
				options: [
					{
						name: 'Full',
						value: 'full',
						description: 'Phone, email, every link and the picture',
					},
					{
						name: 'Short',
						value: 'short',
						description: 'Name, role line and one link, no picture: for first-touch outreach',
					},
				],
				default: 'full',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				displayOptions: { show: { resource: ['signature'], operation: ['get'] } },
				default: {},
				options: [
					{
						displayName: 'Email Body (HTML)',
						name: 'htmlBody',
						type: 'string',
						typeOptions: { rows: 4 },
						default: '',
						description:
							"The email's HTML body. Returned as bodyHtml with the signature added after it, ready for the send step's message field.",
					},
					{
						displayName: 'Email Body (Text)',
						name: 'textBody',
						type: 'string',
						typeOptions: { rows: 4 },
						default: '',
						description:
							"The email's plain-text body. Returned as bodyText with the signature added after it.",
					},
					{
						displayName: 'Put AI Label at the Top',
						name: 'labelFirst',
						type: 'boolean',
						default: true,
						description:
							'Whether an AI agent\'s signature also puts its AI label ("This email was written and sent by ..., an AI assistant, on behalf of ...") as the first line of bodyHtml and bodyText. Only agent signatures have one.',
					},
					{
						displayName: 'Send Without Signature If Unavailable',
						name: 'passThrough',
						type: 'boolean',
						default: true,
						description:
							"Whether to output an empty signature, with the reason in unavailable, when no signature is saved yet or the Free plan's monthly requests are used up, so the email still goes out. Off: the node fails instead.",
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getSignatures(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const reply = (await this.helpers.httpRequestWithAuthentication.call(this, 'signatoroApi', {
					method: 'GET',
					url: `${BASE_URL}/api/v1/signatures`,
					json: true,
				})) as { choices: Array<{ signature: string; name: string; preview?: string | null }> };

				return reply.choices.map((choice) => ({
					name: choice.name,
					value: choice.signature,
					description: choice.preview ?? undefined,
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'list') {
					const reply = await request(this, '/api/v1/signatures', {});

					out.push({ json: reply, pairedItem: { item: i } });
					continue;
				}

				const signature = this.getNodeParameter('signature', i, 'me') as string;
				const mode = this.getNodeParameter('mode', i, 'full') as string;
				const options = this.getNodeParameter('options', i, {}) as {
					htmlBody?: string;
					textBody?: string;
					labelFirst?: boolean;
					passThrough?: boolean;
				};

				let reply: SignatureReply;

				try {
					reply = (await request(this, '/api/v1/signature', {
						mode,
						...(signature && signature !== 'me' ? { signature } : {}),
					})) as SignatureReply;
				} catch (error) {
					const status = statusOf(error);

					if (options.passThrough === false || !status || !SEND_WITHOUT.has(status)) {
						throw apiError(this, error, i);
					}

					// Sent without a signature, never with an invented one.
					reply = {
						html: '',
						text: '',
						unavailable: (bodyOf(error) ?? { error: String(status) }) as IDataObject,
					};
				}

				const label =
					options.labelFirst !== false ? (reply.agent?.disclosure?.label ?? null) : null;

				out.push({
					json: {
						...reply,
						...withBody(options.htmlBody, reply.html, label, 'html'),
						...withBody(options.textBody, reply.text, label, 'text'),
					},
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					const e = error as { message?: string; description?: string };

					out.push({
						json: {
							error: e.message,
							...(e.description ? { description: e.description } : {}),
							...(bodyOf(error) ?? {}),
						},
						pairedItem: { item: i },
					});
					continue;
				}

				throw apiError(this, error, i);
			}
		}

		return [out];
	}
}

/**
 * An n8n API error carrying the item it failed on. The request helper
 * already throws NodeApiError, and wrapping one again returns it as is,
 * ignoring itemIndex, so set it on the error itself.
 */
function apiError(ctx: IExecuteFunctions, error: unknown, itemIndex: number) {
	if (error instanceof NodeApiError) {
		error.context.itemIndex = itemIndex;
		return error;
	}

	return new NodeApiError(ctx.getNode(), error as JsonObject, { itemIndex });
}

async function request(
	ctx: IExecuteFunctions,
	path: string,
	qs: IDataObject,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method: 'GET',
		url: `${BASE_URL}${path}`,
		qs,
		json: true,
	};

	return (await ctx.helpers.httpRequestWithAuthentication.call(
		ctx,
		'signatoroApi',
		options,
	)) as IDataObject;
}

/** The body with the signature after it, and the AI label first if any. */
function withBody(
	body: string | undefined,
	signature: string,
	label: string | null,
	kind: 'html' | 'text',
): IDataObject {
	if (body === undefined || body === '') {
		return {};
	}

	if (kind === 'html') {
		const top = label ? `<p>${escapeHtml(label)}</p>\n` : '';
		const bottom = signature ? `\n<br>\n${signature}` : '';

		return { bodyHtml: `${top}${body}${bottom}` };
	}

	const top = label ? `${label}\n\n` : '';
	const bottom = signature ? `\n\n${signature}` : '';

	return { bodyText: `${top}${body}${bottom}` };
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function statusOf(error: unknown): number | undefined {
	const e = error as {
		httpCode?: string;
		response?: { status?: number };
		cause?: { response?: { status?: number } };
	};
	const code = e.httpCode ?? e.response?.status ?? e.cause?.response?.status;

	return code === undefined ? undefined : Number(code);
}

function bodyOf(error: unknown): IDataObject | undefined {
	const e = error as {
		response?: { data?: unknown; body?: unknown };
		cause?: { response?: { data?: unknown; body?: unknown } };
	};
	const data =
		e.response?.data ?? e.response?.body ?? e.cause?.response?.data ?? e.cause?.response?.body;

	return data && typeof data === 'object' ? (data as IDataObject) : undefined;
}
