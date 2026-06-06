import { describe, expect, it } from 'vitest';
import { dedupeSensitiveMatches, detectSensitive, parseSensitiveResult } from '../../src/lib/sensitive';
import type { ExtractedMessage } from '../../src/lib/types';

const messages: ExtractedMessage[] = [
  { role: 'user', content: 'hello', index: 0 },
  {
    role: 'assistant',
    content: 'Use sk-xxxPERPLEXITY and contact me@example.com for the bearer token.',
    index: 1,
  },
];

describe('detectSensitive', () => {
  it('returns masked API key and email matches with message indexes', () => {
    const result = detectSensitive(messages);

    expect(result.has_sensitive).toBe(true);
    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'api_key',
          masked: 'sk-••••XITY',
          message_index: 1,
        }),
        expect.objectContaining({
          type: 'email',
          masked: 'm••••••••••e@example.com',
          message_index: 1,
        }),
      ]),
    );
    expect(result.matches.map((match) => match.value)).not.toContain('sk-xxxPERPLEXITY');
  });

  it('returns no matches for clean messages', () => {
    const result = detectSensitive([{ role: 'user', content: '普通对话内容', index: 0 }]);

    expect(result.has_sensitive).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('keeps detecting AWS keys, bearer tokens, and password assignments', () => {
    const result = detectSensitive([
      { role: 'user', content: 'AWS key AKIAIOSFODNN7EXAMPLE and Bearer eyJhbGciOiJIUzI1NiJ9', index: 0 },
      { role: 'assistant', content: 'password = correct-horse-battery-staple', index: 1 },
    ]);

    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'api_key', masked: 'AKIA••••MPLE', message_index: 0 }),
        expect.objectContaining({ type: 'token', masked: '••••NiJ9', message_index: 0 }),
        expect.objectContaining({ type: 'password', masked: '••••', message_index: 1 }),
      ]),
    );
  });

  it('ignores env-line concatenation artifacts and placeholder keys', () => {
    const result = detectSensitive([
      {
        role: 'assistant',
        content: 'OPENAI_API_KEY=sk-xxxPERPLEXITY_API_KEY=pplx-xxx',
        index: 2,
      },
    ]);

    expect(result.has_sensitive).toBe(false);
    expect(result.matches).toHaveLength(0);
  });

  it('includes a context excerpt for real matches', () => {
    const result = detectSensitive(messages);

    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'api_key',
          masked: 'sk-••••XITY',
          message_index: 1,
          context: expect.stringContaining('sk-••••XITY'),
        }),
      ]),
    );
  });

  it('dedupes different API keys that mask to the same preview', () => {
    const result = detectSensitive([
      { role: 'assistant', content: 'keys sk-aaaa_KEY and sk-bbbb_KEY in one turn', index: 2 },
    ]);

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toEqual(
      expect.objectContaining({ type: 'api_key', masked: 'sk-••••_KEY', message_index: 2 }),
    );
  });

  it('detects phone numbers and ID numbers', () => {
    const result = detectSensitive([
      { role: 'user', content: '联系我 13812345678，身份证 11010119900307713X', index: 0 },
    ]);

    expect(result.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'phone', masked: '138••••5678', message_index: 0 }),
        expect.objectContaining({ type: 'id_number', masked: '1101••••713X', message_index: 0 }),
      ]),
    );
  });

  it('returns consistent results across overlapping detectSensitive calls', async () => {
    const payload = [
      { role: 'assistant', content: 'sk-abcdef1234567890 and me@example.com', index: 0 },
    ] satisfies ExtractedMessage[];

    const results = await Promise.all(
      Array.from({ length: 20 }, () => Promise.resolve(detectSensitive(payload))),
    );

    for (const result of results) {
      expect(result.has_sensitive).toBe(true);
      expect(result.matches.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('dedupeSensitiveMatches', () => {
  it('removes duplicate display rows from merged content-script and popup results', () => {
    const deduped = dedupeSensitiveMatches([
      { type: 'api_key', masked: 'sk-••••_KEY', message_index: 2 },
      { type: 'api_key', masked: 'sk-••••_KEY', message_index: 2 },
    ]);

    expect(deduped).toHaveLength(1);
  });
});

describe('parseSensitiveResult', () => {
  it('keeps valid matches and derives has_sensitive from match count', () => {
    const result = parseSensitiveResult({
      has_sensitive: false,
      matches: [{ type: 'api_key', masked: 'sk-••••XITY', message_index: 0 }],
    });

    expect(result).toEqual({
      has_sensitive: true,
      matches: [{ type: 'api_key', masked: 'sk-••••XITY', message_index: 0 }],
    });
  });

  it('filters malformed match entries', () => {
    const result = parseSensitiveResult({
      has_sensitive: true,
      matches: [
        { type: 'api_key', masked: 'sk-••••XITY', message_index: 0 },
        { type: 'unknown', masked: 'x', message_index: 0 },
        { type: 'email', masked: '', message_index: 1 },
        { type: 'token', masked: 'tok', message_index: -1 },
        null,
      ],
    });

    expect(result).toEqual({
      has_sensitive: true,
      matches: [{ type: 'api_key', masked: 'sk-••••XITY', message_index: 0 }],
    });
  });

  it('returns null when matches is not an array', () => {
    expect(parseSensitiveResult({ has_sensitive: true })).toBeNull();
    expect(parseSensitiveResult(null)).toBeNull();
  });
});
