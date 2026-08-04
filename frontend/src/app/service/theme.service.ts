import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal, computed, effect } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'nyelvszo_theme';

/**
 * Owns the light/dark appearance of the application.
 *
 * Three states rather than two: "system" is the default and follows the
 * operating system, while an explicit choice is written to the root element as
 * `data-theme` and wins over the media query in both directions.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly preference = signal<ThemePreference>(this.readStoredPreference());

  /** Whether the OS currently reports a dark colour scheme. */
  private readonly systemPrefersDark = signal(false);

  /** The appearance actually in effect, after resolving "system". */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const preference = this.preference();
    if (preference === 'system') {
      return this.systemPrefersDark() ? 'dark' : 'light';
    }
    return preference;
  });

  /** The user's stored choice, including "system". */
  readonly current = this.preference.asReadonly();

  constructor() {
    const query = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');

    if (query) {
      this.systemPrefersDark.set(query.matches);
      query.addEventListener('change', event => this.systemPrefersDark.set(event.matches));
    }

    effect(() => this.apply(this.preference(), this.resolved()));
  }

  /**
   * Store and apply a new preference.
   *
   * @param preference - Light, dark, or follow the system.
   */
  set(preference: ThemePreference): void {
    this.preference.set(preference);

    try {
      if (preference === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, preference);
      }
    } catch {
      // Private browsing denies storage; the in-memory signal still works for
      // the current session.
    }
  }

  /** Flip between light and dark, resolving "system" to its current value first. */
  toggle(): void {
    this.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  private readStoredPreference(): ThemePreference {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private apply(preference: ThemePreference, resolved: 'light' | 'dark'): void {
    const root = this.document.documentElement;

    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }

    // Tells the browser to theme form controls, scrollbars and the address bar
    // to match, which CSS custom properties alone cannot do.
    root.style.colorScheme = resolved;
  }
}
