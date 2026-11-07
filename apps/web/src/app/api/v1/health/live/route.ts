export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Liveness: the process is up and can serve a request. Touches no dependencies. */
export function GET(): Response {
  return Response.json({ status: 'ok', service: 'web' }, { headers: { 'Cache-Control': 'no-store' } });
}
