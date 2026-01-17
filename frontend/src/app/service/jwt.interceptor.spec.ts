import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpTestingController, HttpClientTestingModule } from '@angular/common/http/testing';

import { JwtInterceptor } from './jwt.interceptor';
import { AuthService } from './auth.service';

class AuthServiceMock {
  private _token: string | null = 'TEST_TOKEN';

  get token(): string | null {
    return this._token;
  }

  setToken(value: string | null): void {
    this._token = value;
  }
}

describe('JwtInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authMock: AuthServiceMock;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: HTTP_INTERCEPTORS, useClass: JwtInterceptor, multi: true },
        { provide: AuthService, useClass: AuthServiceMock },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    // A TestBed az AuthService helyére a mockot adja:
    authMock = TestBed.inject(AuthService) as unknown as AuthServiceMock;
  });

  afterEach(() => httpMock.verify());

  it('hozzáadja az Authorization headert, ha van token', () => {
    http.get('/api/ping').subscribe();
    const req = httpMock.expectOne('/api/ping');
    expect(req.request.headers.get('Authorization')).toBe('Bearer TEST_TOKEN');
    req.flush({ ok: true });
  });

  it('nem ad hozzá headert, ha nincs token', () => {
    authMock.setToken(null);
    http.get('/api/ping2').subscribe();
    const req = httpMock.expectOne('/api/ping2');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({ ok: true });
  });
});
