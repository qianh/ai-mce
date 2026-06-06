import type { ConversationExtractor } from './base';
import type { ExtractedConversation } from '../types';
import { EXTRACTOR_VERSION, SCHEMA_VERSION } from './base';
import { contentHash } from '../hash';

type GenericSelectionInput = {
  text: string;
  url: string;
  title?: string;
  capturedAt?: string;
};

export async function createGenericSelectionConversation(input: GenericSelectionInput): Promise<ExtractedConversation> {
  const hash = await contentHash(input.text);
  const title = input.title?.trim() || 'Selected Content';

  return {
    schema_version: SCHEMA_VERSION,
    extractor_version: EXTRACTOR_VERSION,
    source: {
      platform: 'generic_web',
      url: input.url,
      browser_title: title,
      captured_at: input.capturedAt ?? new Date().toISOString(),
    },
    content: {
      title,
      messages: [{ role: 'unknown', content: input.text, index: 0 }],
    },
    extraction_quality: {
      confidence: input.text.length > 50 ? 0.75 : 0.45,
      method: 'selection',
      warnings: input.text.length === 0 ? ['empty_selection'] : [],
      message_count: 1,
      empty_message_count: input.text.trim().length === 0 ? 1 : 0,
    },
    hashes: {
      content_hash: hash,
      message_hashes: [hash],
      source_fingerprint: `generic:${input.url}`,
    },
  };
}

export class GenericSelectionExtractor implements ConversationExtractor {
  platform = 'generic_web' as const;

  canHandle(_url: string, _document: Document): boolean {
    return true;
  }

  async extract(document: Document, url: string): Promise<ExtractedConversation> {
    // In browser context, caller injects selection via _selectionText
    const selection = (document as Document & { _selectionText?: string })._selectionText ?? '';
    return createGenericSelectionConversation({ text: selection, url, title: document.title });
  }
}

export const genericExtractor = new GenericSelectionExtractor();
