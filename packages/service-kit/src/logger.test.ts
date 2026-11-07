import { describe, expect, it } from 'vitest';
import { createLogger, redact, type LogLevel } from './logger';

function capture(level: LogLevel = 'info') {
  const lines: Array<{ line: string; level: LogLevel }> = [];
  const logger = createLogger({
    service: 'test',
    level,
    write: (line, lvl) => lines.push({ line, level: lvl }),
    now: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  return { lines, logger };
}

describe('logger', () => {
  it('writes one JSON object per line with reserved fields', () => {
    const { lines, logger } = capture();
    logger.info('hello', { requestId: 'r1' });
    const record = JSON.parse(lines[0]?.line ?? '{}');
    expect(record.msg).toBe('hello');
    expect(record.service).toBe('test');
    expect(record.level).toBe('info');
    expect(record.requestId).toBe('r1');
    expect(record.time).toBe('2026-01-01T00:00:00.000Z');
  });

  it('filters below the configured level', () => {
    const { lines, logger } = capture('warn');
    logger.info('skip');
    logger.warn('keep');
    expect(lines.length).toBe(1);
  });

  it('does not let fields overwrite reserved keys', () => {
    const { lines, logger } = capture();
    logger.info('real', { msg: 'fake', level: 'debug' });
    const record = JSON.parse(lines[0]?.line ?? '{}');
    expect(record.msg).toBe('real');
    expect(record.level).toBe('info');
  });

  it('redacts sensitive keys, including nested ones', () => {
    const { lines, logger } = capture();
    logger.info('x', { password: 'hunter2', nested: { apiKey: 'abc123' }, ok: 1 });
    const text = lines[0]?.line ?? '';
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('abc123');
    expect(text).toContain('"ok":1');
  });

  it('serializes errors', () => {
    const out = redact({ error: new Error('boom') }) as { error: { message: string } };
    expect(out.error.message).toBe('boom');
  });

  it('still emits a line when a field cannot be serialized', () => {
    const { lines, logger } = capture();
    logger.info('survives', { big: BigInt(1) });
    expect(JSON.parse(lines[0]?.line ?? '{}').msg).toBe('survives');
  });

  it('carries child bindings', () => {
    const { lines, logger } = capture();
    logger.child({ connection: 'c1' }).info('x');
    expect(JSON.parse(lines[0]?.line ?? '{}').connection).toBe('c1');
  });
});
