import type { ExtractedMessage, SensitiveMatch, SensitiveResult, SensitiveType } from './types';

const SENSITIVE_TYPES: readonly SensitiveType[] = [
  'api_key', 'token', 'email', 'phone', 'id_number', 'password',
];

type SensitivePatternDef = {
  type: SensitiveType;
  source: string;
  flags: string;
  mask: (value: string) => string;
};

const PATTERN_DEFS: SensitivePatternDef[] = [
  {
    type: 'api_key',
    source: String.raw`\bsk-[A-Za-z0-9_-]{8,}\b`,
    flags: 'g',
    mask: (value) => maskToken(value, 3, 4),
  },
  {
    type: 'api_key',
    source: String.raw`\bAKIA[0-9A-Z]{12,}\b`,
    flags: 'g',
    mask: (value) => maskToken(value, 4, 4),
  },
  {
    type: 'token',
    source: String.raw`\b(?:bearer|token)\s+([A-Za-z0-9._~+/=-]{12,})\b`,
    flags: 'gi',
    mask: (value) => maskToken(value, 0, 4),
  },
  {
    type: 'token',
    source: String.raw`\beyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}(?:\.[A-Za-z0-9\-_]+)?\b`,
    flags: 'g',
    mask: (value) => maskToken(value, 3, 4),
  },
  {
    type: 'password',
    source: String.raw`\b(?:password|passwd|pwd)\s*[:=]\s*(\S{6,})`,
    flags: 'gi',
    mask: () => '••••',
  },
  {
    type: 'email',
    source: String.raw`\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`,
    flags: 'gi',
    mask: maskEmail,
  },
  {
    type: 'phone',
    source: String.raw`\b1[3-9]\d{9}\b`,
    flags: 'g',
    mask: (value) => maskToken(value, 3, 4),
  },
  {
    type: 'id_number',
    source: String.raw`\b\d{17}[\dXx]\b`,
    flags: 'g',
    mask: (value) => maskToken(value, 4, 4),
  },
];

function isSensitiveType(value: unknown): value is SensitiveType {
  return typeof value === 'string' && (SENSITIVE_TYPES as readonly string[]).includes(value);
}

function isLikelyFalsePositive(type: SensitiveType, value: string): boolean {
  if (type === 'api_key') {
    // Extracted .env lines can concatenate into phantom keys like sk-xxxPERPLEXITY_API_KEY.
    if (/API_KEY/i.test(value)) return true;
    // Documentation placeholders such as sk-xxx or sk-ant-xxx.
    if (/^sk-(?:[a-z-]+-)?[xX]{3,}$/.test(value)) return true;
  }
  return false;
}

function buildMatchContext(content: string, value: string, masked: string): string {
  const idx = content.indexOf(value);
  if (idx < 0) return masked;

  const radius = 18;
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + value.length + radius);
  let snippet = `${content.slice(start, idx)}${masked}${content.slice(idx + value.length, end)}`
    .replace(/\s+/g, ' ')
    .trim();

  if (start > 0) snippet = `…${snippet}`;
  if (end < content.length) snippet = `${snippet}…`;
  return snippet;
}

function matchDedupKey(match: SensitiveMatch): string {
  if (match.type === 'password') {
    return `${match.type}:${match.message_index}:${match.value ?? match.masked}`;
  }
  return `${match.type}:${match.message_index}:${match.masked}`;
}

export function dedupeSensitiveMatches(matches: SensitiveMatch[]): SensitiveMatch[] {
  const seen = new Set<string>();
  const deduped: SensitiveMatch[] = [];

  for (const match of matches) {
    const key = matchDedupKey(match);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(match);
  }

  return deduped;
}

export function parseSensitiveResult(value: unknown): SensitiveResult | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Partial<SensitiveResult>;
  if (!Array.isArray(result.matches)) return null;

  const matches: SensitiveMatch[] = [];
  for (const item of result.matches) {
    if (!item || typeof item !== 'object') continue;
    const match = item as Partial<SensitiveMatch>;
    if (!isSensitiveType(match.type)) continue;
    if (typeof match.masked !== 'string' || match.masked.length === 0) continue;
    if (
      typeof match.message_index !== 'number'
      || !Number.isInteger(match.message_index)
      || match.message_index < 0
    ) continue;

    matches.push({
      type: match.type,
      masked: match.masked,
      message_index: match.message_index,
      ...(typeof match.context === 'string' && match.context.length > 0 ? { context: match.context } : {}),
      ...(typeof match.value === 'string' ? { value: match.value } : {}),
    } satisfies SensitiveMatch);
  }

  const deduped = dedupeSensitiveMatches(matches);
  return { has_sensitive: deduped.length > 0, matches: deduped };
}

export function detectSensitive(messages: ExtractedMessage[]): SensitiveResult {
  const matches: SensitiveMatch[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    for (const entry of PATTERN_DEFS) {
      const pattern = new RegExp(entry.source, entry.flags);

      for (const match of message.content.matchAll(pattern)) {
        const value = match[1] ?? match[0];
        if (isLikelyFalsePositive(entry.type, value)) continue;

        const masked = entry.mask(value);
        const candidate: SensitiveMatch = {
          type: entry.type,
          masked,
          message_index: message.index,
          context: buildMatchContext(message.content, value, masked),
          ...(entry.type === 'password' ? { value } : {}),
        };
        const key = matchDedupKey(candidate);
        if (seen.has(key)) continue;
        seen.add(key);

        matches.push(candidate);
      }
    }
  }

  return { has_sensitive: matches.length > 0, matches };
}

function maskToken(value: string, prefixLength: number, suffixLength: number): string {
  if (value.length <= prefixLength + suffixLength) {
    return `${value.slice(0, 1)}••••${value.slice(-1)}`;
  }

  return `${value.slice(0, prefixLength)}••••${value.slice(-suffixLength)}`;
}

function maskEmail(value: string): string {
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return maskToken(value, 1, 4);

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  const first = local.slice(0, 1);
  const last = local.length > 1 ? local.slice(-1) : '';

  return `${first}${'•'.repeat(10)}${last}${domain}`;
}
