import { describe, it, expect } from 'vitest';
import { contentHash, normalizeForHash } from '../../src/lib/hash';

describe('normalizeForHash', () => {
  it('trims whitespace and collapses blank lines', () => {
    expect(normalizeForHash('  hello\n\n\n  world  ')).toBe('hello\n\nworld');
  });
  it('strips ChatGPT UI copy', () => {
    const input = 'Some content\nCopy code\nRegenerate\nMore content';
    const result = normalizeForHash(input);
    expect(result).not.toContain('Copy code');
    expect(result).not.toContain('Regenerate');
    expect(result).toContain('Some content');
    expect(result).toContain('More content');
  });
});

describe('contentHash', () => {
  it('returns a 64-char hex string', async () => {
    expect(await contentHash('hello')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('same input → same hash', async () => {
    expect(await contentHash('test')).toBe(await contentHash('test'));
  });
  it('different input → different hash', async () => {
    expect(await contentHash('a')).not.toBe(await contentHash('b'));
  });
});
