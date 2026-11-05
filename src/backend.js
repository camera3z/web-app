import { validateImage } from './images.js';
export function createBackend(client) {
  const checked = ({ data, error }) => { if (error) throw error; return data; };
  return {
    async user() {
      const result = await client.auth.getUser();
      if (result.error?.name === 'AuthSessionMissingError') return null;
      return checked(result)?.user ?? null;
    },
    async login(email) {
      checked(await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } }));
    },
    async signIn(email, password) {
      return checked(await client.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password) {
      return checked(await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
    },
    async resetPassword(email) {
      checked(await client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '?reset=1' }));
    },
    async setPassword(password) {
      checked(await client.auth.updateUser({ password }));
    },
    async logout() { checked(await client.auth.signOut()); },
    async load() {
      const user = await this.user();
      if (!user) return { user: null, restaurant: null, licenses: [] };
      const [restaurant, licenses] = await Promise.all([
        client.from('restaurants').select('id,slug,name,tagline,address,dishes,categories,version').eq('owner_id', user.id).maybeSingle(),
        client.from('licenses').select('id,expires_at,revoked').eq('user_id', user.id),
      ]);
      return { user, restaurant: checked(restaurant), licenses: checked(licenses) };
    },
    async save(restaurant, dishes, current) {
      return checked(await client.rpc('save_restaurant', {
        restaurant_name: restaurant.name, restaurant_tagline: restaurant.tagline,
        restaurant_address: restaurant.address, menu_dishes: dishes,
        expected_version: current?.version ?? 0,
      }));
    },
    async uploadImage(blob) {
      validateImage(blob);
      const user = await this.user();
      if (!user) throw new Error('Vui lòng đăng nhập trước khi tải ảnh.');
      const path = `${user.id}/${crypto.randomUUID()}.webp`;
      checked(await client.storage.from('menu-images').upload(path, blob, {
        contentType: 'image/webp', cacheControl: '31536000', upsert: false,
      }));
      return client.storage.from('menu-images').getPublicUrl(path).data.publicUrl;
    },
    async placeOrder(slug, items, note, requestToken, clientToken, total) {
      return checked(await client.rpc('place_menu_order', {menu_slug:slug,order_items:items,order_note:note,request_token:requestToken,client_token:clientToken,expected_total:total}));
    },
    async orders(restaurantId, history=false) {
      let query=client.from('menu_orders').select('id,order_code,items,total,note,status,created_at,updated_at,payment_status,payment_method,paid_at,cash_received').eq('restaurant_id',restaurantId);
      query=query.in('status',history?['served','rejected']:['new','accepted','preparing']);
      return checked(await query.order('created_at',{ascending:!history}).limit(200));
    },
    async payCash(id, amount) {
      return checked(await client.rpc('pay_menu_order_cash',{order_id:id,cash_amount:amount}));
    },
    async setOrderStatus(id, expected, next) {
      return checked(await client.rpc('set_menu_order_status',{order_id:id,expected_status:expected,next_status:next}));
    },
    async publicMenu(slug) { return checked(await client.rpc('get_public_menu', { menu_slug: slug })); },
    async activate(key) { return checked(await client.rpc('activate_license', { license_key: key })); },
  };
}
export function hasActiveLicense(licenses, now = Date.now()) {
  return licenses.some(l => !l.revoked && Date.parse(l.expires_at) > now);
}
