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

// ─── Memory Level ─────────────────────────────────────────────────────────────

export type MemoryLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface MemoryCandidate {
  content: string;
  level: MemoryLevel;
  confidence: number;
  reason: string;
  requires_confirmation: boolean;
  ttl_days?: number;
  source_message_indexes: number[];
}

// ─── DB Entities ──────────────────────────────────────────────────────────────

export type CaptureStatus = 'pending_ai' | 'processed' | 'ai_failed';
export type CandidateStatus = 'pending' | 'confirmed' | 'ignored' | 'degraded';

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
  summary: string | null;
  message_count: number;
  language: string | null;
  created_at: string;
}

export interface MemoryCandidateRow {
  id: string;
  capture_id: string;
  content: string;
  level: MemoryLevel;
  confidence: number;
  reason: string;
  status: CandidateStatus;
  source_message_indexes: string;
  confirmed_at: string | null;
  created_at: string;
}

export interface ContextPack {
  id: string;
  capture_id: string;
  project_name: string;
  content_markdown: string;
  created_at: string;
}

export interface Settings {
  claude_api_key: string | null;
  default_save_mode: 'summary_and_memory' | 'full_text' | 'notes_only';
  raw_text_retention: 'delete_after_processing' | '7_days' | '30_days' | 'forever';
  schema_version: number;
}

// ─── Message Bridge ───────────────────────────────────────────────────────────

export interface SaveRequest {
  type: 'SAVE_REQUEST';
  conversation: ExtractedConversation;
  save_mode: Settings['default_save_mode'];
  user_note?: string;
}

export type ProgressStep =
  | { step: 'writing_local'; status: 'done' }
  | { step: 'generating_summary'; status: 'running' | 'done' | 'failed' }
  | { step: 'extracting_memories'; status: 'running' | 'done' | 'failed' }
  | { step: 'building_context_pack'; status: 'running' | 'done' | 'failed' };

export interface ProgressUpdate {
  type: 'PROGRESS_UPDATE';
  capture_id: string;
  step: ProgressStep;
  result?: { memory_count?: number; context_pack_id?: string };
}

export interface SaveResult {
  type: 'SAVE_RESULT';
  success: boolean;
  capture_id?: string;
  error?: string;
}
