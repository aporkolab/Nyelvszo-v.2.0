import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class RoleGuardService implements CanActivate {
  constructor(public auth: AuthService, public router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const exptectedRole = route.data['expectedRole'];
    const userRole = this.auth.user$.value?.role || 1;

    if (userRole < exptectedRole) {
      this.router.navigate(['forbidden']);
      return false;
    }
    return true;
  }
}