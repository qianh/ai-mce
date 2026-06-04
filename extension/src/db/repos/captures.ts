import { dbExec, dbQuery } from '../bridge';
import type { Capture, ExtractedConversation } from '../../lib/types';

function captureRow(conv: ExtractedConversation, id: string, now: string): unknown[] {
  return [
    id,
    conv.source.platform,
    conv.source.url,
    conv.content.title,
    conv.hashes.content_hash,
    conv.hashes.source_fingerprint,
    JSON.stringify(conv.extraction_quality),
    now,
    now,
  ];
}

function sourceDocRow(conv: ExtractedConversation, captureId: string, now: string): unknown[] {
  const text = conv.content.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
  return [crypto.randomUUID(), captureId, conv.content.title, text, conv.content.messages.length, now];
}

export async function insertCapture(conv: ExtractedConversation): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbExec(
    `INSERT INTO captures (id, source_platform, source_url, source_title, content_hash, source_fingerprint, extraction_quality, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'saved', ?, ?)`,
    captureRow(conv, id, now)
  );
  await dbExec(
    `INSERT INTO source_documents (id, capture_id, title, normalized_text, message_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    sourceDocRow(conv, id, now)
  );
  return id;
}

export async function upsertCapture(conv: ExtractedConversation): Promise<string> {
  const now = new Date().toISOString();
  const fingerprint = conv.hashes.source_fingerprint;

  const existing = await dbQuery<[string]>(
    'SELECT id FROM captures WHERE source_fingerprint = ? LIMIT 1',
    [fingerprint]
  );

  if (existing.length && existing[0]) {
    const [id] = existing[0];
    const text = conv.content.messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    await dbExec(
      `UPDATE captures SET content_hash = ?, extraction_quality = ?, source_title = ?, updated_at = ? WHERE id = ?`,
      [conv.hashes.content_hash, JSON.stringify(conv.extraction_quality), conv.content.title, now, id]
    );
    await dbExec(
      `UPDATE source_documents SET normalized_text = ?, message_count = ? WHERE capture_id = ?`,
      [text, conv.content.messages.length, id]
    );
    return id as string;
  }

  return insertCapture(conv);
}

export async function getCaptureByFingerprint(contentHash: string): Promise<Capture | null> {
  const rows = await dbQuery<[string, string, string, string, string, string, string, string, string]>(
    'SELECT id, source_platform, source_url, source_title, content_hash, source_fingerprint, extraction_quality, status, created_at FROM captures WHERE content_hash = ? LIMIT 1',
    [contentHash]
  );
  if (!rows.length || !rows[0]) return null;
  const [id, sp, url, title, ch, sf, eq, status, ca] = rows[0];
  return {
    id, source_platform: sp, source_url: url, source_title: title,
    content_hash: ch, extraction_quality: JSON.parse(eq as string),
    status: status as Capture['status'], created_at: ca,
  };
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

export async function getCaptureMessages(id: string): Promise<string | null> {
  const rows = await dbQuery<[string]>(
    'SELECT normalized_text FROM source_documents WHERE capture_id = ? LIMIT 1',
    [id]
  );
  return rows[0]?.[0] ?? null;
}

export async function deleteCapture(id: string): Promise<void> {
  await dbExec('DELETE FROM captures WHERE id = ?', [id]);
}
