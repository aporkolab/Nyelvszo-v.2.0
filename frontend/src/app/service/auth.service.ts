import { User } from './../model/user';
import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface IAuthModel {
  success: boolean;
  accessToken: string;
  user: User;
}

export interface ILoginData {
  email: string;
  password: string;
}

const STORAGE_KEY = 'nyelvszo_auth';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl: string = environment.apiUrl;
  private readonly loginUrl: string;

  readonly user$ = new BehaviorSubject<User | null>(null);
  private readonly accessToken$ = new BehaviorSubject<string>('');
  readonly isLoading$ = new BehaviorSubject<boolean>(false);
  readonly error$ = new BehaviorSubject<string | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router
  ) {
    this.loginUrl = `${this.apiUrl}/login`;
    this.restoreSession();
  }

  get token(): string {
    return this.accessToken$.value;
  }

  get isAuthenticated(): boolean {
    return !!this.user$.value && !!this.accessToken$.value;
  }

  get currentUser(): User | null {
    return this.user$.value;
  }

  login(loginData: ILoginData): Observable<IAuthModel> {
    this.isLoading$.next(true);
    this.error$.next(null);

    return this.http.post<IAuthModel>(this.loginUrl, loginData).pipe(
      tap((response: IAuthModel) => {
        this.handleLoginSuccess(response);
        this.isLoading$.next(false);
      }),
      catchError(error => {
        this.isLoading$.next(false);
        const message = error.error?.message || 'Login failed. Please try again.';
        this.error$.next(message);
        throw error;
      })
    );
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  hasRole(role: number): boolean {
    const user = this.user$.value;
    return user ? user.role >= role : false;
  }

  get isEditor(): boolean {
    return this.hasRole(2);
  }

  get isAdmin(): boolean {
    return this.hasRole(3);
  }

  private handleLoginSuccess(response: IAuthModel): void {
    const user = new User(response.user);
    this.user$.next(user);
    this.accessToken$.next(response.accessToken);
    this.saveSession(response);
    this.router.navigate(['/']);
  }

  private saveSession(authData: IAuthModel): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
    } catch {
      // Storage might be unavailable in private browsing mode
    }
  }

  private restoreSession(): void {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const authData: IAuthModel = JSON.parse(stored);
        if (authData.accessToken && authData.user) {
          this.accessToken$.next(authData.accessToken);
          this.user$.next(new User(authData.user));
        }
      }
    } catch {
      this.clearSession();
    }
  }

  private clearSession(): void {
    this.user$.next(null);
    this.accessToken$.next('');
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage might be unavailable
    }
  }
}
