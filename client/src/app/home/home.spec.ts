import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import type { RoomStateMessage } from '@happy-card-game/shared';
import { Home } from './home';
import { WsService } from '../ws.service';

@Component({ selector: 'app-room-stub', template: '' })
class RoomStub {}

describe('Home', () => {
  let ws: WsService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([{ path: 'room/:code', component: RoomStub }])],
    }).compileComponents();

    router = TestBed.inject(Router);
    ws = TestBed.inject(WsService);
  });

  function create() {
    const fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
    return fixture;
  }

  it('sends CreateRoom when "Create room" is clicked', () => {
    const spy = vi.spyOn(ws, 'createRoom');
    const fixture = create();

    fixture.nativeElement.querySelector('button[type="button"]').click();

    expect(spy).toHaveBeenCalled();
  });

  it('sends JoinRoom with the trimmed, upper-cased code and ignores a blank one', async () => {
    const spy = vi.spyOn(ws, 'joinRoom');
    const fixture = create();
    const inputDe = fixture.debugElement.query(By.css('input[name="joinCode"]'));
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');

    inputDe.triggerEventHandler('ngModelChange', '  abcde  ');
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(spy).toHaveBeenCalledWith('ABCDE');

    spy.mockClear();
    inputDe.triggerEventHandler('ngModelChange', '   ');
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    expect(spy).not.toHaveBeenCalled();
  });

  it('navigates to /room/:code once a RoomState lands, from either Create or Join', async () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    const fixture = create();

    ws.roomState.set({
      type: 'RoomState',
      code: 'WXYZ1',
      players: ['p1'],
      hostId: 'p1',
      yourPlayerId: 'p1',
    } satisfies RoomStateMessage);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(navigateSpy).toHaveBeenCalledWith(['/room', 'WXYZ1']);
  });

  it('shows the rejection reason and disables actions while connecting', () => {
    const fixture = create();
    ws.actionRejectedReason.set('room-full');
    ws.status.set('connecting');
    fixture.detectChanges();

    const error = fixture.nativeElement.querySelector('.error');
    expect(error?.textContent).toContain('room-full');

    const createButton = fixture.nativeElement.querySelector('button[type="button"]');
    expect(createButton.disabled).toBe(true);
  });
});
