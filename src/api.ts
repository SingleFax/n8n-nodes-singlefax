import { createHmac, timingSafeEqual } from 'node:crypto'

export const SINGLEFAX_API_ORIGIN = 'https://api.singlefax.com'
const MAX_BYTES = 10_000_000

export class SingleFaxApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'SingleFaxApiError'
  }
}

export type ApiRequest = {
  method: string
  path: string
  json?: unknown
  raw?: Uint8Array
  contentType?: string
  idempotencyKey?: string
}

export type BuiltRequest = {
  url: string
  method: string
  headers: Record<string, string>
  body?: string | Uint8Array
}

export type UploadCreated = {
  uploadToken: string
  uploadUrl: string
  contentType?: string
  maxBytes?: number
}

export type ReceivedFaxRow = {
  id: string
  [key: string]: unknown
}

export type ReceivedFaxPage = {
  data?: ReceivedFaxRow[]
  nextCursor?: string | null
  limit?: number
}

export function verifySingleFaxSignature(
  payload: string,
  signatureHeader: string,
  endpointSecret: string,
  toleranceSeconds = 5 * 60,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!payload || !signatureHeader || !endpointSecret) return false
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((kv) => {
      const eq = kv.indexOf('=')
      if (eq === -1) return [kv, '']
      return [kv.slice(0, eq).trim(), kv.slice(eq + 1).trim()]
    }),
  )
  const timestamp = Number(parts.t)
  const providedSig = parts.v1
  if (!Number.isFinite(timestamp) || !providedSig) return false
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false

  const expected = createHmac('sha256', endpointSecret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')
  const a = Buffer.from(providedSig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) continue
    if (Array.isArray(value)) return value[0] ?? ''
    return value ?? ''
  }
  return ''
}

export function rawRequestBody(req: { rawBody?: Buffer | string; body?: unknown }): string | null {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8')
  if (typeof req.rawBody === 'string') return req.rawBody
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  return null
}

export function buildRequest(apiKey: string, input: ApiRequest, origin = SINGLEFAX_API_ORIGIN): BuiltRequest {
  const base = origin.replace(/\/$/, '')
  const url = input.path.startsWith('http') ? input.path : `${base}${input.path}`
  const headers: Record<string, string> = { accept: 'application/json' }
  const key = apiKey.trim()
  if (key) headers.authorization = `Bearer ${key}`
  let body: string | Uint8Array | undefined
  if (input.raw) {
    headers['content-type'] = input.contentType || 'application/octet-stream'
    body = input.raw
  } else if (input.json !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(input.json)
  }
  if (input.idempotencyKey) headers['idempotency-key'] = input.idempotencyKey
  return { url, method: input.method, headers, body }
}

export function quoteBody(input: { to: string; pages?: number }): { to: string; pages?: number } {
  const body: { to: string; pages?: number } = { to: input.to }
  if (typeof input.pages === 'number' && Number.isFinite(input.pages) && input.pages > 0) {
    body.pages = Math.floor(input.pages)
  }
  return body
}

export function sendIdempotencyKey(executionId: string, itemIndex: number): string {
  const id = executionId.trim()
  if (!id) return ''
  return `n8n:${id}:${itemIndex}`
}

function isPrivateIp(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '')
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('File URL must be a public https URL')
  }
  if (url.protocol !== 'https:') throw new Error('File URL must use https')
  const host = url.hostname.toLowerCase()
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    isPrivateIp(host)
  ) {
    throw new Error('File URL must be a public https URL')
  }
  return url
}

export function contentTypeForFilename(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  switch (ext) {
    case '.pdf':
      return 'application/pdf'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    case '.heic':
      return 'image/heic'
    case '.tif':
    case '.tiff':
      return 'image/tiff'
    case '.doc':
      return 'application/msword'
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.xls':
      return 'application/vnd.ms-excel'
    case '.xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.ppt':
      return 'application/vnd.ms-powerpoint'
    case '.pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case '.txt':
      return 'text/plain'
    case '.rtf':
      return 'application/rtf'
    default:
      return 'application/octet-stream'
  }
}

export function selectNewReceivedFaxes<T extends { id: string }>(
  state: { initialized: boolean; seenIds: string[] },
  rows: T[],
  cap = 500,
): { state: { initialized: true; seenIds: string[] }; emit: T[] } {
  const seen = new Set(state.seenIds)
  const emit = state.initialized ? rows.filter((row) => row.id && !seen.has(row.id)) : []
  for (const row of rows) {
    if (row.id) seen.add(row.id)
  }
  const seenIds = [...seen].slice(-cap)
  return { state: { initialized: true, seenIds }, emit }
}

type FetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: string | Uint8Array
  redirect?: 'manual'
}

type FetchLike = (url: string, init?: FetchInit) => Promise<Response>

function formatError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const row = body as { statusMessage?: string; message?: string }
    return row.statusMessage || row.message || `HTTP ${status}`
  }
  return `HTTP ${status}`
}

export function createClient(opts: { apiKey: string; fetch?: FetchLike; origin?: string }) {
  const doFetch = opts.fetch ?? globalThis.fetch
  const origin = opts.origin ?? SINGLEFAX_API_ORIGIN

  async function request<T>(input: ApiRequest): Promise<T> {
    const built = buildRequest(opts.apiKey, input, origin)
    const res = await doFetch(built.url, {
      method: built.method,
      headers: built.headers,
      body: built.body,
    })
    const text = await res.text()
    let parsed: unknown = {}
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = { message: text }
      }
    }
    if (!res.ok) throw new SingleFaxApiError(formatError(res.status, parsed), res.status, parsed)
    return parsed as T
  }

  return { request }
}

export async function sendFax(
  client: { request: <T>(input: ApiRequest) => Promise<T> },
  input: {
    to: string
    bytes: Uint8Array
    contentType: string
    filename: string
    cover: boolean
    idempotencyKey: string
  },
): Promise<unknown> {
  if (!input.to.trim()) throw new Error('Destination fax number is required')
  if (!input.idempotencyKey.trim()) throw new Error('Idempotency key is required')
  if (input.bytes.byteLength < 1) throw new Error('File is empty')
  if (input.bytes.byteLength > MAX_BYTES) throw new Error('File is larger than 10 MB')

  const upload = await client.request<UploadCreated>({
    method: 'POST',
    path: '/api/v1/uploads',
    json: { contentType: input.contentType, maxBytes: input.bytes.byteLength },
  })
  await client.request({
    method: 'PUT',
    path: upload.uploadUrl,
    raw: input.bytes,
    contentType: input.contentType,
  })
  return client.request({
    method: 'POST',
    path: '/api/v1/faxes',
    json: {
      to: input.to.trim(),
      uploadToken: upload.uploadToken,
      cover: input.cover,
      filename: input.filename,
      contentType: input.contentType,
    },
    idempotencyKey: input.idempotencyKey,
  })
}

export async function downloadPublicHttps(
  rawUrl: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  let current = assertPublicHttpsUrl(rawUrl).toString()
  for (let hop = 0; hop < 3; hop++) {
    const res = await fetchImpl(current, { redirect: 'manual' })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('File URL redirect had no location')
      current = assertPublicHttpsUrl(new URL(loc, current).toString()).toString()
      continue
    }
    if (!res.ok) throw new Error(`File download failed (${res.status})`)
    const advertised = Number(res.headers.get('content-length') || 0)
    if (advertised > MAX_BYTES) throw new Error('File is larger than 10 MB')
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength > MAX_BYTES) throw new Error('File is larger than 10 MB')
    if (bytes.byteLength < 1) throw new Error('File is empty')
    const headerType = (res.headers.get('content-type') || '').split(';')[0]!.trim()
    const filename = filenameFromUrl(current)
    return {
      bytes,
      contentType: headerType || contentTypeForFilename(filename),
      filename,
    }
  }
  throw new Error('Too many redirects')
}

function filenameFromUrl(raw: string): string {
  try {
    const base = new URL(raw).pathname.split('/').pop() || ''
    const name = decodeURIComponent(base)
    if (name && name !== '/') return name
  } catch {
    /* fall through */
  }
  return 'document.pdf'
}
