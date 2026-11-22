// Passkeys kept tidy (client/passkey.js, session 50): the WebAuthn Signal API, as the ticket page and Find my ticket
// use it. Each method only where the browser has it, never awaited, never throwing: Firefox has none, and Safari
// 26.0–26.1 never answered signalAllAcceptedCredentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signal, forgetPasskey, tidyPasskeys, handleOf, keepHandle } from '../client/passkey.js';

const RP = 'k7q2zp.thenutpub.com';
const USER = new Uint8Array(32).fill(7);
const USER_B64 = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc';

// A browser: the methods given, each recording its call and answering as told.
function browser(methods = ['signalUnknownCredential', 'signalAllAcceptedCredentials', 'signalCurrentUserDetails'], answer = () => Promise.resolve()) {
  const calls = [];
  globalThis.PublicKeyCredential = function PublicKeyCredential() {};
  for (const m of methods) globalThis.PublicKeyCredential[m] = (o) => { calls.push([m, o]); return answer(m); };
  return calls;
}

test('Find my ticket, a passkey whose night is over: the browser forgets it', () => {
  const calls = browser();
  assert.equal(forgetPasskey('cred-1', RP), true);
  assert.deepEqual(calls, [['signalUnknownCredential', { rpId: RP, credentialId: 'cred-1' }]]);
});

test('the ticket page: only this ticket\'s passkeys, by their current name; none once the ticket\'s gone', () => {
  let calls = browser();
  tidyPasskeys(USER, ['a', 'b'], 'Longy · The Fickle Pickle · ticket · 21 Nov', RP);
  assert.deepEqual(calls, [
    ['signalAllAcceptedCredentials', { rpId: RP, userId: USER_B64, allAcceptedCredentialIds: ['a', 'b'] }],
    ['signalCurrentUserDetails', { rpId: RP, userId: USER_B64, name: 'Longy · The Fickle Pickle · ticket · 21 Nov', displayName: 'Longy · The Fickle Pickle · ticket · 21 Nov' }],
  ]);
  calls = browser();
  tidyPasskeys(USER_B64, [], '', RP); // gone: an empty list, and no rename
  assert.deepEqual(calls, [['signalAllAcceptedCredentials', { rpId: RP, userId: USER_B64, allAcceptedCredentialIds: [] }]]);
  calls = browser();
  tidyPasskeys(null, ['a'], 'x', RP); // no user ID held in this browser: nothing to say
  assert.deepEqual(calls, []);
});

test('missing methods (Firefox), throwing ones and ones that never answer: the page carries on', async () => {
  delete globalThis.PublicKeyCredential;
  assert.equal(signal('signalUnknownCredential', {}), false);
  assert.doesNotThrow(() => tidyPasskeys(USER, ['a'], 'x', RP));
  browser(['signalCurrentUserDetails']); // only one of the three
  assert.equal(forgetPasskey('c', RP), false);
  assert.equal(signal('signalCurrentUserDetails', {}), true);
  browser(undefined, () => { throw new TypeError('bad options'); });
  assert.equal(signal('signalUnknownCredential', {}), false);
  let unhandled = 0;
  const count = () => { unhandled += 1; };
  process.on('unhandledRejection', count);
  browser(undefined, () => Promise.reject(new DOMException('no', 'SecurityError')));
  assert.equal(signal('signalUnknownCredential', {}), true);
  browser(undefined, () => new Promise(() => {})); // Safari 26.0's: never settles
  const t = Date.now();
  tidyPasskeys(USER, ['a'], 'x', RP);
  assert.ok(Date.now() - t < 50, 'waited for an answer');
  await new Promise((r) => setTimeout(r, 20));
  process.off('unhandledRejection', count);
  assert.equal(unhandled, 0);
  delete globalThis.PublicKeyCredential;
});

test('a Watch online ticket\'s user ID: kept on Find my ticket, read back for its pass only', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
  assert.equal(handleOf('p1'), null);
  keepHandle('p1', USER);
  assert.equal(handleOf('p1'), USER_B64);
  assert.equal(handleOf('p2'), null);
  store['nutpub-handle'] = 'not json';
  assert.equal(handleOf('p1'), null);
  delete globalThis.localStorage;
});
