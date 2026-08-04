import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';

/**
 * Whether a request is destined for this application's own API.
 *
 * The bearer token must never be attached to anything else. The previous
 * interceptor added the Authorization header to every outgoing request,
 * including the i18n asset fetches and any third-party URL the app might call,
 * which leaks the credential to whoever is on the other end.
 *
 * @param request - Outgoing request.
 * @returns True when the token may be attached.
 */
function targetsOwnApi(request: HttpRequest<unknown>): boolean {
  const apiUrl = environment.apiUrl;

  // Relative URLs are same-origin by definition.
  if (apiUrl.startsWith('/')) {
    return request.url.startsWith(apiUrl);
  }

  try {
    const target = new URL(request.url, document.baseURI);
    const api = new URL(apiUrl);
    return target.origin === api.origin && target.pathname.startsWith(api.pathname);
  } catch {
    return false;
  }
}

/** Endpoints that must not trigger a token refresh when they return 401. */
function isAuthEndpoint(url: string): boolean {
  return url.includes('/login');
}

/**
 * Attach the access token to API requests, and recover from expiry.
 *
 * On a 401 the interceptor tries exactly one refresh and replays the original
 * request. If the refresh fails, the session is cleared and the user is sent to
 * the sign-in screen with a return URL — previously an expired token produced a
 * silent stream of failed requests with no feedback at all.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const authorised =
    targetsOwnApi(request) && auth.accessToken
      ? request.clone({ setHeaders: { Authorization: `Bearer ${auth.accessToken}` } })
      : request;

  return next(authorised).pipe(
    catchError((error: unknown) => {
      const isUnauthorised = error instanceof HttpErrorResponse && error.status === 401;

      if (!isUnauthorised || !targetsOwnApi(request) || isAuthEndpoint(request.url)) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        switchMap(token => {
          if (!token) {
            auth.clear();
            void router.navigate(['/login'], {
              queryParams: { returnUrl: router.url, reason: 'session-expired' },
            });
            return throwError(() => error);
          }

          return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
        })
      );
    })
  );
};
