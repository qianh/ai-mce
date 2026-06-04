import type { ConversationExtractor } from './base';
import type { ExtractedConversation, ExtractedMessage, MessageRole } from '../types';
import { EXTRACTOR_VERSION, SCHEMA_VERSION } from './base';
import { contentHash, messageHash } from '../hash';

const EXPLICIT_MESSAGE_SELECTORS = [
  '[data-ds-message]',
  '[data-message-author-role]',
  '[data-message-role]',
  '[data-role="user"]',
  '[data-role="assistant"]',
  '[data-role="ai"]',
  '[class*="message"][class*="user"]',
  '[class*="message"][class*="assistant"]',
].join(',');

const CONTENT_BLOCK_SELECTORS = [
  '.ds-markdown',
  '[class*="ds-markdown"]',
  '[class*="markdown"]',
].join(',');

export class DeepSeekObserver {
  private observer: MutationObserver | null = null;
  private messageMap = new Map<number, Element>();
  private document: Document | null = null;
  private routeUrl: string | null = null;
  private nextIndex = 0;

  start(document: Document, routeUrl?: string): void {
    if (this.observer) return;
    this.document = document;
    this.routeUrl = routeUrl ? this.normalizeRouteUrl(routeUrl) : null;
    const MutationObserverCtor = document.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    if (!MutationObserverCtor) return;
    this.observer = new MutationObserverCtor((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.scanNode(node as Element);
          }
        }
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll(EXPLICIT_MESSAGE_SELECTORS).forEach((el) => this.addNode(el));
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  reset(): void {
    this.stop();
    this.messageMap.clear();
    this.document = null;
    this.routeUrl = null;
    this.nextIndex = 0;
  }

  getMessages(routeUrl?: string, document?: Document): Element[] {
    if (document && this.document && this.document !== document) return [];
    if (routeUrl && this.routeUrl && this.routeUrl !== this.normalizeRouteUrl(routeUrl)) return [];

    return Array.from(this.messageMap.values()).filter((node) => (
      (!document || node.ownerDocument === document) && node.isConnected
    ));
  }

  private scanNode(root: Element): void {
    if (root.matches(EXPLICIT_MESSAGE_SELECTORS)) {
      this.addNode(root);
    }
    root.querySelectorAll(EXPLICIT_MESSAGE_SELECTORS).forEach((el) => this.addNode(el));
  }

  private addNode(el: Element): void {
    for (const [idx, existing] of this.messageMap) {
      if (existing === el) {
        this.messageMap.set(idx, el);
        return;
      }
    }
    this.messageMap.set(this.nextIndex++, el);
  }

  private normalizeRouteUrl(url: string): string {
    try {
      return new URL(url).href;
    } catch {
      return url;
    }
  }
}

export const deepseekObserver = new DeepSeekObserver();

export class DeepSeekExtractor implements ConversationExtractor {
  platform = 'deepseek' as const;

  canHandle(url: string, _document: Document): boolean {
    try {
      return new URL(url).hostname === 'chat.deepseek.com';
    } catch {
      return url.includes('chat.deepseek.com');
    }
  }

  async extract(document: Document, url: string): Promise<ExtractedConversation> {
    const observedNodes = deepseekObserver.getMessages(url, document);
    const domNodes = Array.from(document.querySelectorAll(EXPLICIT_MESSAGE_SELECTORS));
    const nodes = observedNodes.length > 0 ? observedNodes : domNodes;

    const messages = this.ensureConversationPrompt(
      document,
      nodes.length > 0 ? await this.nodesToMessages(nodes) : await this.fallbackMessages(document)
    );
    const allText = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    const hash = await contentHash(allText);
    const msgHashes = await Promise.all(
      messages.map((m) => messageHash(m.role, m.content, m.index))
    );
    const conversationId = this.extractConversationId(url);
    const totalMessageCount = domNodes.length;
    const isPartial = observedNodes.length > 0 && messages.length < totalMessageCount;

    return {
      schema_version: SCHEMA_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      source: {
        platform: 'deepseek',
        url,
        browser_title: document.title || 'DeepSeek',
        captured_at: new Date().toISOString(),
        locale: document.documentElement.lang || undefined,
      },
      content: {
        title: this.extractConversationTitle(document) || document.title || 'DeepSeek 对话',
        messages,
      },
      extraction_quality: {
        confidence: this.calcConfidence(messages, isPartial),
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
        source_fingerprint: conversationId ? `deepseek:${conversationId}` : `deepseek:${url}`,
      },
      metadata: conversationId ? { conversation_id: conversationId } : undefined,
    };
  }

  extractConversationId(url: string): string | null {
    const patterns = [
      /\/a\/chat\/s\/([^/?#]+)/i,
      /\/chat\/s\/([^/?#]+)/i,
      /\/chat\/([^/?#]+)/i,
      /[?&](?:conversation_id|conversationId|id)=([^&#]+)/i,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
    return null;
  }

  private async nodesToMessages(nodes: Element[]): Promise<ExtractedMessage[]> {
    const messages: ExtractedMessage[] = [];
    nodes.forEach((node, i) => {
      const role = this.extractRole(node);
      const content = this.extractText(node);
      if (content.trim()) messages.push({ role, content, index: i });
    });
    return messages;
  }

  private async fallbackMessages(document: Document): Promise<ExtractedMessage[]> {
    const contentNodes = this.compactNodes(Array.from(document.querySelectorAll(CONTENT_BLOCK_SELECTORS)));
    return contentNodes
      .map((node, index): ExtractedMessage => ({
        role: 'assistant',
        content: this.extractText(node),
        index,
      }))
      .filter((message) => message.content.trim().length > 0);
  }

  private compactNodes(nodes: Element[]): Element[] {
    return nodes.filter((node, index) => (
      nodes.findIndex((candidate) => candidate === node) === index &&
      !nodes.some((candidate) => candidate !== node && candidate.contains(node))
    ));
  }

  private ensureConversationPrompt(document: Document, messages: ExtractedMessage[]): ExtractedMessage[] {
    if (!messages.length || messages.some((message) => message.role === 'user')) return messages;

    const title = this.extractConversationTitle(document);
    if (!title) return messages;

    const firstMessage = messages[0];
    if (firstMessage?.content.trim() === title) return messages;

    return [
      { role: 'user', content: title, index: 0 },
      ...messages.map((message, index) => ({ ...message, index: index + 1 })),
    ];
  }

  private extractConversationTitle(document: Document): string | null {
    const fromDocumentTitle = this.cleanTitle(document.title);
    if (fromDocumentTitle) return fromDocumentTitle;

    const candidates = Array.from(document.querySelectorAll([
      'main h1',
      'main h2',
      'main header div',
      'main [class*="title"]',
      'main [class*="question"]',
      'main [class*="query"]',
    ].join(',')));

    for (const candidate of candidates) {
      const title = this.cleanTitle(candidate.textContent ?? '');
      if (title) return title;
    }

    return null;
  }

  private cleanTitle(title: string): string | null {
    const cleaned = title
      .replace(/\s*[-–|]\s*DeepSeek.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || /^deepseek$/i.test(cleaned) || /^new chat$/i.test(cleaned)) return null;
    return cleaned.length <= 200 ? cleaned : null;
  }

  private extractRole(node: Element): MessageRole {
    const raw = [
      node.getAttribute('data-ds-role'),
      node.getAttribute('data-message-author-role'),
      node.getAttribute('data-message-role'),
      node.getAttribute('data-role'),
      node.getAttribute('aria-label'),
      typeof node.className === 'string' ? node.className : '',
    ].filter(Boolean).join(' ').toLowerCase();

    if (raw.includes('assistant') || raw.includes('ai') || raw.includes('bot')) return 'assistant';
    if (raw.includes('user') || raw.includes('human')) return 'user';
    return 'unknown';
  }

  private extractText(node: Element): string {
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll('button, svg, style, script').forEach((el) => el.remove());
    return (clone.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim();
  }

  private calcConfidence(messages: ExtractedMessage[], isPartial: boolean): number {
    if (messages.length === 0) return 0.1;
    if (messages.length === 1) return 0.45;
    const hasKnownRoles = messages.some((m) => m.role !== 'unknown');
    const base = hasKnownRoles ? 0.82 : 0.62;
    const emptyRatio = messages.filter((m) => !m.content.trim()).length / messages.length;
    const score = Math.max(0.1, base - emptyRatio * 0.3);
    return isPartial ? Math.min(score, 0.6) : score;
  }
}

export const deepseekExtractor = new DeepSeekExtractor();
