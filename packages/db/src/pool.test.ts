import { describe, expect, it } from 'vitest';
import { closeDatabasePool, pingDatabase } from './pool';

describe('pingDatabase', () => {
  it('runs a trivial query', async () => {
    const queries: string[] = [];
    await pingDatabase({
      query: (async (sql: string) => {
        queries.push(sql);
        return { rows: [] };
      }) as never,
    });
    expect(queries).toEqual(['SELECT 1']);
  });

  it('propagates connection failures', async () => {
    await expect(
      pingDatabase({
        query: (async () => {
          throw new Error('connection refused');
        }) as never,
      }),
    ).rejects.toThrow(/connection refused/);
  });
});

describe('closeDatabasePool', () => {
  it('ends the pool', async () => {
    let ended = false;
    await closeDatabasePool({
      end: async () => {
        ended = true;
      },
    });
    expect(ended).toBe(true);
  });
});
