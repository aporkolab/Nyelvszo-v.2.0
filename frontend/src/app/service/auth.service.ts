import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, of, switchMap, tap, throwError } from 'rxjs';

import { environment } from 'src/environments/environment';
import { User, UserRole } from '../model/user';

export interface ILoginData {
  email: string;
  password: string;
}

export interface IAuthResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: User;
  expiresIn: string;
}

interface IRefreshResponse {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface IStoredSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const STORAGE_KEY = 'nyelvszo_auth';

/**
 * Decode the payload of a JWT without verifying it.
 *
 * The client cannot verify a signature and must not pretend to: this is used
 * only to read the expiry so an obviously dead token is discarded before it is
 * sent. The server remains the sole authority on validity.
 *
 * @param token - Encoded JWT.
 * @returns The payload, or null if the token is malformed.
 */
function decodePayload(token: string): { exp?: number } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const normalised = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalised.padEnd(normalised.length + ((4 - (normalised.length % 4)) % 4), '=');

    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * Whether a token is expired, or expires within a small grace window.
 *
 * @param token - Encoded JWT.
 * @param graceSeconds - Treat a token expiring within this many seconds as expired.
 * @returns True when the token should not be used.
 */
function isExpired(token: string, graceSeconds = 10): boolean {
  const payload = decodePayload(token);
  if (!payload?.exp) return true;
  return payload.exp * 1000 <= Date.now() + graceSeconds * 1000;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly apiUrl = environment.apiUrl;

  private readonly session = signal<IStoredSession | null>(null);

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.restoreSession();
  }

  /** The current access token, or an empty string when signed out. */
  get accessToken(): string {
    return this.session()?.accessToken ?? '';
  }

  /** The current refresh token, or an empty string when signed out. */
  get refreshToken(): string {
    return this.session()?.refreshToken ?? '';
  }

  /**
   * Whether the signed-in user holds at least the given role.
   *
   * @param role - Minimum role required.
   * @returns True when the user meets or exceeds it.
   */
  hasRole(role: UserRole): boolean {
    const user = this.user();
    return user ? user.role >= role : false;
  }

  get isEditor(): boolean {
    return this.hasRole(UserRole.Editor);
  }

  get isAdmin(): boolean {
    return this.hasRole(UserRole.Admin);
  }

  /**
   * Exchange credentials for a token pair.
   *
   * @param credentials - Email and password.
   * @returns The authentication response.
   */
  login(credentials: ILoginData): Observable<IAuthResponse> {
    this.isLoading.set(true);
    this.error.set(null);

    return this.http.post<IAuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap(response => {
        this.persist({
          accessToken: response.accessToken,
          refreshToken: response.refreshToken,
          user: new User(response.user),
        });
        this.isLoading.set(false);
        void this.router.navigate(['/']);
      }),
      catchError((error: unknown) => {
        this.isLoading.set(false);
        this.error.set(this.messageFor(error));
        return throwError(() => error);
      })
    );
  }

  /**
   * Obtain a fresh token pair using the stored refresh token.
   *
   * Returns null (rather than erroring) when there is nothing usable to refresh
   * with, so the interceptor can fall through to signing the user out.
   *
   * @returns The new access token, or null.
   */
  refresh(): Observable<string | null> {
    const token = this.refreshToken;

    if (!token || isExpired(token)) {
      return of(null);
    }

    return this.http
      .post<IRefreshResponse>(`${this.apiUrl}/login/refresh`, { refreshToken: token })
      .pipe(
        switchMap(response => {
          const current = this.session();
          if (!current) return of(null);

          this.persist({
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            user: current.user,
          });

          return of(response.accessToken);
        }),
        catchError(() => of(null))
      );
  }

  /**
   * Clear the session and return to the sign-in screen.
   *
   * @param returnUrl - Path to come back to after signing in again.
   */
  logout(returnUrl?: string): void {
    this.clear();
    void this.router.navigate(['/login'], returnUrl ? { queryParams: { returnUrl } } : {});
  }

  /** Drop the session without navigating. */
  clear(): void {
    this.session.set(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage unavailable; the in-memory signal is already cleared.
    }
  }

  private persist(session: IStoredSession): void {
    this.session.set(session);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Private browsing denies storage; the session lives for this tab only.
    }
  }

  /**
   * Rehydrate a session from storage on boot.
   *
   * An expired access token is only usable if the refresh token is still alive;
   * otherwise the stored session is discarded. Previously any stored token was
   * treated as a valid session, so a returning user appeared signed in and then
   * saw every request fail.
   */
  private restoreSession(): void {
    let stored: string | null;

    try {
      stored = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }

    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as IStoredSession;

      if (!parsed?.accessToken || !parsed.refreshToken || !parsed.user) {
        this.clear();
        return;
      }

      if (isExpired(parsed.accessToken) && isExpired(parsed.refreshToken)) {
        this.clear();
        return;
      }

      this.session.set({ ...parsed, user: new User(parsed.user) });
    } catch {
      this.clear();
    }
  }

  private messageFor(error: unknown): string {
    const body = (error as { error?: { error?: string } })?.error;
    return body?.error ?? 'Sign-in failed. Please check your credentials and try again.';
  }
}
