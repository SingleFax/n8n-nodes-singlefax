import type {
  IDataObject,
  IHookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from 'n8n-workflow'
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow'
import { singlefaxIcon } from '../icons'
import { headerValue, rawRequestBody, verifySingleFaxSignature } from '../../src/api'

const DELIVERY_EVENTS = new Set(['fax.delivered', 'fax.failed'])

export class SingleFaxDelivered implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'SingleFax Fax Delivered',
    name: 'singleFaxDelivered',
    icon: singlefaxIcon,
    group: ['trigger'],
    version: 1,
    subtitle: 'Webhook',
    description: 'Starts when SingleFax reports fax.delivered or fax.failed. Paste this production URL into Dashboard → Webhooks and store the signing secret on the credential. Not for protected health information.',
    defaults: { name: 'On Fax Delivered' },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
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

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        return true
      },
      async create(this: IHookFunctions): Promise<boolean> {
        // SingleFax registers webhook URLs in the dashboard; there is no API to create them.
        return true
      },
      async delete(this: IHookFunctions): Promise<boolean> {
        return true
      },
    },
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
