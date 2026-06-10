import { beforeEach, describe, expect, test } from 'bun:test';
import { getCapture } from './api';

const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const key of Object.keys(store)) delete store[key]; },
};

(globalThis as unknown as { localStorage: typeof localStorageMock }).localStorage = localStorageMock;

beforeEach(() => {
  localStorage.clear();
});

describe('api', () => {
  test('preserves HTTP status on request failures', async () => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = async () => (
      new Response(JSON.stringify({ detail: 'Capture not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    let caught: unknown;
    try {
      await getCapture('missing-capture');
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as { status?: number }).status).toBe(404);
    expect((caught as Error).message).toBe('Capture not found');
  });
});
