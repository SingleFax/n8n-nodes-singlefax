import type {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'
import { headerValue, rawRequestBody, verifySingleFaxSignature } from '../../src/api'

const DELIVERY_EVENTS = new Set(['fax.delivered', 'fax.failed'])

export class SingleFaxDelivered implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'SingleFax Fax Delivered',
    name: 'singleFaxDelivered',
    icon: 'file:singlefax.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts when SingleFax reports fax.delivered or fax.failed. Paste this production URL into Dashboard → Webhooks and store the signing secret on the credential. Not for protected health information.',
    defaults: { name: 'On Fax Delivered' },
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'singleFaxApi', required: true }],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'singlefax',
      },
    ],
    properties: [
      {
        displayName: 'Enable fax.delivered and fax.failed on the dashboard endpoint. Other event types are acknowledged and ignored.',
        name: 'notice',
        type: 'notice',
        default: '',
      },
    ],
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const credentials = await this.getCredentials('singleFaxApi')
    const secret = String(credentials.webhookSecret || '')
    if (!secret.trim()) {
      throw new NodeOperationError(this.getNode(), 'Webhook signing secret is required')
    }
    const req = this.getRequestObject() as { rawBody?: Buffer | string; body?: unknown }
    const raw = rawRequestBody(req)
    const signature = headerValue(this.getHeaderData() as Record<string, string | string[] | undefined>, 'singlefax-signature')
    if (!raw || !verifySingleFaxSignature(raw, signature, secret)) {
      return { webhookResponse: { statusCode: 401, body: { ok: false } } }
    }
    let event: { type?: string }
    try {
      event = JSON.parse(raw) as { type?: string }
    } catch {
      return { webhookResponse: { statusCode: 400, body: { ok: false } } }
    }
    if (!event.type || !DELIVERY_EVENTS.has(event.type)) {
      return { webhookResponse: { statusCode: 200, body: { ignored: true } } }
    }
    return { workflowData: [[{ json: event as IDataObject }]] }
  }
}
