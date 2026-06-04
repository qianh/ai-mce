import type { ConversationExtractor } from './base';
import type { ExtractedConversation, ExtractedMessage, MessageRole } from '../types';
import { EXTRACTOR_VERSION, SCHEMA_VERSION } from './base';
import { contentHash, messageHash } from '../hash';

export class ChatGPTObserver {
  private observer: MutationObserver | null = null;
  private messageMap = new Map<number, Element>();
  private nextIndex = 0;

  start(document: Document): void {
    if (this.observer) return;
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.scanNode(node as Element);
          }
        }
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    // Capture already-rendered nodes on start
    document.querySelectorAll('[data-message-author-role]').forEach((el) => this.addNode(el));
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  reset(): void {
    this.stop();
    this.messageMap.clear();
    this.nextIndex = 0;
  }

  getMessages(): Element[] {
    return Array.from(this.messageMap.values());
  }

  private scanNode(root: Element): void {
    if (root.hasAttribute('data-message-author-role')) {
      this.addNode(root);
    }
    root.querySelectorAll('[data-message-author-role]').forEach((el) => this.addNode(el));
  }

  private addNode(el: Element): void {
    // Use existing index slot if already tracked (same DOM node)
    for (const [idx, existing] of this.messageMap) {
      if (existing === el) {
        this.messageMap.set(idx, el);
        return;
      }
    }
    this.messageMap.set(this.nextIndex++, el);
  }
}

export const chatgptObserver = new ChatGPTObserver();

export class ChatGPTExtractor implements ConversationExtractor {
  platform = 'chatgpt' as const;

  canHandle(url: string, _document: Document): boolean {
    return url.includes('chatgpt.com');
  }

  async extract(document: Document, url: string): Promise<ExtractedConversation> {
    const observedNodes = chatgptObserver.getMessages();
    const domNodes = Array.from(document.querySelectorAll('[data-message-author-role]'));
    const nodes = observedNodes.length > 0 ? observedNodes : domNodes;

    const messages = await this.nodesToMessages(nodes);
    const allText = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    const hash = await contentHash(allText);
    const msgHashes = await Promise.all(
      messages.map((m) => messageHash(m.role, m.content, m.index))
    );

    const conversationTurnCount = document.querySelectorAll('[data-testid^="conversation-turn-"]').length;
    const isPartial = observedNodes.length > 0 && messages.length < conversationTurnCount;
    const confidence = this.calcConfidence(messages, isPartial);

    const conversationId = this.extractConversationId(url);
    const fingerprint = conversationId ? `chatgpt:${conversationId}` : `chatgpt:${url}`;

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
        method: observedNodes.length > 0 ? 'dom_attr' : 'article',
        warnings: [
          ...(messages.length < 2 ? ['few_messages_detected'] : []),
          ...(isPartial ? ['partial_observer_capture'] : []),
        ],
        message_count: messages.length,
        empty_message_count: messages.filter((m) => !m.content.trim()).length,
      },
      hashes: {
        content_hash: hash,
        message_hashes: msgHashes,
        source_fingerprint: fingerprint,
      },
      metadata: conversationId ? { conversation_id: conversationId } : undefined,
    };
  }

  extractConversationId(url: string): string | null {
    const match = url.match(/\/c\/([a-f0-9-]{8,})/i);
    return match?.[1] ?? null;
  }

  private async nodesToMessages(nodes: Element[]): Promise<ExtractedMessage[]> {
    const messages: ExtractedMessage[] = [];
    nodes.forEach((node, i) => {
      const role = node.getAttribute('data-message-author-role') as MessageRole;
      const content = this.extractText(node);
      if (content.trim()) messages.push({ role, content, index: i });
    });
    return messages;
  }

  private extractText(node: Element): string {
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll('button, [data-testid="copy-turn-action-button"]').forEach((el) => el.remove());
    return (clone.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
  }

  private calcConfidence(messages: ExtractedMessage[], isPartial: boolean): number {
    if (messages.length === 0) return 0.1;
    if (messages.length === 1) return 0.45;
    const hasRoles = messages.some((m) => m.role !== 'unknown');
    const base = hasRoles ? 0.85 : 0.65;
    const emptyRatio = messages.filter((m) => !m.content.trim()).length / messages.length;
    const score = Math.max(0.1, base - emptyRatio * 0.3);
    return isPartial ? Math.min(score, 0.6) : score;
  }
}

export const chatgptExtractor = new ChatGPTExtractor();
