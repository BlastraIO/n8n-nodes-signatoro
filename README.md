# n8n-nodes-signatoro

Add the email signature saved on [Signatoro](https://signatoro.com) to the emails your n8n workflows and AI agents send: a person's own signature, or an AI agent's, which signs as the agent with a line saying it is an AI and whom it works for.

n8n's Gmail, Outlook and Send Email nodes send without the signature saved in Gmail or Outlook. Put this node before the send step and the email ends with the real saved signature: the name, title, phone and links come from what the person saved, never from what a model writes.

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Usage](#usage) · [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) and install `n8n-nodes-signatoro`.

## Credentials

1. Sign in on [signatoro.com](https://signatoro.com) (free) and save your signature.
2. On your signature page, open **For tools and assistants** and click **Generate API key**. For an AI assistant, generate the key for that assistant instead: a key made for an assistant always signs as it.
3. In n8n, create a **Signatoro API** credential and paste the key.

Testing the credential lists your signatures and does not count against the Free plan's monthly requests.

## Operations

**Signature > Get** returns the signature to add after the email body:

| Field | What it is |
| --- | --- |
| `html` | The signature as HTML, for an HTML email. |
| `text` | The same signature as plain text. |
| `sender` | The sender's details as fields (name, title, company, email, phone, website, links). Use only these for the sender anywhere in the email; a missing field stays out. |
| `agent` | Only for an AI agent's signature: its name, whom it acts for, and `disclosure.line` and `disclosure.label`. |
| `bodyHtml`, `bodyText` | When you fill **Email Body** in the options: your body with the signature after it, ready for the send node. |

Parameters:

- **Signature**: yours (`me`) or one of your AI agents', picked from a list.
- **Mode**: `Full` (phone, email, links and picture) or `Short` (name, role line and one link, for first-touch outreach).
- **Options**
  - **Email Body (HTML)** / **Email Body (Text)**: returns `bodyHtml` / `bodyText` with the signature added.
  - **Put AI Label at the Top** (on by default): for an agent's signature, `bodyHtml` and `bodyText` start with its label, such as "This email was written and sent by Ada, an AI assistant, on behalf of Maya Okafor."
  - **Send Without Signature If Unavailable** (on by default): when nothing is saved yet or a Free month's requests are used up, the node outputs an empty signature and the reason in `unavailable`, so the email still goes out without an invented one.

**Signature > List** returns the signatures the key can send with.

The node can also be used as a tool by n8n's AI Agent.

## Usage

The usual shape:

```
Trigger -> AI Agent (writes the email) -> Signatoro (Get, Email Body = {{ $json.output }}) -> Gmail (Message = {{ $json.bodyHtml }})
```

In the Gmail or Send Email node, set the email type to HTML. These nodes add "This email was sent automatically with n8n" unless you turn off **Append n8n Attribution**.

Full guide, with Zapier and Make too: [signatoro.com/docs/install-signature/agent/automations](https://signatoro.com/docs/install-signature/agent/automations).

## Compatibility

Built with `@n8n/node-cli` and tested on n8n 1.x. No runtime dependencies.

## Resources

- [Signatoro API guide](https://signatoro.com/docs/install-signature/agent)
- [OpenAPI document](https://signatoro.com/openapi.json)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE.md)
