import { describe, expect, test } from 'bun:test';
import { isCurrentDetailRequest } from './captureDetailState';

describe('capture detail state', () => {
  test('rejects responses from older detail requests', () => {
    expect(isCurrentDetailRequest(2, 1)).toBe(false);
  });

  test('accepts the latest detail request response', () => {
    expect(isCurrentDetailRequest(2, 2)).toBe(true);
  });
});
