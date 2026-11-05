// Trusted administrator CLI. Never bundle this file into the frontend.
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const [command, idOrDays, extraDays] = process.argv.slice(2);
if (!['create','revoke','renew'].includes(command)) {
  console.error('Usage: npm run license -- create [days=365] | revoke <license-id> | renew <license-id> [days=365]');
  process.exit(1);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the administrator shell. Do not use VITE_ for a service key.');
  process.exit(1);
}
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const expiry = days => {
  const n = Number(days ?? 365);
  if (!Number.isInteger(n) || n < 1 || n > 36500) throw new Error('Days must be an integer from 1 to 36500.');
  return new Date(Date.now() + n * 86400000).toISOString();
};
try {
  if (command === 'create') {
    const rawKey = 'QRM-' + randomBytes(24).toString('hex').toUpperCase();
    const { data, error } = await client.from('licenses').insert({
      key_hash: createHash('sha256').update(rawKey).digest('hex'), expires_at: expiry(idOrDays),
    }).select('id,expires_at').single();
    if (error) throw error;
    console.log(JSON.stringify({ id: data.id, expires_at: data.expires_at, activation_key: rawKey }, null, 2));
    console.log('Store and deliver this activation key securely. Only its hash is retained in the database.');
  } else {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrDays ?? '')) throw new Error('A valid license UUID is required.');
    const changes = command === 'revoke' ? { revoked: true } : { revoked: false, expires_at: expiry(extraDays) };
    const { data, error } = await client.from('licenses').update(changes).eq('id',idOrDays).select('id,expires_at,revoked').single();
    if (error) throw error;
    console.log(JSON.stringify(data, null, 2));
  }
} catch (error) {
  console.error('License operation failed:', error.message);
  process.exitCode = 1;
}
