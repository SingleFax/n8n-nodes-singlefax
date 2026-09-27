import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import {
  assertPublicHttpsUrl,
  buildRequest,
  quoteBody,
  selectNewReceivedFaxes,
  sendFax,
  sendIdempotencyKey,
  verifySingleFaxSignature,
} from './api.ts'

describe('verifySingleFaxSignature', () => {
  const secret = 'whsec_test'
  const payload = '{"type":"fax.delivered"}'
  const now = 1_700_000_000

  function header(body = payload, key = secret, timestamp = now) {
    const sig = createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex')
    return `t=${timestamp},v1=${sig}`
  }

  it('accepts a fresh signature', () => {
    assert.equal(verifySingleFaxSignature(payload, header(), secret, 300, now), true)
  })

  it('rejects a wrong secret, a stale timestamp, and a short signature', () => {
    assert.equal(verifySingleFaxSignature(payload, header(payload, 'other'), secret, 300, now), false)
    assert.equal(verifySingleFaxSignature(payload, header(payload, secret, now - 301), secret, 300, now), false)
    assert.equal(verifySingleFaxSignature(payload, `t=${now},v1=abcd`, secret, 300, now), false)
  })
})

describe('buildRequest', () => {
  it('sets the bearer token and idempotency header on send', () => {
    const built = buildRequest('sf_live_abc', {
      method: 'POST',
      path: '/api/v1/faxes',
      json: { to: '+14155552671', uploadToken: 'tok' },
      idempotencyKey: 'n8n:exec:0',
    })
    assert.equal(built.url, 'https://api.singlefax.com/api/v1/faxes')
    assert.equal(built.headers.authorization, 'Bearer sf_live_abc')
    assert.equal(built.headers['idempotency-key'], 'n8n:exec:0')
    assert.equal(built.headers['content-type'], 'application/json')
    assert.equal(built.body, JSON.stringify({ to: '+14155552671', uploadToken: 'tok' }))
  })

  it('keeps an absolute upload URL', () => {
    const built = buildRequest('k', {
      method: 'PUT',
      path: 'https://api.singlefax.com/api/v1/uploads/tok',
      raw: new Uint8Array([1, 2]),
      contentType: 'application/pdf',
    })
    assert.equal(built.url, 'https://api.singlefax.com/api/v1/uploads/tok')
    assert.equal(built.headers['content-type'], 'application/pdf')
    assert.ok(built.body instanceof Uint8Array)
  })
})

describe('quoteBody', () => {
  it('omits pages when they are missing', () => {
    assert.deepEqual(quoteBody({ to: '+14155552671' }), { to: '+14155552671' })
    assert.deepEqual(quoteBody({ to: '+14155552671', pages: 3 }), { to: '+14155552671', pages: 3 })
  })
})

describe('sendIdempotencyKey', () => {
  it('is stable for one execution item and empty without an execution id', () => {
    assert.equal(sendIdempotencyKey('exec-1', 2), 'n8n:exec-1:2')
    assert.equal(sendIdempotencyKey('  ', 0), '')
  })
})

describe('assertPublicHttpsUrl', () => {
  it('allows a public https URL and rejects private hosts', () => {
    assert.equal(assertPublicHttpsUrl('https://cdn.example.com/a.pdf').hostname, 'cdn.example.com')
    assert.throws(() => assertPublicHttpsUrl('http://cdn.example.com/a.pdf'))
    assert.throws(() => assertPublicHttpsUrl('https://127.0.0.1/a.pdf'))
    assert.throws(() => assertPublicHttpsUrl('https://10.0.0.5/a.pdf'))
    assert.throws(() => assertPublicHttpsUrl('https://localhost/a.pdf'))
  })
})

describe('selectNewReceivedFaxes', () => {
  const rows = [{ id: 'a' }, { id: 'b' }]

  it('records the first page without emitting it', () => {
    const first = selectNewReceivedFaxes({ initialized: false, seenIds: [] }, rows)
    assert.deepEqual(first.emit, [])
    assert.deepEqual(first.state.seenIds, ['a', 'b'])
    const next = selectNewReceivedFaxes(first.state, [{ id: 'b' }, { id: 'c' }])
    assert.deepEqual(next.emit, [{ id: 'c' }])
  })
})

describe('sendFax', () => {
  it('uploads then posts the fax with the upload token', async () => {
    const calls: string[] = []
    const client = {
      request: async <T>(input: { method: string; path: string; json?: unknown; idempotencyKey?: string }): Promise<T> => {
        calls.push(`${input.method} ${input.path}`)
        if (input.path === '/api/v1/uploads') {
          return { uploadToken: 'tok', uploadUrl: 'https://api.singlefax.com/api/v1/uploads/tok' } as T
        }
        if (input.method === 'POST') {
          assert.equal((input.json as { uploadToken: string }).uploadToken, 'tok')
          assert.equal(input.idempotencyKey, 'n8n:exec:0')
          return { id: 'fax_1', fulfillmentStatus: 'queued' } as T
        }
        return {} as T
      },
    }
    const result = await sendFax(client, {
      to: '+14155552671',
      bytes: new Uint8Array([37, 80, 68, 70]),
      contentType: 'application/pdf',
      filename: 'note.pdf',
      cover: false,
      idempotencyKey: 'n8n:exec:0',
    })
    assert.deepEqual(calls, [
      'POST /api/v1/uploads',
      'PUT https://api.singlefax.com/api/v1/uploads/tok',
      'POST /api/v1/faxes',
    ])
    assert.deepEqual(result, { id: 'fax_1', fulfillmentStatus: 'queued' })
  })
})
