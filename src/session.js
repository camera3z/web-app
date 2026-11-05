// Supabase can emit SIGNED_IN again when an existing session regains focus.
// Reload only when the account identity changes, not for token refresh/focus.
export function sessionObserver(reload) {
  let userId;
  return (event, session) => {
    const next = session?.user?.id ?? null;
    if (event === 'INITIAL_SESSION') { userId = next; return; }
    if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_DELETED'].includes(event)) return;
    if (next === userId) return;
    userId = next;
    // Never await Supabase operations inside its auth callback (auth lock).
    setTimeout(reload, 0);
  };
}
export async function withLoadTimeout(operation, milliseconds = 20000) {
  let timer;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Kết nối quá lâu. Kiểm tra mạng rồi nhấn Thử lại.')), milliseconds);
      }),
    ]);
  } finally { clearTimeout(timer); }
}
