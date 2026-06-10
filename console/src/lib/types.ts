export interface CaptureListItem {
  id: string;
  source_platform: string;
  source_url: string;
  source_title: string;
  content_hash: string;
  source_fingerprint: string;
  extraction_quality: Record<string, unknown>;
  metadata: Record<string, unknown>;
  analysis_status: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  index: number;
}

export interface CaptureDetail extends CaptureListItem {
  messages: Message[];
}

export interface ListParams {
  source_side?: 'browser' | 'desktop';
  source_platform?: string;
  limit?: number;
  offset?: number;
}
