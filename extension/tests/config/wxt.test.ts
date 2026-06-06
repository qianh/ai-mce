import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('wxt cloud api host permission', () => {
  it('allows local API servers on any localhost port without broad all_urls permission', () => {
    const config = readFileSync(join(process.cwd(), 'wxt.config.ts'), 'utf8');

    expect(config).toContain("'http://localhost/*'");
    expect(config).not.toContain("'http://localhost:8000/*'");
    expect(config).not.toContain("'<all_urls>'");
  });
});
