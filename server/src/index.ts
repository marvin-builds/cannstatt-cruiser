/** Cloudflare Worker entry for the Cannstatt Cruiser highscore list. */
import { handleRequest, type Env } from './handler';

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env, Date.now()),
} satisfies ExportedHandler<Env>;
