import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins conditional class names', () => {
    expect(cn('a', false && 'b', 'c')).toBe('a c');
  });

  it('lets later Tailwind utilities win', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });
});
