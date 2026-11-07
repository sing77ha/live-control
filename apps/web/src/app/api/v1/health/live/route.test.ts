import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/v1/health/live', () => {
  it('returns 200 and is not cacheable', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(((await res.json()) as { status: string }).status).toBe('ok');
  });
});
