import { dbExec, dbQuery } from '../bridge';
import type { ContextPack } from '../../lib/types';

export async function insertContextPack(captureId: string, projectName: string, markdown: string): Promise<string> {
  const id = crypto.randomUUID();
  await dbExec(
    'INSERT INTO context_packs (id, capture_id, project_name, content_markdown, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, captureId, projectName, markdown, new Date().toISOString()]
  );
  return id;
}

export async function getContextPackForCapture(captureId: string): Promise<ContextPack | null> {
  const rows = await dbQuery<[string, string, string, string, string]>(
    'SELECT id, capture_id, project_name, content_markdown, created_at FROM context_packs WHERE capture_id = ? ORDER BY created_at DESC LIMIT 1',
    [captureId]
  );
  if (!rows.length || !rows[0]) return null;
  const [id, cid, pn, md, ca] = rows[0];
  return { id, capture_id: cid, project_name: pn, content_markdown: md, created_at: ca };
}
