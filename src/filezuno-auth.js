// OAuth uses its own tab-scoped PKCE storage so existing email links keep working
// across devices. Only the verified result is installed in the normal app session.
export const FILEZUNO_PROVIDER = 'custom:filezuno';
const STORAGE_KEY = 'qrmenu-filezuno-oauth';
const PENDING_KEY = STORAGE_KEY + '-pending';
const MAX_AGE = 15 * 60 * 1000;

export function isFilezunoCallback(storage, href) {
  try {
    const url = new URL(href), fragment = new URLSearchParams(url.hash.slice(1));
    return Boolean(storage.getItem(PENDING_KEY)) && (url.searchParams.has('code') || ['error', 'error_code', 'error_description'].some(name => url.searchParams.has(name) || fragment.has(name)));
  } catch { return false; }
}

export function filezunoAuthError(error) {
  if (error?.code === 'manual_linking_disabled') return 'Chưa bật liên kết tài khoản trong Supabase. Bạn vẫn có thể đăng nhập QR Menu bằng email hiện tại; quản trị viên cần bật Allow manual linking.';
  if (['identity_already_exists', 'identity_already_linked', 'email_exists'].includes(error?.code)) return 'Tài khoản Filezuno này đã gắn với một tài khoản QR Menu khác. Không chuyển dữ liệu quán tự động. Hãy đăng nhập tài khoản cũ hoặc liên hệ quản trị viên.';
  return 'Chưa hoàn tất kết nối Filezuno. Hãy thử lại trên cùng trình duyệt. Nếu đã có quán, đăng nhập bằng email cũ rồi chọn Liên kết Filezuno.';
}

export function createFilezunoAuth({ primary, createClient, url, key, storage, location, history, now = Date.now }) {
  let oauth;
  function client() {
    return oauth ??= createClient(url, key, { auth: {
      flowType: 'pkce', storageKey: STORAGE_KEY, storage,
      persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    } });
  }
  function clear() {
    // No signOut: revoking the OAuth refresh token would also log out the app.
    try {
      for (let i = storage.length - 1; i >= 0; i--) {
        const name = storage.key(i);
        if (name?.startsWith(STORAGE_KEY)) storage.removeItem(name);
      }
    } catch { /* A blocked storage backend will also fail start(), with a useful message. */ }
  }
  return {
    async start(link = false) {
      clear();
      try {
        let userId = null;
        if (link) {
          const verified = await primary.auth.getUser();
          if (verified.error || !verified.data?.user) throw new Error('No verified user');
          userId = verified.data.user.id;
          const current = await primary.auth.getSession();
          if (current.error || !current.data?.session) throw new Error('No session');
          const seeded = await client().auth.setSession(current.data.session);
          if (seeded.error || seeded.data?.user?.id !== userId) throw new Error('Session mismatch');
        }
        storage.setItem(PENDING_KEY, JSON.stringify({ at: now(), userId, link }));
        const redirectTo = new URL(location.pathname, location.origin).href;
        const options = { provider: FILEZUNO_PROVIDER, options: { redirectTo, scopes: 'email profile', skipBrowserRedirect: true } };
        const result = link ? await client().auth.linkIdentity(options) : await client().auth.signInWithOAuth(options);
        if (result.error) throw result.error;
        const target = new URL(result.data.url);
        // SDK responses must point to this project's authorization endpoints.
        const projectURL = target.origin === new URL(url).origin && ['/auth/v1/authorize', '/auth/v1/user/identities/authorize'].includes(target.pathname);
        const providerURL = link && target.origin === 'https://filezuno.net' && target.pathname === '/oauth/authorize';
        if (!projectURL && !providerURL) throw new Error('Invalid authorization URL');
        location.assign(target.href);
      } catch (error) { clear(); throw new Error(filezunoAuthError(error)); }
    },
    async complete() {
      const current = new URL(location.href);
      const fragment = new URLSearchParams(current.hash.slice(1));
      let pending;
      try { pending = JSON.parse(storage.getItem(PENDING_KEY)); } catch { clear(); }
      if (!pending || !isFilezunoCallback(storage, location.href)) return null;
      const code = current.searchParams.get('code'), flowId = current.searchParams.get('sb_flow_id');
      const cancelled = ['error', 'error_code', 'error_description'].some(name => current.searchParams.has(name) || fragment.has(name));
      const errorCode = current.searchParams.get('error_code') || fragment.get('error_code');
      for (const name of ['code', 'sb_flow_id', 'error', 'error_code', 'error_description']) current.searchParams.delete(name);
      if (cancelled && current.hash) {
        for (const name of ['error', 'error_code', 'error_description']) fragment.delete(name);
        current.hash = fragment.toString();
      }
      history.replaceState(null, '', current.href);
      try {
        if (cancelled) throw { code: errorCode };
        if (!code || typeof pending.at !== 'number' || typeof pending.link !== 'boolean' || (pending.link && !pending.userId) || now() - pending.at > MAX_AGE || now() < pending.at) throw new Error('Expired or cancelled');
        const result = await client().auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
        if (result.error || !result.data?.session || !result.data.user?.id) throw result.error || new Error('No session');
        if (pending.link && result.data.user.id !== pending.userId) throw new Error('Linked user mismatch');
        const installed = await primary.auth.setSession(result.data.session);
        if (installed.error || installed.data?.user?.id !== result.data.user.id) throw installed.error || new Error('Invalid session');
        return { linked: pending.link, message: pending.link ? 'Đã liên kết Filezuno. Quán, thực đơn và bản quyền hiện tại được giữ nguyên.' : 'Đã đăng nhập bằng Filezuno.' };
      } catch (error) { return { error: true, message: filezunoAuthError(error) }; }
      finally { clear(); }
    },
  };
}
