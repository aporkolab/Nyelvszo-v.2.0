import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { environment } from 'src/environments/environment';
import { User, UserRole } from '../model/user';
import { AuthService, IAuthResponse } from './auth.service';

const STORAGE_KEY = 'nyelvszo_auth';

/** base64url, the encoding a JWT segment actually uses. */
function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A structurally real JWT whose payload carries an `exp`.
 *
 * The signature is nonsense on purpose: the client never verifies it, it only
 * reads the expiry, and a test that used an opaque string would not exercise
 * the decoder at all.
 *
 * @param secondsFromNow - Positive for a live token, negative for a dead one.
 */
function jwt(secondsFromNow: number): string {
  return [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
    'not-a-real-signature',
  ].join('.');
}

const LIVE = () => jwt(3600);
const DEAD = () => jwt(-3600);

const USER_JSON = {
  _id: 'u1',
  firstName: 'Ádám',
  lastName: 'Porkoláb',
  email: 'adam@example.org',
  role: UserRole.Admin,
  isActive: true,
};

function authResponse(overrides: Partial<IAuthResponse> = {}): IAuthResponse {
  return {
    success: true,
    accessToken: LIVE(),
    refreshToken: LIVE(),
    user: USER_JSON as unknown as User,
    expiresIn: '15m',
    ...overrides,
  };
}

describe('AuthService', () => {
  let router: jasmine.SpyObj<Router>;

  /**
   * Build the service.
   *
   * Deliberately not done in `beforeEach`: the constructor reads storage, so
   * each test has to seed sessionStorage *before* the service exists.
   */
  function createService(): { service: AuthService; http: HttpTestingController } {
    const service = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    return { service, http };
  }

  beforeEach(() => {
    sessionStorage.clear();
    router = jasmine.createSpyObj<Router>('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('login', () => {
    it('stores the session and exposes the signed-in user', () => {
      const { service, http } = createService();
      const response = authResponse();

      expect(service.isAuthenticated()).toBeFalse();

      service.login({ email: 'adam@example.org', password: 'correct horse' }).subscribe();

      const request = http.expectOne(`${environment.apiUrl}/login`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        email: 'adam@example.org',
        password: 'correct horse',
      });

      request.flush(response);

      expect(service.isAuthenticated()).toBeTrue();
      expect(service.user()).toBeInstanceOf(User);
      expect(service.user()?.email).toBe('adam@example.org');
      expect(service.accessToken).toBe(response.accessToken);
      expect(service.refreshToken).toBe(response.refreshToken);
      expect(service.isLoading()).toBeFalse();
      // Current behaviour: the service itself navigates to the landing page.
      // LoginComponent then navigates again to the guard's `returnUrl`, so a
      // guard-redirected sign-in performs two navigations and briefly shows
      // the wrong page. Documented here, not fixed.
      expect(router.navigate).toHaveBeenCalledWith(['/']);

      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) as string);
      expect(stored.accessToken).toBe(response.accessToken);
      expect(stored.refreshToken).toBe(response.refreshToken);

      http.verify();
    });

    it('surfaces the API message and rethrows on failure', () => {
      const { service, http } = createService();
      let caught: unknown = null;

      service
        .login({ email: 'adam@example.org', password: 'wrong' })
        .subscribe({ next: () => fail('expected an error'), error: error => (caught = error) });

      http
        .expectOne(`${environment.apiUrl}/login`)
        .flush({ error: 'Invalid credentials', statusCode: 401 }, { status: 401, statusText: 'x' });

      expect(caught).toBeTruthy();
      expect(service.error()).toBe('Invalid credentials');
      expect(service.isLoading()).toBeFalse();
      expect(service.isAuthenticated()).toBeFalse();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(router.navigate).not.toHaveBeenCalled();

      http.verify();
    });

    it('falls back to a generic message when the API sends no body', () => {
      const { service, http } = createService();

      service.login({ email: 'a@b.hu', password: 'x' }).subscribe({ error: () => undefined });
      http
        .expectOne(`${environment.apiUrl}/login`)
        .flush(null, { status: 500, statusText: 'Server Error' });

      expect(service.error()).toBe('Sign-in failed. Please check your credentials and try again.');

      http.verify();
    });
  });

  describe('roles', () => {
    function signInAs(role: UserRole): AuthService {
      const { service, http } = createService();
      service.login({ email: 'a@b.hu', password: 'x' }).subscribe();
      http
        .expectOne(`${environment.apiUrl}/login`)
        .flush(authResponse({ user: { ...USER_JSON, role } as unknown as User }));
      http.verify();
      return service;
    }

    it('grants a viewer nothing above their own level', () => {
      const service = signInAs(UserRole.User);

      expect(service.hasRole(UserRole.User)).toBeTrue();
      expect(service.hasRole(UserRole.Editor)).toBeFalse();
      expect(service.hasRole(UserRole.Admin)).toBeFalse();
      expect(service.isEditor).toBeFalse();
      expect(service.isAdmin).toBeFalse();
    });

    it('grants an editor everything up to editor', () => {
      const service = signInAs(UserRole.Editor);

      expect(service.hasRole(UserRole.User)).toBeTrue();
      expect(service.hasRole(UserRole.Editor)).toBeTrue();
      expect(service.hasRole(UserRole.Admin)).toBeFalse();
      expect(service.isEditor).toBeTrue();
      expect(service.isAdmin).toBeFalse();
    });

    it('grants an administrator every level', () => {
      const service = signInAs(UserRole.Admin);

      expect(service.hasRole(UserRole.User)).toBeTrue();
      expect(service.hasRole(UserRole.Editor)).toBeTrue();
      expect(service.hasRole(UserRole.Admin)).toBeTrue();
      expect(service.isEditor).toBeTrue();
      expect(service.isAdmin).toBeTrue();
    });

    it('denies every role when signed out', () => {
      const { service } = createService();

      expect(service.hasRole(UserRole.User)).toBeFalse();
      expect(service.isEditor).toBeFalse();
      expect(service.isAdmin).toBeFalse();
      expect(service.accessToken).toBe('');
      expect(service.refreshToken).toBe('');
    });
  });

  describe('logout', () => {
    it('clears storage and returns to the sign-in screen', () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: LIVE(), refreshToken: LIVE(), user: USER_JSON })
      );

      const { service } = createService();
      expect(service.isAuthenticated()).toBeTrue();

      service.logout();

      expect(service.isAuthenticated()).toBeFalse();
      expect(service.user()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {});
    });

    it('carries a return URL when one is given', () => {
      const { service } = createService();

      service.logout('/users');

      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/users' },
      });
    });
  });

  describe('restoreSession', () => {
    it('rehydrates a live session on construction', () => {
      const accessToken = LIVE();
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken, refreshToken: LIVE(), user: USER_JSON })
      );

      const { service } = createService();

      expect(service.isAuthenticated()).toBeTrue();
      expect(service.accessToken).toBe(accessToken);
      // Rehydrated as a model instance, not a bare object, so `fullName` works.
      expect(service.user()).toBeInstanceOf(User);
      expect(service.user()?.fullName).toBe('Ádám Porkoláb');
    });

    it('discards a session whose access AND refresh tokens have both expired', () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: DEAD(), refreshToken: DEAD(), user: USER_JSON })
      );

      const { service } = createService();

      expect(service.isAuthenticated()).toBeFalse();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('keeps a session whose access token is dead but whose refresh token is alive', () => {
      const refreshToken = LIVE();
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: DEAD(), refreshToken, user: USER_JSON })
      );

      const { service } = createService();

      expect(service.isAuthenticated()).toBeTrue();
      expect(service.refreshToken).toBe(refreshToken);
    });

    it('discards malformed JSON without throwing', () => {
      sessionStorage.setItem(STORAGE_KEY, '{not json at all');

      expect(() => createService()).not.toThrow();
      expect(TestBed.inject(AuthService).isAuthenticated()).toBeFalse();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('discards a session that is missing a token or the user', () => {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken: LIVE() }));

      const { service } = createService();

      expect(service.isAuthenticated()).toBeFalse();
      expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('discards a token whose payload is not decodable', () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: 'garbage', refreshToken: 'garbage', user: USER_JSON })
      );

      const { service } = createService();

      expect(service.isAuthenticated()).toBeFalse();
    });
  });

  describe('refresh', () => {
    it('returns null without calling the API when there is no refresh token', () => {
      const { service, http } = createService();
      let result: string | null | undefined;

      service.refresh().subscribe(value => (result = value));

      expect(result).toBeNull();
      http.verify();
    });

    it('returns null without calling the API when the refresh token has expired', () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: LIVE(), refreshToken: DEAD(), user: USER_JSON })
      );

      const { service, http } = createService();
      let result: string | null | undefined;

      service.refresh().subscribe(value => (result = value));

      expect(result).toBeNull();
      http.verify();
    });

    it('returns the new access token and persists the rotated pair', () => {
      const originalRefresh = LIVE();
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: DEAD(), refreshToken: originalRefresh, user: USER_JSON })
      );

      const { service, http } = createService();
      const rotatedAccess = LIVE();
      const rotatedRefresh = LIVE();
      let result: string | null | undefined;

      service.refresh().subscribe(value => (result = value));

      const request = http.expectOne(`${environment.apiUrl}/login/refresh`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ refreshToken: originalRefresh });

      request.flush({
        success: true,
        accessToken: rotatedAccess,
        refreshToken: rotatedRefresh,
        expiresIn: '15m',
      });

      expect(result).toBe(rotatedAccess);
      expect(service.accessToken).toBe(rotatedAccess);
      expect(service.refreshToken).toBe(rotatedRefresh);
      // The user is preserved across the rotation; the endpoint does not resend it.
      expect(service.user()?.email).toBe('adam@example.org');

      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) as string);
      expect(stored.accessToken).toBe(rotatedAccess);
      expect(stored.refreshToken).toBe(rotatedRefresh);

      http.verify();
    });

    it('returns null when the refresh endpoint rejects the token', () => {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken: DEAD(), refreshToken: LIVE(), user: USER_JSON })
      );

      const { service, http } = createService();
      let result: string | null | undefined;
      let errored = false;

      service.refresh().subscribe({
        next: value => (result = value),
        error: () => (errored = true),
      });

      http
        .expectOne(`${environment.apiUrl}/login/refresh`)
        .flush({ error: 'Invalid refresh token' }, { status: 401, statusText: 'Unauthorized' });

      expect(result).toBeNull();
      expect(errored).toBeFalse();
      http.verify();
    });
  });
});
