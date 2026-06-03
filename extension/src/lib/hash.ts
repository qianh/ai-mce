const UI_COPY_PATTERNS = [
  /^Copy code$/m,
  /^Regenerate$/m,
  /^Copy$/m,
  /^Share$/m,
  /^Edit message$/m,
  /^\d+ \/ \d+$/m,
];

export function normalizeForHash(text: string): string {
  let normalized = text.trim();
  for (const pattern of UI_COPY_PATTERNS) {
    normalized = normalized.replace(pattern, '');
  }
  return normalized
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function contentHash(text: string): Promise<string> {
  const normalized = normalizeForHash(text);
  const data = new TextEncoder().encode(normalized);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function messageHash(role: string, content: string, index: number): Promise<string> {
  return contentHash(`${role}:${index}:${content}`);
}
