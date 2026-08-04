import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';

import { environment } from 'src/environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

/**
 * Stand-in for AuthService.
 *
 * The interceptor only reads `accessToken` and calls `refresh()`/`clear()`, so
 * a fake keeps these tests about the interceptor rather than about token
 * decoding, which auth.service.spec.ts covers on its own.
 */
class FakeAuthService {
  accessToken = 'access-1';
  refresh = jasmine
    .createSpy<() => Observable<string | null>>('refresh')
    .and.returnValue(of('access-2'));
  clear = jasmine.createSpy('clear');
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: FakeAuthService;
  let router: { navigate: jasmine.Spy; url: string };

  const API = environment.apiUrl;

  beforeEach(() => {
    auth = new FakeAuthService();
    router = { navigate: jasmine.createSpy('navigate'), url: '/users' };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth as unknown as AuthService },
        { provide: Router, useValue: router as unknown as Router },
      ],
    });

    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  afterEach(() => controller.verify());

  describe('attaching the token', () => {
    it('attaches the bearer token to this application own API', () => {
      http.get(`${API}/entries`).subscribe();

      const request = controller.expectOne(`${API}/entries`);
      expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
      request.flush({ data: [] });
    });

    it('does NOT attach the token to a third-party origin', () => {
      http.get('https://example.com/track').subscribe();

      const request = controller.expectOne('https://example.com/track');
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({});
    });

    it('does NOT attach the token to a relative asset path', () => {
      http.get('./assets/i18n/hu.json').subscribe();

      const request = controller.expectOne('./assets/i18n/hu.json');
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({});
    });

    it('attaches nothing when there is no token', () => {
      auth.accessToken = '';

      http.get(`${API}/entries`).subscribe();

      const request = controller.expectOne(`${API}/entries`);
      expect(request.request.headers.has('Authorization')).toBeFalse();
      request.flush({ data: [] });
    });
  });

  describe('recovering from a 401', () => {
    it('refreshes exactly once and replays the request with the NEW token', () => {
      let body: unknown = null;
      http.get(`${API}/users`).subscribe(response => (body = response));

      const first = controller.expectOne(`${API}/users`);
      expect(first.request.headers.get('Authorization')).toBe('Bearer access-1');
      first.flush({ error: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

      const replay = controller.expectOne(`${API}/users`);
      expect(replay.request.headers.get('Authorization')).toBe('Bearer access-2');
      replay.flush({ data: ['ok'] });

      expect(auth.refresh).toHaveBeenCalledTimes(1);
      expect(body).toEqual({ data: ['ok'] });
      expect(auth.clear).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('does not refresh again when the replay itself is rejected', () => {
      let status = 0;
      http.get(`${API}/users`).subscribe({ error: error => (status = error.status) });

      controller.expectOne(`${API}/users`).flush({}, { status: 401, statusText: 'Unauthorized' });

      controller.expectOne(`${API}/users`).flush({}, { status: 401, statusText: 'Unauthorized' });

      // A second refresh here would be the start of an infinite loop.
      expect(auth.refresh).toHaveBeenCalledTimes(1);
      expect(status).toBe(401);
    });

    it('refreshes once PER REQUEST, so two simultaneous 401s refresh twice', () => {
      // Documents current behaviour rather than endorsing it: there is no
      // shared in-flight refresh, so a page that fires several API calls at
      // once and finds the token expired will call /login/refresh once for
      // each. It is harmless today only because the backend's refresh tokens
      // are stateless and the old one stays valid until it expires; adding
      // server-side rotation/revocation would turn this into a spurious
      // sign-out.
      auth.refresh.and.returnValue(of('access-2'));

      http.get(`${API}/users`).subscribe();
      http.get(`${API}/entries`).subscribe();

      controller.expectOne(`${API}/users`).flush({}, { status: 401, statusText: 'x' });
      controller.expectOne(`${API}/entries`).flush({}, { status: 401, statusText: 'x' });

      expect(auth.refresh).toHaveBeenCalledTimes(2);

      controller.expectOne(`${API}/users`).flush({});
      controller.expectOne(`${API}/entries`).flush({});
    });

    it('clears the session and redirects when the refresh fails', () => {
      auth.refresh.and.returnValue(of(null));
      let status = 0;

      http.get(`${API}/users`).subscribe({ error: error => (status = error.status) });

      controller
        .expectOne(`${API}/users`)
        .flush({ error: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });

      expect(auth.clear).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: '/users', reason: 'session-expired' },
      });
      // The original error still reaches the caller, so the page can react.
      expect(status).toBe(401);
    });

    it('does NOT refresh on a 401 from the sign-in endpoint', () => {
      let status = 0;
      http
        .post(`${API}/login`, { email: 'a@b.hu', password: 'wrong' })
        .subscribe({ error: error => (status = error.status) });

      controller
        .expectOne(`${API}/login`)
        .flush({ error: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

      expect(auth.refresh).not.toHaveBeenCalled();
      expect(auth.clear).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(status).toBe(401);
    });

    it('does NOT refresh on a 401 from the refresh endpoint itself', () => {
      http.post(`${API}/login/refresh`, {}).subscribe({ error: () => undefined });

      controller
        .expectOne(`${API}/login/refresh`)
        .flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(auth.refresh).not.toHaveBeenCalled();
    });

    it('does NOT refresh on a 401 from a foreign origin', () => {
      http.get('https://example.com/track').subscribe({ error: () => undefined });

      controller
        .expectOne('https://example.com/track')
        .flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(auth.refresh).not.toHaveBeenCalled();
      expect(auth.clear).not.toHaveBeenCalled();
    });
  });

  describe('other failures', () => {
    it('passes a 403 through untouched', () => {
      let status = 0;
      http.get(`${API}/users`).subscribe({ error: error => (status = error.status) });

      controller.expectOne(`${API}/users`).flush({}, { status: 403, statusText: 'Forbidden' });

      expect(status).toBe(403);
      expect(auth.refresh).not.toHaveBeenCalled();
      expect(auth.clear).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('passes a 500 through untouched', () => {
      let status = 0;
      http.get(`${API}/entries`).subscribe({ error: error => (status = error.status) });

      controller.expectOne(`${API}/entries`).flush({}, { status: 500, statusText: 'Error' });

      expect(status).toBe(500);
      expect(auth.refresh).not.toHaveBeenCalled();
    });
  });
});
