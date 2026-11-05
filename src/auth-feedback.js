const EMAIL_MODES = ['signup', 'forgot', 'link'];
export function authFailure(error) {
  const code = String(error?.code || '').toLowerCase();
  const raw = String(error?.message || '');
  const emailLimit = code === 'over_email_send_rate_limit' || /email.*rate.?limit|rate.?limit.*email/i.test(raw);
  const limited = emailLimit || error?.status === 429 || ['over_request_rate_limit', 'over_sms_send_rate_limit'].includes(code) || /rate.?limit|too many/i.test(raw);
  if (limited) {
    const supplied = Number(error?.retryAfter ?? error?.retry_after);
    const seconds = Number.isFinite(supplied) && supplied > 0 ? Math.min(86400, Math.ceil(supplied)) : 60;
    return {
      message: emailLimit ? 'Dịch vụ gửi email đang đạt giới hạn. Hãy kiểm tra thư đã nhận; nếu vẫn chưa có, thử lại sau hoặc liên hệ hỗ trợ.' : 'Yêu cầu đang bị giới hạn tần suất. Vui lòng chờ trước khi thử lại.',
      cooldownSeconds: seconds,
    };
  }
  if (/Invalid login credentials/i.test(raw)) return { message: 'Email hoặc mật khẩu không đúng.' };
  if (code === 'email_not_confirmed' || /Email not confirmed/i.test(raw)) return { message: 'Vui lòng xác nhận email trước khi đăng nhập.' };
  if (code === 'email_address_not_authorized' || /email address not authorized/i.test(raw)) return { message: 'Dịch vụ email chưa cho phép gửi tới địa chỉ này. Vui lòng liên hệ hỗ trợ.' };
  return { message: raw || 'Không thực hiện được. Kiểm tra kết nối rồi thử lại.' };
}
export function createAuthCooldowns(storage, now = Date.now) {
  const memory = new Map();
  const key = mode => 'qrmenu-auth-cooldown-' + (EMAIL_MODES.includes(mode) ? 'email' : mode);
  return {
    remaining(mode) {
      let stored;
      try { stored = storage.getItem(key(mode)); } catch {}
      const until = Math.max(Number(stored) || 0, memory.get(key(mode)) || 0);
      return Math.max(0, Math.ceil((until - now()) / 1000));
    },
    start(mode, seconds) {
      const until = now() + Math.max(1, Math.min(86400, seconds)) * 1000;
      memory.set(key(mode), until);
      try { storage.setItem(key(mode), String(until)); } catch {}
    },
  };
}
