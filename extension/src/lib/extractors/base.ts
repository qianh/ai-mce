import type { ExtractedConversation } from '../types';

export interface ConversationExtractor {
  platform: string;
  canHandle(url: string, document: Document): boolean;
  extract(document: Document, url: string): Promise<ExtractedConversation>;
}

export const EXTRACTOR_VERSION = '0.1.0';
export const SCHEMA_VERSION = '2026-06-03.v1';
