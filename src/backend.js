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
    async logout() { checked(await client.auth.signOut()); },
    async load() {
      const user = await this.user();
      if (!user) return { user: null, restaurant: null, licenses: [] };
      const [restaurant, licenses] = await Promise.all([
        client.from('restaurants').select('id,slug,name,tagline,address,dishes,version').eq('owner_id', user.id).maybeSingle(),
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
    async publicMenu(slug) { return checked(await client.rpc('get_public_menu', { menu_slug: slug })); },
    async activate(key) { return checked(await client.rpc('activate_license', { license_key: key })); },
  };
}
export function hasActiveLicense(licenses, now = Date.now()) {
  return licenses.some(l => !l.revoked && Date.parse(l.expires_at) > now);
}
