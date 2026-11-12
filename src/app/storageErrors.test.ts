import { describe, expect, it } from 'vitest';
import { isQuotaError } from './storageErrors';

describe('isQuotaError', () => {
  it('spots the DOM error, Firefox’s name and Dexie’s wrapper', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true);
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaError({ name: 'AbortError', inner: { name: 'QuotaExceededError' } })).toBe(true);
    expect(isQuotaError(new Error('other'))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });
});
