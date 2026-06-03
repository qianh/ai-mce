import { describe, it, expect } from 'vitest';
import { detectSensitive } from '../../src/lib/sensitive';

describe('detectSensitive', () => {
  it('detects OpenAI API keys', () => {
    const r = detectSensitive([{ role: 'user', content: 'my key is sk-abc123def456', index: 0 }]);
    expect(r.has_sensitive).toBe(true);
    expect(r.matches[0]?.type).toBe('api_key');
    expect(r.matches[0]?.masked).toContain('••••');
  });
  it('detects AWS access keys', () => {
    const r = detectSensitive([{ role: 'user', content: 'AKIAIOSFODNN7EXAMPLE123', index: 0 }]);
    expect(r.has_sensitive).toBe(true);
  });
  it('detects Bearer tokens', () => {
    const r = detectSensitive([{ role: 'assistant', content: 'Bearer eyJhbGciOiJIUzI1NiJ9', index: 1 }]);
    expect(r.has_sensitive).toBe(true);
    expect(r.matches[0]?.message_index).toBe(1);
  });
  it('returns empty for clean text', () => {
    const r = detectSensitive([{ role: 'user', content: 'What is the weather today?', index: 0 }]);
    expect(r.has_sensitive).toBe(false);
    expect(r.matches).toHaveLength(0);
  });
  it('scans multiple messages', () => {
    const r = detectSensitive([
      { role: 'user', content: 'normal text', index: 0 },
      { role: 'user', content: 'sk-secret12345678', index: 1 },
    ]);
    expect(r.matches[0]?.message_index).toBe(1);
  });
});
