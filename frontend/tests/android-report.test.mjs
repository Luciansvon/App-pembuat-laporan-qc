import assert from 'node:assert/strict'
import test from 'node:test'
import { androidReport } from '../src/services/android.ts'

function harness() {
  const surface = new EventTarget()
  surface.setTimeout = setTimeout
  surface.clearTimeout = clearTimeout
  surface.location = { href: '' }
  globalThis.window = surface
  const reply = (detail) => surface.dispatchEvent(new CustomEvent('inspectra-report-result', { detail }))
  const token = () => new URL(surface.location.href).searchParams.get('token')
  return { surface, reply, token }
}

test('export waits for its native result and ignores unrelated messages', async () => {
  const { reply, token } = harness()
  let finished = false
  const promise = androidReport('inspection-id', 'download').then((value) => { finished = true; return value })
  reply(null)
  reply({ token: 'other-operation', status: 'saved' })
  await Promise.resolve()
  assert.equal(finished, false)
  reply({ token: token(), status: 'saved' })
  assert.equal(await promise, 'saved')
})

test('cancellation stays distinct from saved and a new export can succeed', async () => {
  const { reply, token } = harness()
  const cancelled = androidReport('inspection-id', 'download')
  const oldToken = token()
  reply({ token: oldToken, status: 'cancelled' })
  assert.equal(await cancelled, 'cancelled')
  const opened = androidReport('inspection-id', 'open')
  assert.notEqual(token(), oldToken)
  reply({ token: token(), status: 'opened' })
  assert.equal(await opened, 'opened')
})

test('native failures reject with the actionable message', async () => {
  const { reply, token } = harness()
  const promise = androidReport('inspection-id', 'download')
  reply({ token: token(), status: 'error', message: 'Pilih lokasi lain.' })
  await assert.rejects(promise, /Pilih lokasi lain/)
})
