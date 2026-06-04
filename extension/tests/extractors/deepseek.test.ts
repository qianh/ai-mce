import { afterEach, describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DeepSeekExtractor, deepseekObserver } from '../../src/lib/extractors/deepseek';

function loadFixture(name: string): Document {
  const html = readFileSync(resolve(__dirname, '../../fixtures', name), 'utf-8');
  return new JSDOM(html).window.document as unknown as Document;
}

describe('DeepSeekExtractor', () => {
  const extractor = new DeepSeekExtractor();
  const normalDoc = loadFixture('deepseek-normal.html');

  afterEach(() => {
    deepseekObserver.reset();
  });

  it('canHandle chat.deepseek.com URLs', () => {
    expect(extractor.canHandle('https://chat.deepseek.com/a/chat/s/abc', normalDoc)).toBe(true);
    expect(extractor.canHandle('https://chatgpt.com/c/abc', normalDoc)).toBe(false);
  });

  it('extracts messages and roles from DeepSeek conversations', async () => {
    const result = await extractor.extract(normalDoc, 'https://chat.deepseek.com/a/chat/s/session-123');

    expect(result.source.platform).toBe('deepseek');
    expect(result.content.messages).toHaveLength(3);
    expect(result.content.messages[0]?.role).toBe('user');
    expect(result.content.messages[1]?.role).toBe('assistant');
    expect(result.content.messages[2]?.content).toContain('浏览器扩展');
  });

  it('extracts visible DeepSeek markdown pages without role data attributes', async () => {
    const realisticDoc = loadFixture('deepseek-realistic.html');
    const result = await extractor.extract(realisticDoc, 'https://chat.deepseek.com/a/chat/s/45774524-8912-470f-9312-cff1276916f5');

    expect(result.content.messages.length).toBeGreaterThanOrEqual(2);
    expect(result.content.messages[0]?.role).toBe('user');
    expect(result.content.messages[0]?.content).toContain('流程图软件推荐对比');
    expect(result.content.messages[1]?.role).toBe('assistant');
    expect(result.content.messages[1]?.content).toContain('Draw.io');
    expect(result.extraction_quality.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('uses DeepSeek conversation ids for source fingerprints', async () => {
    const result = await extractor.extract(normalDoc, 'https://chat.deepseek.com/a/chat/s/session-123?foo=bar');

    expect(result.metadata?.conversation_id).toBe('session-123');
    expect(result.hashes.source_fingerprint).toBe('deepseek:session-123');
  });

  it('falls back to deterministic URL fingerprints when no conversation id exists', async () => {
    const result = await extractor.extract(normalDoc, 'https://chat.deepseek.com/');

    expect(result.metadata?.conversation_id).toBeUndefined();
    expect(result.hashes.source_fingerprint).toBe('deepseek:https://chat.deepseek.com/');
  });

  it('sets confidence below 0.6 when only one message is found', async () => {
    const doc = new JSDOM(`<html><body>
      <section data-ds-message data-ds-role="user">hi</section>
    </body></html>`).window.document as unknown as Document;
    const result = await extractor.extract(doc, 'https://chat.deepseek.com/a/chat/s/one');

    expect(result.extraction_quality.confidence).toBeLessThan(0.6);
  });

  it('does not reuse observer messages from a previous DeepSeek route', async () => {
    const doc = new JSDOM(`<html><body>
      <section data-ds-message data-ds-role="user">旧会话问题</section>
      <section data-ds-message data-ds-role="assistant">旧会话回答</section>
    </body></html>`).window.document as unknown as Document;

    deepseekObserver.start(doc, 'https://chat.deepseek.com/a/chat/s/old-session');

    const nextDoc = loadFixture('deepseek-realistic.html');
    doc.title = nextDoc.title;
    doc.documentElement.lang = nextDoc.documentElement.lang;
    doc.body.innerHTML = nextDoc.body.innerHTML;

    const result = await extractor.extract(
      doc,
      'https://chat.deepseek.com/a/chat/s/45774524-8912-470f-9312-cff1276916f5'
    );
    const extractedText = result.content.messages.map((message) => message.content).join('\n');

    expect(extractedText).toContain('Draw.io');
    expect(extractedText).not.toContain('旧会话回答');
  });
});
