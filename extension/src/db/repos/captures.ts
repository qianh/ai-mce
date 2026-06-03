import { dbExec, dbQuery } from '../bridge';
import type { Capture, ExtractedConversation } from '../../lib/types';

export async function insertCapture(conv: ExtractedConversation): Promise<string> {
  const id = crypto.randomUUID();
  const docId = crypto.randomUUID();
  const now = new Date().toISOString();
  const text = conv.content.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');

  await dbExec(
    `INSERT INTO captures (id, source_platform, source_url, source_title, content_hash, extraction_quality, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending_ai', ?)`,
    [id, conv.source.platform, conv.source.url, conv.content.title,
     conv.hashes.content_hash, JSON.stringify(conv.extraction_quality), now]
  );
  await dbExec(
    `INSERT INTO source_documents (id, capture_id, title, normalized_text, message_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [docId, id, conv.content.title, text, conv.content.messages.length, now]
  );
  return id;
}

export async function getCaptureByHash(hash: string): Promise<Capture | null> {
  const rows = await dbQuery<[string, string, string, string, string, string, string, string]>(
    'SELECT id, source_platform, source_url, source_title, content_hash, extraction_quality, status, created_at FROM captures WHERE content_hash = ? LIMIT 1',
    [hash]
  );
  if (!rows.length || !rows[0]) return null;
  const [id, sp, url, title, ch, eq, status, ca] = rows[0];
  return { id, source_platform: sp, source_url: url, source_title: title, content_hash: ch, extraction_quality: JSON.parse(eq as string), status: status as Capture['status'], created_at: ca };
}

export async function listCaptures(): Promise<Capture[]> {
  const rows = await dbQuery<[string, string, string, string, string, string, string, string]>(
    'SELECT id, source_platform, source_url, source_title, content_hash, extraction_quality, status, created_at FROM captures ORDER BY created_at DESC'
  );
  return rows.map(([id, sp, url, title, ch, eq, status, ca]) => ({
    id, source_platform: sp, source_url: url, source_title: title, content_hash: ch,
    extraction_quality: JSON.parse(eq as string), status: status as Capture['status'], created_at: ca,
  }));
}

export async function updateCaptureStatus(id: string, status: Capture['status']): Promise<void> {
  await dbExec('UPDATE captures SET status = ? WHERE id = ?', [status, id]);
}

export async function updateCaptureSummary(id: string, summary: string): Promise<void> {
  await dbExec('UPDATE source_documents SET summary = ? WHERE capture_id = ?', [summary, id]);
}

export async function deleteCapture(id: string): Promise<void> {
  await dbExec('DELETE FROM captures WHERE id = ?', [id]);
}
