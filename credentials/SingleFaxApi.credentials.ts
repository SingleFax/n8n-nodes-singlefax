import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow'
import { singlefaxIcon } from '../nodes/icons'

export class SingleFaxApi implements ICredentialType {
  name = 'singleFaxApi'

  displayName = 'SingleFax API'

  icon = singlefaxIcon

  documentationUrl = 'https://singlefax.com/developers'

  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description: 'Dashboard API key. Send and status need fax:send and fax:read. Inbox needs inbox:read. Credits need credits:read.',
    },
    {
      displayName: 'Webhook Signing Secret',
      name: 'webhookSecret',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      description: 'whsec_… shown once when you add the delivery trigger URL under Dashboard → Webhooks. Leave blank if you only send or poll.',
    },
  ]

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.apiKey}}',
      },
    },
  }

  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://api.singlefax.com',
      url: '/api/v1/faxes?limit=1',
    },
  }
}
