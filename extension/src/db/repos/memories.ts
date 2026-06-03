import { dbExec, dbQuery } from '../bridge';
import type { MemoryCandidateRow, MemoryCandidate, MemoryLevel } from '../../lib/types';

export async function insertCandidates(captureId: string, candidates: MemoryCandidate[]): Promise<void> {
  for (const c of candidates) {
    const id = crypto.randomUUID();
    const requiresConfirm = ['L4', 'L5'].includes(c.level);
    const status = requiresConfirm ? 'pending' : (c.confidence >= 0.7 ? 'confirmed' : 'pending');
    await dbExec(
      `INSERT INTO memory_candidates (id, capture_id, content, level, confidence, reason, status, source_message_indexes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, captureId, c.content, c.level, c.confidence, c.reason, status,
       JSON.stringify(c.source_message_indexes), new Date().toISOString()]
    );
    if (status === 'confirmed') {
      await dbExec(
        `INSERT INTO memory_items (id, capture_id, candidate_id, content, level, confirmed_by_user, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
        [crypto.randomUUID(), captureId, id, c.content, c.level, new Date().toISOString()]
      );
    }
  }
}

export async function confirmCandidate(id: string): Promise<void> {
  const rows = await dbQuery<[string, string, string]>(
    'SELECT capture_id, content, level FROM memory_candidates WHERE id = ?', [id]
  );
  if (!rows.length || !rows[0]) return;
  const [captureId, content, level] = rows[0];
  await dbExec(
    'UPDATE memory_candidates SET status = ?, confirmed_at = ? WHERE id = ?',
    ['confirmed', new Date().toISOString(), id]
  );
  await dbExec(
    `INSERT INTO memory_items (id, capture_id, candidate_id, content, level, confirmed_by_user, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [crypto.randomUUID(), captureId, id, content, level, new Date().toISOString()]
  );
}

export async function listCandidatesForCapture(captureId: string): Promise<MemoryCandidateRow[]> {
  const rows = await dbQuery<[string, string, string, string, number, string, string, string, string | null, string]>(
    `SELECT id, capture_id, content, level, confidence, reason, status, source_message_indexes, confirmed_at, created_at
     FROM memory_candidates WHERE capture_id = ? ORDER BY level DESC`,
    [captureId]
  );
  return rows.map(([id, cid, content, level, confidence, reason, status, smi, ca, crat]) => ({
    id, capture_id: cid, content, level: level as MemoryLevel, confidence: confidence as number,
    reason, status: status as MemoryCandidateRow['status'],
    source_message_indexes: smi, confirmed_at: ca, created_at: crat,
  }));
}

export async function listPendingCandidates(): Promise<MemoryCandidateRow[]> {
  const rows = await dbQuery<[string, string, string, string, number, string, string, string, string | null, string]>(
    `SELECT id, capture_id, content, level, confidence, reason, status, source_message_indexes, confirmed_at, created_at
     FROM memory_candidates WHERE status = 'pending' ORDER BY created_at DESC`
  );
  return rows.map(([id, cid, content, level, confidence, reason, status, smi, ca, crat]) => ({
    id, capture_id: cid, content, level: level as MemoryLevel, confidence: confidence as number,
    reason, status: status as MemoryCandidateRow['status'],
    source_message_indexes: smi, confirmed_at: ca, created_at: crat,
  }));
}
