import { describe, test, expect, beforeEach } from 'bun:test';
import { getTokens, setTokens, clearTokens, isLoggedIn } from './auth';

// Mock localStorage for Bun's Node-like test environment
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
};
(globalThis as unknown as Record<string, unknown>).localStorage = localStorageMock;

beforeEach(() => {
  localStorage.clear();
});

describe('auth', () => {
  test('isLoggedIn returns false when no tokens stored', () => {
    expect(isLoggedIn()).toBe(false);
  });

  test('isLoggedIn returns true after setTokens', () => {
    setTokens('acc-tok', 'ref-tok');
    expect(isLoggedIn()).toBe(true);
  });

  test('getTokens returns null when nothing stored', () => {
    expect(getTokens()).toBeNull();
  });

  test('getTokens returns stored tokens', () => {
    setTokens('acc-tok', 'ref-tok');
    expect(getTokens()).toEqual({ accessToken: 'acc-tok', refreshToken: 'ref-tok' });
  });

  test('clearTokens removes tokens', () => {
    setTokens('acc-tok', 'ref-tok');
    clearTokens();
    expect(isLoggedIn()).toBe(false);
    expect(getTokens()).toBeNull();
  });
});
