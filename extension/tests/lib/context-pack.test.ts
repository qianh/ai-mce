import { describe, it, expect } from 'vitest';
import { buildContextPack } from '../../src/lib/context-pack';
import type { MemoryCandidateRow } from '../../src/lib/types';

const makeRow = (content: string, level: string, status = 'confirmed'): MemoryCandidateRow => ({
  id: '1', capture_id: 'c1', content, level: level as any, confidence: 0.9,
  reason: 'test', status: status as any, source_message_indexes: '[0]',
  confirmed_at: null, created_at: '2026-06-03',
});

describe('buildContextPack', () => {
  it('generates project heading', () => {
    expect(buildContextPack('Test Project', '', [], [])).toContain('# Project Context: Test Project');
  });
  it('includes summary as Current Goal', () => {
    const md = buildContextPack('P', 'My goal', [], []);
    expect(md).toContain('## Current Goal');
    expect(md).toContain('My goal');
  });
  it('includes L5 decisions', () => {
    const md = buildContextPack('P', 'g', [makeRow('Decision A', 'L5')], []);
    expect(md).toContain('## Recent Decisions');
    expect(md).toContain('- Decision A');
  });
  it('omits empty sections', () => {
    const md = buildContextPack('P', '', [], []);
    expect(md).not.toContain('## Recent Decisions');
    expect(md).not.toContain('## Next Actions');
    expect(md).not.toContain('## Current Goal');
  });
  it('includes L2 next actions', () => {
    const md = buildContextPack('P', 'g', [], [makeRow('Do X', 'L2')]);
    expect(md).toContain('## Next Actions');
    expect(md).toContain('- Do X');
  });
  it('excludes pending candidates from decisions', () => {
    const md = buildContextPack('P', 'g', [makeRow('Secret', 'L5', 'pending')], []);
    expect(md).not.toContain('Secret');
  });
});
