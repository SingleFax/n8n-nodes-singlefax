import { randomUUID } from 'node:crypto'
import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow'
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow'
import { singlefaxIcon } from '../icons'
import {
  contentTypeForFilename,
  createClient,
  downloadPublicHttps,
  quoteBody,
  sendFax,
  sendIdempotencyKey,
  SingleFaxApiError,
  type ReceivedFaxPage,
} from '../../src/api'

const PHI_NOTICE =
  'Not Secure Mode. Do not send protected health information. HIPAA stays on the SingleFax website.'

export class SingleFax implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'SingleFax',
    name: 'singleFax',
    icon: singlefaxIcon,
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: `Send a fax, check status, or read the inbox. ${PHI_NOTICE}`,
    defaults: { name: 'SingleFax' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'singleFaxApi', required: true }],
    properties: [
      {
        displayName: PHI_NOTICE,
        name: 'notice',
        type: 'notice',
        default: '',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'send',
        options: [
          { name: 'Get Credits', value: 'credits', action: 'Get credits' },
          { name: 'Get Fax Status', value: 'status', action: 'Get fax status' },
          { name: 'List Received Faxes', value: 'listReceived', action: 'List received faxes' },
          { name: 'Quote Fax', value: 'quote', action: 'Quote a fax' },
          { name: 'Send Fax', value: 'send', action: 'Send a fax' },
        ],
      },
      {
        displayName: 'To',
        name: 'to',
        type: 'string',
        default: '',
        required: true,
        placeholder: '+14155552671',
        description: 'Destination fax number in E.164',
        displayOptions: { show: { operation: ['send', 'quote'] } },
      },
      {
        displayName: 'File Source',
        name: 'source',
        type: 'options',
        default: 'binary',
        options: [
          { name: 'Binary File', value: 'binary' },
          { name: 'Public HTTPS URL', value: 'url' },
        ],
        displayOptions: { show: { operation: ['send'] } },
      },
      {
        displayName: 'Binary Property',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        description: 'Name of the binary property that holds the file',
        displayOptions: { show: { operation: ['send'], source: ['binary'] } },
      },
      {
        displayName: 'File URL',
        name: 'fileUrl',
        type: 'string',
        default: '',
        description: 'Public https URL of the original file. Do not convert it to PDF first.',
        displayOptions: { show: { operation: ['send'], source: ['url'] } },
      },
      {
        displayName: 'Include Cover Page',
        name: 'cover',
        type: 'boolean',
        default: false,
        displayOptions: { show: { operation: ['send'] } },
      },
      {
        displayName: 'Fax ID',
        name: 'faxId',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['status'] } },
      },
      {
        displayName: 'Pages',
        name: 'pages',
        type: 'number',
        default: 0,
        description: 'Assumed billable pages. Leave 0 to let SingleFax assume the default.',
        displayOptions: { show: { operation: ['quote'] } },
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 50 },
        default: 50,
        description: 'Max number of results to return',
        displayOptions: { show: { operation: ['listReceived'] } },
      },
      {
        displayName: 'Cursor',
        name: 'cursor',
        type: 'string',
        default: '',
        description: 'Next cursor from a previous page. Leave empty for the first page.',
        displayOptions: { show: { operation: ['listReceived'] } },
      },
    ],
  }

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData()
    const returnData: INodeExecutionData[] = []
    const operation = this.getNodeParameter('operation', 0) as string
    const credentials = await this.getCredentials('singleFaxApi')
    const apiKey = String(credentials.apiKey || '')
    if (!apiKey.trim()) {
      throw new NodeOperationError(this.getNode(), 'SingleFax API key is required')
    }
    const client = createClient({ apiKey })

    for (let i = 0; i < items.length; i++) {
      try {
        let json: IDataObject
        if (operation === 'send') {
          const to = this.getNodeParameter('to', i) as string
          const source = this.getNodeParameter('source', i) as string
          const cover = this.getNodeParameter('cover', i) as boolean
          const file = source === 'url'
            ? await downloadPublicHttps(this.getNodeParameter('fileUrl', i) as string)
            : await binaryFile(this, i)
          const executionId = this.getExecutionId()
          const idempotencyKey = sendIdempotencyKey(executionId, i) || randomUUID()
          json = (await sendFax(client, {
            to,
            bytes: file.bytes,
            contentType: file.contentType,
            filename: file.filename,
            cover,
            idempotencyKey,
          })) as IDataObject
        } else if (operation === 'status') {
          const faxId = this.getNodeParameter('faxId', i) as string
          json = await client.request<IDataObject>({
            method: 'GET',
            path: `/api/v1/faxes/${encodeURIComponent(faxId)}`,
          })
        } else if (operation === 'quote') {
          const to = this.getNodeParameter('to', i) as string
          const pages = this.getNodeParameter('pages', i) as number
          json = await client.request<IDataObject>({
            method: 'POST',
            path: '/api/v1/faxes/quote',
            json: quoteBody({ to, pages }),
          })
        } else if (operation === 'credits') {
          json = await client.request<IDataObject>({ method: 'GET', path: '/api/v1/credits' })
        } else if (operation === 'listReceived') {
          const limit = this.getNodeParameter('limit', i) as number
          const cursor = String(this.getNodeParameter('cursor', i) || '')
          const params = new URLSearchParams({ limit: String(Math.min(Math.max(limit || 20, 1), 50)) })
          if (cursor) params.set('cursor', cursor)
          json = await client.request<ReceivedFaxPage>({
            method: 'GET',
            path: `/api/v1/received-faxes?${params.toString()}`,
          }) as IDataObject
        } else {
          throw new NodeOperationError(this.getNode(), `Unknown operation ${operation}`)
        }
        returnData.push({ json, pairedItem: { item: i } })
      } catch (error) {
        if (this.continueOnFail()) {
          const message = error instanceof Error ? error.message : String(error)
          returnData.push({ json: { error: message }, pairedItem: { item: i } })
          continue
        }
        const message = error instanceof SingleFaxApiError
          ? error.message
          : error instanceof NodeOperationError
            ? error.message
            : error instanceof Error
              ? error.message
              : String(error)
        throw new NodeOperationError(this.getNode(), message, { itemIndex: i })
      }
    }

    return [returnData]
  }
}

async function binaryFile(ctx: IExecuteFunctions, itemIndex: number): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const property = ctx.getNodeParameter('binaryPropertyName', itemIndex) as string
  const binary = ctx.getInputData()[itemIndex]?.binary?.[property]
  if (!binary) {
    throw new NodeOperationError(ctx.getNode(), `No binary data on property "${property}"`, { itemIndex })
  }
  const buffer = await ctx.helpers.getBinaryDataBuffer(itemIndex, property)
  const filename = binary.fileName || 'document.pdf'
  return {
    bytes: new Uint8Array(buffer),
    contentType: binary.mimeType || contentTypeForFilename(filename),
    filename,
  }
}
