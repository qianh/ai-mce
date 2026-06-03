import type { SensitiveMatch, SensitiveResult, SensitiveType } from './types';

interface Pattern { type: SensitiveType; regex: RegExp; mask: (m: string) => string }

const PATTERNS: Pattern[] = [
  { type: 'api_key', regex: /sk-[A-Za-z0-9]{8,}/g, mask: (m) => m.slice(0, 3) + '••••' + m.slice(-4) },
  { type: 'api_key', regex: /AKIA[0-9A-Z]{12,}/g, mask: (m) => m.slice(0, 4) + '••••' + m.slice(-4) },
  { type: 'token', regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, mask: () => 'Bearer ••••' },
  { type: 'token', regex: /eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}/g, mask: () => 'eyJ••••' },
  { type: 'password', regex: /(?:password|passwd|pwd)\s*[:=]\s*\S{6,}/gi, mask: (m) => m.replace(/[:=]\s*\S+/, ': ••••') },
  { type: 'email', regex: /[a-zA-Z0-9._%+\-]{2,}@[a-zA-Z0-9.\-]{2,}\.[a-zA-Z]{2,}/g, mask: (m) => { const [u, d] = m.split('@'); return (u ?? '')[0] + '••••@' + d; } },
];

export function detectSensitive(
  messages: Array<{ role: string; content: string; index: number }>
): SensitiveResult {
  const matches: SensitiveMatch[] = [];
  for (const msg of messages) {
    for (const p of PATTERNS) {
      for (const match of msg.content.matchAll(new RegExp(p.regex.source, p.regex.flags))) {
        matches.push({ type: p.type, masked: p.mask(match[0]), message_index: msg.index });
      }
    }
  }
  return { has_sensitive: matches.length > 0, matches };
}
