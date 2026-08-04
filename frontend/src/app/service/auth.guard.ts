import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';
import { UserRole } from '../model/user';

/**
 * Require a signed-in user.
 *
 * Preserves the attempted URL so the sign-in screen can return the user to
 * where they were going.
 *
 * Client-side guards are a convenience, not a security boundary — every route
 * they protect is enforced again on the server.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Require at least the role declared in the route's `expectedRole` data.
 *
 * A route that forgets to declare its requirement fails closed rather than
 * admitting everyone.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  const expectedRole = route.data['expectedRole'] as UserRole | undefined;

  if (expectedRole === undefined) {
    return router.createUrlTree(['/forbidden']);
  }

  return auth.hasRole(expectedRole) ? true : router.createUrlTree(['/forbidden']);
};
