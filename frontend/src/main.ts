import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { importProvidersFrom } from '@angular/core';

import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { authInterceptor } from './app/service/auth.interceptor';

/**
 * Load translation files from the assets directory.
 *
 * @returns Configured loader.
 */
export function translateLoaderFactory(): TranslateLoader {
  return new TranslateHttpLoader();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(
      routes,
      withComponentInputBinding(),
      // Restore the previous scroll position on back/forward, and jump to the
      // top on a new navigation, instead of landing mid-page.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })
    ),
    provideAnimations(),
    provideHttpClient(withInterceptors([authInterceptor])),
    importProvidersFrom(
      TranslateModule.forRoot({
        defaultLanguage: 'hu',
        loader: {
          provide: TranslateLoader,
          useFactory: translateLoaderFactory,
        },
      })
    ),
  ],
}).catch((error: unknown) => {
  // Last-resort surface: without this the page is simply blank when bootstrap
  // fails, with the reason visible only in the console.
  const message = error instanceof Error ? error.message : String(error);
  const banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText =
    'margin:2rem;padding:1rem 1.25rem;border:1px solid #a4232b;border-radius:.5rem;' +
    'background:#fbe6e7;color:#8f1e26;font:1rem/1.5 system-ui,sans-serif';
  banner.textContent = `The application failed to start: ${message}`;
  document.body.appendChild(banner);
});
