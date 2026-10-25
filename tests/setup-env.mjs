// Tests opt into connectors with their own fake keys and request adapters.
// Developer credentials must not enable extra requests or override fixtures.
for (const name of [
  'UNSPLASH_ACCESS_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]) delete process.env[name];
