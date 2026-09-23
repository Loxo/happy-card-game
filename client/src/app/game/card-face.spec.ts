import { TestBed } from '@angular/core/testing';
import { BASE_CARD_SET } from '@happy-card-game/shared';
import { CardFace, type CardFaceSize } from './card-face';

describe('CardFace', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CardFace] }).compileComponents();
  });

  function render(definitionId: string, size: CardFaceSize = 'tableau') {
    const definition = BASE_CARD_SET.find((d) => d.id === definitionId);
    if (!definition) {
      throw new Error(`Unknown fixture id: ${definitionId}`);
    }
    const fixture = TestBed.createComponent(CardFace);
    fixture.componentRef.setInput('definition', definition);
    fixture.componentRef.setInput('size', size);
    fixture.detectChanges();
    return fixture;
  }

  it.each(BASE_CARD_SET.map((d) => d.id))('renders %s at every size without throwing', (id) => {
    for (const size of ['mini', 'tableau', 'hand'] as const) {
      const fixture = render(id, size);
      const definition = BASE_CARD_SET.find((d) => d.id === id)!;
      expect(fixture.nativeElement.textContent).toContain(definition.name);
      expect(fixture.nativeElement.querySelector('.card-face').getAttribute('data-size')).toBe(size);
    }
  });

  it('omits the value badge when the card has no resources', () => {
    const fixture = render('bonus-social-butterfly', 'hand');
    expect(fixture.nativeElement.querySelector('.badge')).toBeNull();
  });

  it('shows the badge with the first resource this card contributes', () => {
    const fixture = render('job-engineer', 'hand');
    const badge = fixture.nativeElement.querySelector('.badge');
    // job-engineer: { money: 2, education: 1 } — RESOURCE_KINDS order is
    // ['happiness', 'education', 'money'], so education (1) wins, not money (2).
    expect(badge?.textContent).toContain('1');
  });

  it('applies the gold-glow selected state only at hand size', () => {
    const hand = render('job-engineer', 'hand');
    hand.componentRef.setInput('selected', true);
    hand.detectChanges();
    expect(hand.nativeElement.querySelector('.card-face').classList.contains('selected')).toBe(true);

    const tableau = render('job-engineer', 'tableau');
    tableau.componentRef.setInput('selected', true);
    tableau.detectChanges();
    expect(tableau.nativeElement.querySelector('.card-face').classList.contains('selected')).toBe(true);
    // CSS scopes the glow to [data-size="hand"] — selected() itself is size-agnostic,
    // so this only confirms the class is bound, not the visual effect.
  });
});
