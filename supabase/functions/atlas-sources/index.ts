import postgres from 'postgres';
import { createHandler, ORIGIN } from './handler.js';
import { SourceStore } from './store.js';
import { Storage } from './storage.js';

let handler: ReturnType<typeof createHandler> | undefined;
Deno.serve(async request => {
  if (!handler) {
    const connection = Deno.env.get('SUPABASE_DB_URL');
    const url = Deno.env.get('SUPABASE_URL');
    const role = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (connection && url && role) {
      const options = {
        prepare: false, ssl: 'verify-full' as const, max: 2, idle_timeout: 20,
        connect_timeout: 5, onnotice: () => {}, debug: false as const,
      };
      const store = new SourceStore(postgres(connection, options), postgres(connection, options));
      handler = createHandler({ store, storage: new Storage({ url, role }) });
    }
  }
  if (handler) return await handler(request);
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json', Vary: 'Origin' });
  if (request.headers.get('origin') === ORIGIN) headers.set('Access-Control-Allow-Origin', ORIGIN);
  return new Response(JSON.stringify({ code: 'SOURCE_STORAGE_UNAVAILABLE' }), {
    status: 503, headers,
  });
});
