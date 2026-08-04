import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { SiteHeaderComponent } from './common/site-header/site-header.component';

const SUPPORTED_LANGUAGES = ['hu', 'en'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANGUAGE_STORAGE_KEY = 'nyelvszo_lang';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TranslateModule, SiteHeaderComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

  readonly currentYear = new Date().getFullYear();

  constructor() {
    this.translate.addLangs([...SUPPORTED_LANGUAGES]);
    this.translate.setDefaultLang('hu');
    this.translate.use(this.initialLanguage());

    // Keep the document language attribute in sync with the UI language. It was
    // hardcoded to "en" in index.html while the default interface is Hungarian,
    // which makes a screen reader pronounce every Hungarian string with English
    // phonetics.
    this.applyDocumentLanguage(this.translate.currentLang ?? 'hu');
    this.translate.onLangChange.subscribe(({ lang }) => this.applyDocumentLanguage(lang));
  }

  private applyDocumentLanguage(lang: string): void {
    this.document.documentElement.setAttribute('lang', lang);

    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // Storage unavailable in private browsing; the choice lives for this session.
    }
  }

  private initialLanguage(): SupportedLanguage {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
        return stored as SupportedLanguage;
      }
    } catch {
      // Fall through to the browser preference.
    }

    const browserLang = this.translate.getBrowserLang();
    return browserLang && SUPPORTED_LANGUAGES.includes(browserLang as SupportedLanguage)
      ? (browserLang as SupportedLanguage)
      : 'hu';
  }
}
