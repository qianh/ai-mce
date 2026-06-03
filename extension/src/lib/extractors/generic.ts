import type { ConversationExtractor } from './base';
import type { ExtractedConversation } from '../types';
import { EXTRACTOR_VERSION, SCHEMA_VERSION } from './base';
import { contentHash } from '../hash';

export class GenericSelectionExtractor implements ConversationExtractor {
  platform = 'generic_web' as const;

  canHandle(_url: string, _document: Document): boolean {
    return true;
  }

  async extract(document: Document, url: string): Promise<ExtractedConversation> {
    // In browser context, caller injects selection via _selectionText
    const selection = (document as Document & { _selectionText?: string })._selectionText ?? '';
    const hash = await contentHash(selection);

    return {
      schema_version: SCHEMA_VERSION,
      extractor_version: EXTRACTOR_VERSION,
      source: {
        platform: 'generic_web',
        url,
        browser_title: document.title,
        captured_at: new Date().toISOString(),
      },
      content: {
        title: document.title || 'Selected Content',
        messages: [{ role: 'unknown', content: selection, index: 0 }],
      },
      extraction_quality: {
        confidence: selection.length > 50 ? 0.75 : 0.45,
        method: 'selection',
        warnings: selection.length === 0 ? ['empty_selection'] : [],
        message_count: 1,
        empty_message_count: selection.trim().length === 0 ? 1 : 0,
      },
      hashes: {
        content_hash: hash,
        message_hashes: [hash],
        source_fingerprint: `generic:${url}`,
      },
    };
  }
}

export const genericExtractor = new GenericSelectionExtractor();
