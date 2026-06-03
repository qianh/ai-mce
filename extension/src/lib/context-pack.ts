import type { MemoryCandidateRow } from './types';

export function buildContextPack(
  projectName: string,
  summary: string,
  decisions: MemoryCandidateRow[],
  actions: MemoryCandidateRow[],
): string {
  const sections: string[] = [`# Project Context: ${projectName}\n`];

  if (summary.trim()) {
    sections.push(`## Current Goal\n${summary.trim()}`);
  }

  const decisionItems = decisions.filter((d) => ['L3', 'L4', 'L5'].includes(d.level) && d.status === 'confirmed');
  if (decisionItems.length > 0) {
    sections.push(`## Recent Decisions\n${decisionItems.map((d) => `- ${d.content}`).join('\n')}`);
  }

  const actionItems = actions.filter((a) => ['L1', 'L2'].includes(a.level) && a.status === 'confirmed');
  if (actionItems.length > 0) {
    sections.push(`## Next Actions\n${actionItems.map((a) => `- ${a.content}`).join('\n')}`);
  }

  return sections.join('\n\n');
}
