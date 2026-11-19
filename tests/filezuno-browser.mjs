// Real Supabase SDK + browser storage/redirects; Auth and data APIs are simulated.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:5188';
const project = 'https://abcdefghijklmnopqrst.supabase.co';
const userId = '11111111-1111-4111-8111-111111111111';
let linked = false, rejectLink = false, rejectCode = false, cancelLink = false, challenge, exchanges = 0, writes = 0;
const user = () => ({ id: userId, email: 'old-owner@example.test', aud: 'authenticated', role: 'authenticated', identities: linked ? [{ provider: 'custom:filezuno', id: 'identity-test' }] : [], app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
const session = () => ({ access_token: 'e30.' + Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.test', refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user: user() });
const child = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], { env: { ...process.env, VITE_FILEZUNO_SSO: '1', VITE_SUPABASE_URL: project, VITE_SUPABASE_ANON_KEY: 'test-public-key' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser;
child.stdout.on('data', b => logs += b); child.stderr.on('data', b => logs += b);
try {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error(logs);
    try { if ((await fetch(origin)).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext();
  context.setDefaultTimeout(10000);
  const errors = [];
  context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
  await context.route(project + '/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/auth/v1/authorize' || path === '/auth/v1/user/identities/authorize') {
      assert.equal(url.searchParams.get('provider'), 'custom:filezuno');
      assert.equal(url.searchParams.get('code_challenge_method'), 's256');
      assert.equal(url.searchParams.get('redirect_to'), origin + '/');
      challenge = url.searchParams.get('code_challenge');
      if (path.includes('identities')) {
        assert.match(request.headers().authorization, /^Bearer /);
        if (rejectLink) return json({ error_code: 'manual_linking_disabled', msg: 'Manual linking disabled' }, 422);
        return json({ url: 'https://filezuno.net/oauth/authorize?client_id=qrmenu' });
      }
      return route.fulfill({ status: 302, headers: { location: origin + '/?code=oauth-test-code' } });
    }
    if (path === '/auth/v1/token') {
      const body = request.postDataJSON();
      if (url.searchParams.get('grant_type') === 'pkce') {
        exchanges++;
        assert.equal(body.auth_code, 'oauth-test-code');
        assert.equal(createHash('sha256').update(body.code_verifier).digest('base64url'), challenge);
        if (rejectCode) return json({ error_code: 'flow_state_not_found', msg: 'Expired code' }, 400);
        linked = true; return json(session());
      }
      assert.equal(body.password, 'Existing-password-123'); return json(session());
    }
    if (path === '/auth/v1/user') return json(user());
    if (path === '/auth/v1/logout') return json({});
    if (path === '/rest/v1/restaurants') {
      assert.equal(request.method(), 'GET');
      const owner = url.searchParams.get('owner_id');
      if (owner) assert.equal(owner, 'eq.' + userId);
      return json({ id: 'existing-restaurant', slug: 'existing-menu', name: 'Quán đang có', dishes: [], categories: [], version: 7, tagline: 'Menu cũ', address: 'Hà Nội' });
    }
    if (path === '/rest/v1/licenses') {
      assert.equal(url.searchParams.get('user_id'), 'eq.' + userId);
      return json([{ id: 'existing-license', expires_at: '2099-12-31T00:00:00Z', revoked: false }]);
    }
    if (path === '/rest/v1/menu_orders' && request.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '*/0', 'access-control-expose-headers': 'content-range' }, body: '' });
    if (request.method() !== 'GET' && request.method() !== 'HEAD' && path !== '/rest/v1/rpc/get_revenue_report') writes++;
    return json([]);
  });
  await context.route('https://filezuno.net/oauth/authorize?**', route => route.fulfill({ status: 302, headers: { location: origin + (cancelLink ? '/#error=access_denied&error_description=cancelled' : '/?code=oauth-test-code') } }));
  const page = await context.newPage();
  await page.goto(origin);
  await page.locator('#filezuno-signin').click();
  await page.locator('nav [data-nav=license]').click();
  await page.getByRole('heading', { name: 'Đã liên kết Filezuno' }).waitFor();
  assert.match(await page.locator('#license-form').innerText(), /Bản quyền đang hoạt động/);
  assert.equal(new URL(page.url()).search, ''); assert.equal(exchanges, 1); assert.equal(writes, 0);
  assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some(k => k.startsWith('qrmenu-filezuno-oauth'))), false);
  await page.reload(); await page.locator('nav [data-nav=license]').click();
  await page.getByRole('heading', { name: 'Đã liên kết Filezuno' }).waitFor();
  console.log('PASS Filezuno sign in: actual PKCE exchange, same owner/data/license, refresh persistence, callback cleanup');

  await page.locator('#logout').click(); linked = false;
  await page.locator('#auth-form [name=email]').fill('old-owner@example.test');
  await page.locator('#auth-form [name=password]').fill('Existing-password-123');
  await page.locator('#auth-submit').click(); await page.locator('nav [data-nav=license]').click();
  rejectLink = true;
  await page.locator('#filezuno-link').click(); await page.getByText(/Allow manual linking/).waitFor();
  assert.equal(await page.locator('#filezuno-link').isEnabled(), true);
  rejectLink = false; cancelLink = true; await page.locator('#filezuno-link').click();
  await page.locator('#filezuno-status').filter({ hasText: /Chưa hoàn tất/ }).waitFor();
  assert.match(await page.locator('#license-form').innerText(), /old-owner@example.test/);
  assert.equal(new URL(page.url()).hash, ''); assert.equal(exchanges, 1);
  cancelLink = false; await page.locator('#filezuno-link').click();
  await page.getByRole('heading', { name: 'Đã liên kết Filezuno' }).waitFor();
  assert.match(await page.locator('#license-form').innerText(), /old-owner@example.test/);
  assert.equal(exchanges, 2); assert.equal(writes, 0);
  console.log('PASS Filezuno linking: existing email login, disabled-linking feedback, authorized link retains original UID');

  await page.locator('#logout').click(); linked = false; rejectCode = true;
  await page.locator('#filezuno-signin').click();
  await page.locator('#filezuno-status').filter({ hasText: /Chưa hoàn tất/ }).waitFor();
  assert.equal(await page.locator('#auth-form').count(), 1);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k))), false);
  assert.equal(writes, 0);
  assert.deepEqual(errors, []);
  console.log('PASS failed OAuth: no session, no data writes, email fallback remains available, no uncaught browser errors');
} catch (error) {
  for (const context of browser?.contexts() || []) for (const page of context.pages()) console.error('SSO test state:', await page.evaluate(() => ({ url: location.href, text: document.body.innerText.slice(-2000), pending: sessionStorage.getItem('qrmenu-filezuno-oauth-pending'), keys: Object.keys(sessionStorage) })).catch(() => ({})));
  throw error;
} finally { await browser?.close(); child.kill(); }
