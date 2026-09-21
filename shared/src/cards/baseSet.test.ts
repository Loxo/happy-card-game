import { describe, expect, it } from 'vitest';
import { BASE_CARD_SET } from './baseSet.js';
import { CARD_EFFECT_KINDS } from './card.js';

describe('BASE_CARD_SET', () => {
  it('has no duplicate id', () => {
    const ids = BASE_CARD_SET.map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses a known CardEffectKind for every entry that declares one', () => {
    for (const card of BASE_CARD_SET) {
      if (card.effect !== undefined) {
        expect(CARD_EFFECT_KINDS).toContain(card.effect);
      }
    }
  });

  it('includes at least one capped category, one exclusion pair, one upgrade pair, and one bypass card', () => {
    expect(BASE_CARD_SET.some((card) => card.maxOnTable !== undefined)).toBe(true);
    expect(BASE_CARD_SET.some((card) => card.excludedBy && card.excludedBy.length > 0)).toBe(
      true,
    );
    expect(BASE_CARD_SET.some((card) => card.upgrades && card.upgrades.length > 0)).toBe(true);
    expect(
      BASE_CARD_SET.some(
        (card) =>
          (card.bypassExclusion && card.bypassExclusion.length > 0) ||
          (card.bypassCap && card.bypassCap.length > 0),
      ),
    ).toBe(true);
  });

  it('references only categories/ids that exist in the set for requires/excludedBy/upgrades/bypassExclusion/bypassCap', () => {
    const knownCategories = new Set(BASE_CARD_SET.map((card) => card.category));
    const knownIds = new Set(BASE_CARD_SET.map((card) => card.id));
    const knownCategoriesOrIds = new Set([...knownCategories, ...knownIds]);

    for (const card of BASE_CARD_SET) {
      for (const category of card.requires ?? []) {
        expect(knownCategories.has(category)).toBe(true);
      }
      for (const category of card.excludedBy ?? []) {
        expect(knownCategories.has(category)).toBe(true);
      }
      for (const category of card.bypassExclusion ?? []) {
        expect(knownCategories.has(category)).toBe(true);
      }
      for (const category of card.bypassCap ?? []) {
        expect(knownCategories.has(category)).toBe(true);
      }
      // upgrades may reference either a category or a specific card id.
      for (const target of card.upgrades ?? []) {
        expect(knownCategoriesOrIds.has(target)).toBe(true);
      }
    }
  });
});
