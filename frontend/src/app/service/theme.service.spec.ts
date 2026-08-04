import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

const STORAGE_KEY = 'nyelvszo_theme';

interface FakeDocument {
  documentElement: HTMLElement;
  defaultView: { matchMedia: jasmine.Spy };
  /** Fire the media query listener the service registered. */
  emitSystemChange(matches: boolean): void;
}

/**
 * A document whose root element and media query are ours.
 *
 * Using the real document would let one test's `data-theme` leak into the next
 * (Karma runs specs in random order), and there is no way to make the real
 * `prefers-color-scheme` report dark on demand.
 */
function fakeDocument(systemPrefersDark: boolean): FakeDocument {
  const listeners: ((event: { matches: boolean }) => void)[] = [];

  const query = {
    matches: systemPrefersDark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
      listeners.push(listener),
    removeEventListener: () => undefined,
  };

  return {
    documentElement: document.createElement('html'),
    defaultView: { matchMedia: jasmine.createSpy('matchMedia').and.returnValue(query) },
    emitSystemChange: matches => listeners.forEach(listener => listener({ matches })),
  };
}

describe('ThemeService', () => {
  let doc: FakeDocument;

  /**
   * Build the service.
   *
   * Not in `beforeEach`: the constructor reads localStorage, so a test that
   * exercises a stored preference has to seed it first.
   */
  function createService(systemPrefersDark = false): ThemeService {
    doc = fakeDocument(systemPrefersDark);

    TestBed.configureTestingModule({
      providers: [{ provide: DOCUMENT, useValue: doc as unknown as Document }],
    });

    const service = TestBed.inject(ThemeService);
    TestBed.tick(); // flush the effect that writes the root element
    return service;
  }

  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  it('defaults to following the system', () => {
    const service = createService(false);

    expect(service.current()).toBe('system');
    expect(service.resolved()).toBe('light');
    expect(doc.documentElement.hasAttribute('data-theme')).toBeFalse();
    expect(doc.defaultView.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
  });

  it('resolves "system" to dark when the OS reports dark', () => {
    const service = createService(true);

    expect(service.current()).toBe('system');
    expect(service.resolved()).toBe('dark');
    expect(doc.documentElement.hasAttribute('data-theme')).toBeFalse();
    expect(doc.documentElement.style.colorScheme).toBe('dark');
  });

  it('follows the OS when it changes while still on "system"', () => {
    const service = createService(false);

    doc.emitSystemChange(true);
    TestBed.tick();

    expect(service.resolved()).toBe('dark');
    expect(doc.documentElement.style.colorScheme).toBe('dark');
  });

  it('writes data-theme and persists an explicit dark choice', () => {
    const service = createService(false);

    service.set('dark');
    TestBed.tick();

    expect(service.current()).toBe('dark');
    expect(service.resolved()).toBe('dark');
    expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(doc.documentElement.style.colorScheme).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('removes both the attribute and the stored value when returning to "system"', () => {
    const service = createService(false);

    service.set('dark');
    TestBed.tick();
    service.set('system');
    TestBed.tick();

    expect(doc.documentElement.hasAttribute('data-theme')).toBeFalse();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(doc.documentElement.style.colorScheme).toBe('light');
  });

  it('an explicit light choice wins over a dark OS setting', () => {
    const service = createService(true);

    service.set('light');
    TestBed.tick();

    expect(service.resolved()).toBe('light');
    expect(doc.documentElement.getAttribute('data-theme')).toBe('light');
    expect(doc.documentElement.style.colorScheme).toBe('light');
  });

  describe('toggle', () => {
    it('flips a resolved light appearance to dark', () => {
      const service = createService(false);

      service.toggle();
      TestBed.tick();

      expect(service.current()).toBe('dark');
      expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('flips a resolved dark appearance to light, even when it came from "system"', () => {
      const service = createService(true);
      expect(service.current()).toBe('system');

      service.toggle();
      TestBed.tick();

      expect(service.current()).toBe('light');
      expect(service.resolved()).toBe('light');
    });

    it('flips back and forth', () => {
      const service = createService(false);

      service.toggle();
      service.toggle();
      TestBed.tick();

      expect(service.current()).toBe('light');
    });
  });

  describe('stored preference', () => {
    it('is read back on construction', () => {
      localStorage.setItem(STORAGE_KEY, 'dark');

      const service = createService(false);

      expect(service.current()).toBe('dark');
      expect(service.resolved()).toBe('dark');
      expect(doc.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('falls back to "system" when the stored value is not a theme', () => {
      localStorage.setItem(STORAGE_KEY, 'neon');

      const service = createService(false);

      expect(service.current()).toBe('system');
    });
  });
});
