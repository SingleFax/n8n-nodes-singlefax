import type {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IPollFunctions,
} from 'n8n-workflow'
import { NodeOperationError } from 'n8n-workflow'
import {
  createClient,
  selectNewReceivedFaxes,
  SingleFaxApiError,
  type ReceivedFaxPage,
  type ReceivedFaxRow,
} from '../../src/api'

export class SingleFaxReceived implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'SingleFax Received Fax',
    name: 'singleFaxReceived',
    icon: 'file:singlefax.svg',
    group: ['trigger'],
    version: 1,
    description: 'Starts when a new fax is in the inbox. The first run records faxes already there and does not emit them. Not for protected health information.',
    defaults: { name: 'On Received Fax' },
    inputs: [],
    outputs: ['main'],
    credentials: [{ name: 'singleFaxApi', required: true }],
    polling: true,
    properties: [
      {
        displayName: 'Polls GET /api/v1/received-faxes. The API key needs inbox:read. Held and HIPAA rows are envelope only.',
        name: 'notice',
        type: 'notice',
        default: '',
      },
    ],
  }

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const credentials = await this.getCredentials('singleFaxApi')
    const apiKey = String(credentials.apiKey || '')
    if (!apiKey.trim()) {
      throw new NodeOperationError(this.getNode(), 'SingleFax API key is required')
    }
    const client = createClient({ apiKey })
    let page: ReceivedFaxPage
    try {
      page = await client.request<ReceivedFaxPage>({
        method: 'GET',
        path: '/api/v1/received-faxes?limit=50',
      })
    } catch (error) {
      const message = error instanceof SingleFaxApiError ? error.message : error instanceof Error ? error.message : String(error)
      throw new NodeOperationError(this.getNode(), message)
    }
    const staticData = this.getWorkflowStaticData('node') as {
      initialized?: boolean
      seenIds?: string[]
    }
    const selected = selectNewReceivedFaxes(
      { initialized: Boolean(staticData.initialized), seenIds: staticData.seenIds ?? [] },
      (page.data ?? []) as ReceivedFaxRow[],
    )
    staticData.initialized = selected.state.initialized
    staticData.seenIds = selected.state.seenIds
    if (selected.emit.length === 0) return null
    return [selected.emit.map((row) => ({ json: row as unknown as IDataObject }))]
  }
}
