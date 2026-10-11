import assert from 'node:assert/strict'
import test from 'node:test'
import { errorMessage } from '../src/services/errorMessage.ts'

test('shows the invalid field without echoing the input', () => {
  assert.equal(errorMessage({ detail: [{ loc: ['body', 'defect_type'], msg: 'required text is empty', input: 'PRIVATE' }] }, 422), 'defect_type: required text is empty')
})
test('joins report blockers', () => {
  assert.equal(errorMessage({ detail: { errors: ['Missing photo', 'Incomplete header'] } }, 409), 'Missing photo; Incomplete header')
})
test('keeps upload and server detail', () => {
  assert.equal(errorMessage({ detail: 'Photo exceeds 20 MB' }, 413), 'Photo exceeds 20 MB')
})
test('handles malformed responses', () => {
  for (const body of [null, {}, { detail: [] }, { detail: [{}] }, { detail: { errors: [null, 12] } }]) assert.equal(errorMessage(body, 500), 'HTTP 500')
})
