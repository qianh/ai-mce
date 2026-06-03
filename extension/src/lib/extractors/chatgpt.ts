import type { ConversationExtractor } from './base';
import type { ExtractedConversation, ExtractedMessage, MessageRole } from '../types';
import { EXTRACTOR_VERSION, SCHEMA_VERSION } from './base';
import { contentHash, messageHash } from '../hash';

export class ChatGPTExtractor implements ConversationExtractor {
  platform = 'chatgpt' as const;

  canHandle(url: string, _document: Document): boolean {
    return url.includes('chatgpt.com');
  }

  async extract(document: Document, url: string): Promise<ExtractedConversation> {
    const messages = await this.extractMessages(document);
    const allText = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    const hash = await contentHash(allText);
    const msgHashes = await Promise.all(
      messages.map((m) => messageHash(m.role, m.content, m.index))
    );
    const confidence = this.calcConfidence(messages);

    return {
      schema_version: SCHEMA_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      source: {
        platform: 'chatgpt',
        url,
        browser_title: document.title || 'ChatGPT',
        captured_at: new Date().toISOString(),
        locale: document.documentElement.lang || undefined,
      },
      content: {
        title: document.title || 'ChatGPT 对话',
        messages,
      },
      extraction_quality: {
        confidence,
        method: messages.length > 0 ? 'dom_attr' : 'article',
        warnings: messages.length < 2 ? ['few_messages_detected'] : [],
        message_count: messages.length,
        empty_message_count: messages.filter((m) => !m.content.trim()).length,
      },
      hashes: {
        content_hash: hash,
        message_hashes: msgHashes,
        source_fingerprint: `chatgpt:${url}`,
      },
    };
  }

  private async extractMessages(document: Document): Promise<ExtractedMessage[]> {
    // Strategy 1: data-message-author-role attribute
    const roleNodes = document.querySelectorAll('[data-message-author-role]');
    if (roleNodes.length > 0) {
      return Array.from(roleNodes).flatMap((node, i) => {
        const role = node.getAttribute('data-message-author-role') as MessageRole;
        const content = this.extractText(node);
        return content.trim() ? [{ role, content, index: i }] : [];
      });
    }

    // Strategy 2: conversation-turn testids
    const turns = document.querySelectorAll('[data-testid^="conversation-turn-"]');
    const fromTurns: ExtractedMessage[] = [];
    turns.forEach((turn, i) => {
      const roleNode = turn.querySelector('[data-message-author-role]');
      if (roleNode) {
        const role = roleNode.getAttribute('data-message-author-role') as MessageRole;
        const content = this.extractText(roleNode);
        if (content.trim()) fromTurns.push({ role, content, index: i });
      }
    });
    if (fromTurns.length > 0) return fromTurns;

    // Strategy 3: article tags fallback
    return Array.from(document.querySelectorAll('article')).flatMap((el, i) => {
      const content = this.extractText(el);
      return content.trim() ? [{ role: 'unknown' as MessageRole, content, index: i }] : [];
    });
  }

  private extractText(node: Element): string {
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll('button, [data-testid="copy-turn-action-button"]').forEach((el) => el.remove());
    return (clone.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
  }

  private calcConfidence(messages: ExtractedMessage[]): number {
    if (messages.length === 0) return 0.1;
    if (messages.length === 1) return 0.45;
    const hasRoles = messages.some((m) => m.role !== 'unknown');
    const base = hasRoles ? 0.85 : 0.65;
    const emptyRatio = messages.filter((m) => !m.content.trim()).length / messages.length;
    return Math.max(0.1, base - emptyRatio * 0.3);
  }
}

export const chatgptExtractor = new ChatGPTExtractor();
