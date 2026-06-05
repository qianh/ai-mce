import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('wxt cloud api host permission', () => {
  it('allows the default local API server without broad all_urls permission', () => {
    const config = readFileSync(join(process.cwd(), 'wxt.config.ts'), 'utf8');

    expect(config).toContain("'http://localhost:8000/*'");
    expect(config).not.toContain("'<all_urls>'");
  });
});
