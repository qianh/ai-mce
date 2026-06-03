import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ChatGPTExtractor } from '../../src/lib/extractors/chatgpt';

function loadFixture(name: string): Document {
  const html = readFileSync(resolve(__dirname, '../../fixtures', name), 'utf-8');
  return new JSDOM(html).window.document as unknown as Document;
}

describe('ChatGPTExtractor', () => {
  const extractor = new ChatGPTExtractor();
  const normalDoc = loadFixture('chatgpt-normal.html');

  it('canHandle chatgpt.com URLs', () => {
    expect(extractor.canHandle('https://chatgpt.com/c/abc', normalDoc)).toBe(true);
    expect(extractor.canHandle('https://claude.ai/c/abc', normalDoc)).toBe(false);
  });

  it('extracts 3 messages from normal conversation', async () => {
    const r = await extractor.extract(normalDoc, 'https://chatgpt.com/c/test');
    expect(r.content.messages).toHaveLength(3);
  });

  it('correctly identifies user and assistant roles', async () => {
    const r = await extractor.extract(normalDoc, 'https://chatgpt.com/c/test');
    expect(r.content.messages[0]?.role).toBe('user');
    expect(r.content.messages[1]?.role).toBe('assistant');
    expect(r.content.messages[2]?.role).toBe('user');
  });

  it('produces a valid content_hash', async () => {
    const r = await extractor.extract(normalDoc, 'https://chatgpt.com/c/test');
    expect(r.hashes.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sets confidence >= 0.8 for complete extraction', async () => {
    const r = await extractor.extract(normalDoc, 'https://chatgpt.com/c/test');
    expect(r.extraction_quality.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('sets confidence < 0.6 when only 1 message found', async () => {
    const doc = new JSDOM(`<html><body>
      <div data-message-author-role="user"><div class="markdown"><p>hi</p></div></div>
    </body></html>`).window.document as unknown as Document;
    const r = await extractor.extract(doc, 'https://chatgpt.com/c/test');
    expect(r.extraction_quality.confidence).toBeLessThan(0.6);
  });

  it('handles code block fixture correctly', async () => {
    const codeDoc = loadFixture('chatgpt-with-code.html');
    const r = await codeDoc && extractor.extract(codeDoc, 'https://chatgpt.com/c/code');
    expect((await r).content.messages).toHaveLength(2);
    expect((await r).content.messages[1]?.content).toContain('SHA-256');
  });
});
