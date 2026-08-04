import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';

import { UserRole } from '../model/user';
import { authGuard, roleGuard } from './auth.guard';
import { AuthService } from './auth.service';

/** Signed-in state the guards read, with nothing else attached. */
class FakeAuthService {
  readonly isAuthenticated: WritableSignal<boolean> = signal(false);
  readonly role: WritableSignal<UserRole> = signal(UserRole.User);

  hasRole(role: UserRole): boolean {
    return this.isAuthenticated() && this.role() >= role;
  }
}

function snapshotWith(data: Record<string, unknown>): ActivatedRouteSnapshot {
  return { data } as unknown as ActivatedRouteSnapshot;
}

function stateFor(url: string): RouterStateSnapshot {
  return { url } as RouterStateSnapshot;
}

describe('route guards', () => {
  let auth: FakeAuthService;
  let router: Router;

  beforeEach(() => {
    auth = new FakeAuthService();

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth as unknown as AuthService },
      ],
    });

    router = TestBed.inject(Router);
  });

  function runAuthGuard(url: string) {
    return TestBed.runInInjectionContext(() => authGuard(snapshotWith({}), stateFor(url)));
  }

  function runRoleGuard(data: Record<string, unknown>, url = '/users') {
    return TestBed.runInInjectionContext(() => roleGuard(snapshotWith(data), stateFor(url)));
  }

  describe('authGuard', () => {
    it('admits a signed-in user', () => {
      auth.isAuthenticated.set(true);

      expect(runAuthGuard('/users')).toBeTrue();
    });

    it('redirects to the sign-in screen carrying the attempted URL', () => {
      const result = runAuthGuard('/entries/new');

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fentries%2Fnew');
    });
  });

  describe('roleGuard', () => {
    it('admits a user whose role exactly matches the requirement', () => {
      auth.isAuthenticated.set(true);
      auth.role.set(UserRole.Editor);

      expect(runRoleGuard({ expectedRole: UserRole.Editor })).toBeTrue();
    });

    it('admits a user whose role exceeds the requirement', () => {
      auth.isAuthenticated.set(true);
      auth.role.set(UserRole.Admin);

      expect(runRoleGuard({ expectedRole: UserRole.Editor })).toBeTrue();
    });

    it('sends a user below the requirement to /forbidden', () => {
      auth.isAuthenticated.set(true);
      auth.role.set(UserRole.User);

      const result = runRoleGuard({ expectedRole: UserRole.Admin });

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/forbidden');
    });

    it('sends an anonymous visitor to the sign-in screen, not to /forbidden', () => {
      const result = runRoleGuard({ expectedRole: UserRole.Admin }, '/users');

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fusers');
    });

    it('FAILS CLOSED to /forbidden when the route declares no expectedRole', () => {
      auth.isAuthenticated.set(true);
      auth.role.set(UserRole.Admin);

      const result = runRoleGuard({});

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/forbidden');
    });
  });
});
