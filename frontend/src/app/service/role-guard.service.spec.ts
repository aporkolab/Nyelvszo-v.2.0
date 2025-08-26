import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { RoleGuardService } from './role-guard.service';
import { AuthService } from './auth.service';
import { BehaviorSubject } from 'rxjs';

/** Minimal mock az AuthService-hez */
class AuthServiceMock {
  access_token$ = new BehaviorSubject<string | null>(null);
  user$ = new BehaviorSubject<{ role: number } | null>(null);

  // ha a guard hívja pl. isLoggedIn() / getRole(), adj hozzá stub metódusokat
  isLoggedIn(): boolean {
    return !!this.access_token$.value;
  }
}

describe('RoleGuardService', () => {
  let service: RoleGuardService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClientTesting(),
        RoleGuardService,
        { provide: AuthService, useClass: AuthServiceMock },
      ],
    });
    service = TestBed.inject(RoleGuardService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
