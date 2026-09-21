import { describe, expect, it } from 'vitest';
import { SHARED_PACKAGE_NAME } from './index.js';

describe('shared barrel', () => {
  it('exports the package name placeholder', () => {
    expect(SHARED_PACKAGE_NAME).toBe('@happy-card-game/shared');
  });
});
