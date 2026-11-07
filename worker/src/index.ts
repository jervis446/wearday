import { BadRequest, parseRequest, suggestOutfit, type RunModel } from './suggest.ts';

export interface Env {
  AI: Ai;
  /** Workers AI model id. Defaults to Llama 3.3 70B (fast). */
  MODEL?: string;
  /** Optional shared token. If set, requests must send it in the x-app-token header. */
  APP_TOKEN?: string;
  /** Optional Workers rate-limiting binding (see wrangler.jsonc). */
  RATE_LIMITER?: { limit(opts: { key: string }): Promise<{ success: boolean }> };
}

const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-app-token',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const { pathname } = new URL(request.url);
    if (pathname === '/health') return json({ ok: true });
    if (pathname !== '/suggest' || request.method !== 'POST') return json({ error: 'Not found' }, 404);

    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return json({ error: 'Too many requests, try again in a minute' }, 429);
    }

    const raw = await request.text();
    if (raw.length > 100_000) return json({ error: 'Request too large' }, 413);

    try {
      const req = parseRequest(JSON.parse(raw));
      const model = (env.MODEL || DEFAULT_MODEL) as Parameters<Ai['run']>[0];
      const run: RunModel = (input) => env.AI.run(model, input as never);
      return json(await suggestOutfit(req, run));
    } catch (e) {
      if (e instanceof BadRequest || e instanceof SyntaxError) return json({ error: e.message }, 400);
      console.error(e);
      return json({ error: 'Could not create a suggestion right now' }, 502);
    }
  },
} satisfies ExportedHandler<Env>;
