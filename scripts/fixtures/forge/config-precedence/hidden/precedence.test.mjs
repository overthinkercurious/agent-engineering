import assert from 'node:assert/strict'
import test from 'node:test'
import { directConfig } from '../src/direct.mjs'
import { wrapperConfig } from '../src/wrapper.mjs'

test('explicit request values win for direct and wrapper callers', () => {
  assert.equal(directConfig({ mode: 'safe' }, { mode: 'fast' }).mode, 'fast')
  assert.equal(wrapperConfig({ configuration: { mode: 'safe' } }, { options: { mode: 'fast' } }).mode, 'fast')
})

test('stored defaults remain when request options are omitted', () => {
  assert.deepEqual(directConfig({ mode: 'safe', retries: 2 }), { mode: 'safe', retries: 2 })
})

test('explicit false is preserved and unrelated keys survive', () => {
  assert.deepEqual(
    directConfig({ enabled: true, storedOnly: 'keep' }, { enabled: false, requestOnly: 'keep' }),
    { enabled: false, storedOnly: 'keep', requestOnly: 'keep' },
  )
})
