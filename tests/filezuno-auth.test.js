import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFilezunoAuth, isFilezunoCallback } from '../src/filezuno-auth.js';

function fixture() {
  const values = new Map(), calls = [];
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const user = { id: 'original-owner' }, session = { access_token: 'test', refresh_token: 'test-refresh' };
  const result = { data: { user, session }, error: null };
  const primary = { auth: {
    getUser: async () => result, getSession: async () => result,
    setSession: async value => { calls.push(['install', value]); return result; },
  } };
  const oauth = { auth: {
    setSession: async value => { calls.push(['seed', value]); return result; },
    signInWithOAuth: async value => { calls.push(['signin', value]); storage.setItem('qrmenu-filezuno-oauth-code-verifier', 'browser-secret'); return { data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=custom%3Afilezuno' } }; },
    linkIdentity: async value => { calls.push(['link', value]); return { data: { url: 'https://filezuno.net/oauth/authorize?client_id=qrmenu' } }; },
    exchangeCodeForSession: async (code, options) => { calls.push(['exchange', code, options]); return result; },
  } };
  const location = { href: 'https://menu.filezuno.net/', origin: 'https://menu.filezuno.net', pathname: '/', assign: url => calls.push(['redirect', url]) };
  const auth = createFilezunoAuth({ primary, createClient: (...args) => { calls.push(['client', args[2]]); return oauth; }, url: 'https://project.supabase.co', key: 'public-key', storage, location, history: { replaceState: (_, __, url) => { location.href = url; } }, now: () => 1000000 });
  return { auth, primary, oauth, result, calls, storage, location, values };
}

test('SSO is PKCE, tab scoped, and does not change the existing email client', async () => {
  const f = fixture(); await f.auth.start();
  const config = f.calls.find(c => c[0] === 'client')[1].auth;
  assert.equal(config.flowType, 'pkce'); assert.equal(config.storage, f.storage);
  assert.equal(config.autoRefreshToken, false); assert.equal(config.detectSessionInUrl, false);
  assert.deepEqual(f.calls.find(c => c[0] === 'signin')[1], { provider: 'custom:filezuno', options: { redirectTo: 'https://menu.filezuno.net/', scopes: 'email profile', skipBrowserRedirect: true } });
  assert.equal(f.calls.some(c => c[0] === 'install'), false);
  f.location.href += '?code=single-use-code&sb_flow_id=flow&keep=yes';
  assert.equal((await f.auth.complete()).error, undefined);
  assert.deepEqual(f.calls.find(c => c[0] === 'exchange'), ['exchange', 'single-use-code', { flowId: 'flow' }]);
  assert.equal(f.location.href, 'https://menu.filezuno.net/?keep=yes');
  assert.equal(f.values.size, 0);
});

test('linking authenticates the existing owner and restores that same UID', async () => {
  const f = fixture(); await f.auth.start(true);
  assert.ok(f.calls.find(c => c[0] === 'seed')); assert.ok(f.calls.find(c => c[0] === 'link'));
  f.location.href += '?code=linked';
  assert.equal((await f.auth.complete()).linked, true);
  assert.equal(f.calls.filter(c => c[0] === 'install').length, 1);
});

test('a link callback for a different UID never replaces the current app session', async () => {
  const f = fixture(); await f.auth.start(true);
  f.oauth.auth.exchangeCodeForSession = async () => ({ data: { ...f.result.data, user: { id: 'other-owner' } } });
  f.location.href += '?code=wrong-owner';
  assert.equal((await f.auth.complete()).error, true);
  assert.equal(f.calls.some(c => c[0] === 'install'), false); assert.equal(f.values.size, 0);
});

test('cancelled, expired, and failed code exchanges keep the old session intact', async () => {
  for (const kind of ['cancelled', 'expired', 'failed']) {
    const f = fixture(); await f.auth.start(true);
    f.location.href += kind === 'cancelled' ? '?error=access_denied&error_description=private' : '?code=one-use';
    if (kind === 'expired') f.storage.setItem('qrmenu-filezuno-oauth-pending', JSON.stringify({ at: 1, link: true, userId: 'original-owner' }));
    if (kind === 'failed') f.oauth.auth.exchangeCodeForSession = async () => ({ error: new Error('PKCE failed') });
    assert.equal((await f.auth.complete()).error, true);
    assert.equal(f.calls.some(c => c[0] === 'install'), false);
    assert.equal(f.values.size, 0); assert.equal(f.location.href, 'https://menu.filezuno.net/');
  }
});

test('unrelated email callbacks and public menu URLs are not consumed', async () => {
  const f = fixture(); f.location.href += '?reset=1&code=email-code';
  assert.equal(await f.auth.complete(), null); assert.match(f.location.href, /reset=1/);
});

test('manual linking disabled and identity conflicts give an actionable message', async () => {
  for (const code of ['manual_linking_disabled', 'identity_already_exists']) {
    const f = fixture(); f.oauth.auth.linkIdentity = async () => ({ error: { code } });
    await assert.rejects(() => f.auth.start(true), code === 'manual_linking_disabled' ? /Allow manual linking/ : /Không chuyển dữ liệu/);
    assert.equal(f.values.size, 0);
  }
});

test('OAuth errors in URL fragments are isolated from legacy email session parsing', async () => {
  const f = fixture(); await f.auth.start(true);
  f.location.href += '#error=access_denied&error_code=identity_already_exists&error_description=private';
  assert.equal(isFilezunoCallback(f.storage, f.location.href), true);
  const result = await f.auth.complete();
  assert.equal(result.error, true); assert.match(result.message, /Không chuyển dữ liệu/);
  assert.equal(f.location.href, 'https://menu.filezuno.net/');
  assert.equal(f.calls.some(c => c[0] === 'install'), false);
  assert.equal(isFilezunoCallback(f.storage, f.location.href), false);
});

test('blocked browser storage fails the SSO request without breaking email authentication', async () => {
  const f = fixture(); f.storage.setItem = () => { throw new Error('Storage disabled'); };
  await assert.rejects(() => f.auth.start(), /Chưa hoàn tất kết nối/);
  assert.equal(f.calls.some(c => c[0] === 'install'), false);
});
