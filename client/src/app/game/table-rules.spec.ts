import type { CardInstance } from '@happy-card-game/shared';
import { canPlayCard, categoryAtCap, getDefinition, resolveUpgrade } from './table-rules';

function card(instanceId: string, definitionId: string): CardInstance {
  return { instanceId, definitionId };
}

describe('table-rules (client mirror of the server play-rules check)', () => {
  it('rejects a card whose category is already at its cap', () => {
    const table = [card('t1', 'job-waiter')];
    const check = canPlayCard(table, getDefinition('job-waiter'));
    expect(check).toEqual({ ok: false, reason: 'cap' });
  });

  it('rejects a card excluded by a category already on the table', () => {
    const table = [card('t1', 'relationship-marriage')];
    const check = canPlayCard(table, getDefinition('flirt-crush'));
    expect(check).toEqual({ ok: false, reason: 'exclusion' });
  });

  it('rejects a card missing a required prerequisite category', () => {
    const check = canPlayCard([], getDefinition('child-baby'));
    expect(check).toEqual({ ok: false, reason: 'prerequisite' });
  });

  it('allows an exclusion to be bypassed by an active bonus card', () => {
    const table = [card('t1', 'relationship-marriage'), card('t2', 'bonus-infidelity')];
    const check = canPlayCard(table, getDefinition('flirt-crush'));
    expect(check).toEqual({ ok: true });
  });

  it('allows a cap to be bypassed by an active bonus card', () => {
    const table = [
      card('t1', 'flirt-crush'),
      card('t2', 'flirt-date'),
      card('t3', 'flirt-kiss'),
      card('t4', 'bonus-social-butterfly'),
    ];
    // flirt-crush/-date/-kiss all share the 'flirt' category (cap 5); this
    // table already has 3 more of the same category via those three cards.
    const check = canPlayCard(table, getDefinition('flirt-crush'));
    expect(check).toEqual({ ok: true });
  });

  it('excludes the upgrade target from its own cap check', () => {
    const table = [card('t1', 'job-engineer')];
    const upgradeTarget = resolveUpgrade(table, getDefinition('job-senior-engineer'));
    expect(upgradeTarget?.instanceId).toBe('t1');
    const check = canPlayCard(table, getDefinition('job-senior-engineer'), upgradeTarget);
    expect(check).toEqual({ ok: true });
  });

  it('flags a category as at-cap once its maxOnTable is reached', () => {
    const table = [card('t1', 'job-waiter')];
    expect(categoryAtCap(table, 'job')).toBe(true);
    expect(categoryAtCap(table, 'flirt')).toBe(false);
  });

  it('treats a capped category as not-at-cap once a bypass card is active', () => {
    const fiveFlirts = ['t1', 't2', 't3', 't4', 't5'].map((id) => card(id, 'flirt-crush'));
    expect(categoryAtCap(fiveFlirts, 'flirt')).toBe(true);

    const bypassed = [...fiveFlirts, card('t6', 'bonus-social-butterfly')];
    expect(categoryAtCap(bypassed, 'flirt')).toBe(false);
  });
});
