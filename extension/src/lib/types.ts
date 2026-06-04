// ─── Extractor ───────────────────────────────────────────────────────────────

export type ExtractionMethod =
  | 'dom_attr' | 'testid' | 'article' | 'large_text_blocks'
  | 'selection' | 'manual_paste';

export interface ExtractionQuality {
  confidence: number;
  method: ExtractionMethod;
  warnings: string[];
  message_count: number;
  empty_message_count: number;
}

export type MessageRole = 'user' | 'assistant' | 'system' | 'unknown';

export interface ExtractedMessage {
  role: MessageRole;
  content: string;
  index: number;
  timestamp?: string;
  message_hash?: string;
}

export interface ExtractedConversation {
  schema_version: string;
  extractor_version: string;
  source: {
    platform: 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'generic_web';
    url: string;
    browser_title: string;
    captured_at: string;
    locale?: string;
  };
  content: {
    title: string;
    messages: ExtractedMessage[];
  };
  extraction_quality: ExtractionQuality;
  hashes: {
    content_hash: string;
    message_hashes: string[];
    source_fingerprint: string;
  };
  metadata?: {
    conversation_id?: string;
    model_name?: string;
    language?: string;
  };
}

// ─── Sensitive Detection ──────────────────────────────────────────────────────

export type SensitiveType = 'api_key' | 'token' | 'password' | 'email' | 'phone' | 'id_number';

export interface SensitiveMatch {
  type: SensitiveType;
  masked: string;
  message_index: number;
}

export interface SensitiveResult {
  has_sensitive: boolean;
  matches: SensitiveMatch[];
}

// ─── DB Entities ──────────────────────────────────────────────────────────────

export type CaptureStatus = 'saved' | 'error';

export interface Capture {
  id: string;
  source_platform: string;
  source_url: string;
  source_title: string;
  content_hash: string;
  extraction_quality: ExtractionQuality;
  status: CaptureStatus;
  created_at: string;
}

export interface SourceDocument {
  id: string;
  capture_id: string;
  title: string;
  normalized_text: string | null;
  message_count: number;
  created_at: string;
}

export interface Settings {
  report_mode: 'auto' | 'manual';
  schema_version: number;
}

// ─── Message Bridge ───────────────────────────────────────────────────────────

export interface SaveRequest {
  type: 'SAVE_REQUEST';
  conversation: ExtractedConversation;
}

export type ProgressStep =
  | { step: 'writing_local'; status: 'done' | 'failed' };

export interface ProgressUpdate {
  type: 'PROGRESS_UPDATE';
  capture_id: string;
  step: ProgressStep;
}

export interface SaveResult {
  type: 'SAVE_RESULT';
  success: boolean;
  capture_id?: string;
  error?: string;
}
