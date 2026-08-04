import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from 'src/environments/environment';
import { IUser, User } from '../model/user';
import { ItemResponse, ListResponse } from './api.types';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/users`;

  /**
   * List user accounts.
   *
   * @param page - 1-based page number.
   * @param limit - Page size.
   * @returns The page of accounts with its pagination metadata.
   */
  list(page = 1, limit = 25): Observable<ListResponse<User>> {
    const params = new HttpParams().set('page', page).set('limit', limit);

    return this.http
      .get<ListResponse<IUser>>(this.endpoint, { params })
      .pipe(map(response => ({ ...response, data: response.data.map(item => new User(item)) })));
  }

  /**
   * Fetch a single account.
   *
   * @param id - User identifier.
   * @returns The account.
   */
  getOne(id: string): Observable<User> {
    return this.http
      .get<ItemResponse<IUser>>(`${this.endpoint}/${id}`)
      .pipe(map(response => new User(response.data)));
  }

  /**
   * Create an account.
   *
   * @param user - Account details.
   * @param password - Initial password.
   * @returns The created account.
   */
  create(user: User, password: string): Observable<User> {
    return this.http
      .post<ItemResponse<IUser>>(this.endpoint, { ...this.writablePayload(user), password })
      .pipe(map(response => new User(response.data)));
  }

  /**
   * Update an account.
   *
   * The password is only sent when the administrator actually typed one. The
   * previous implementation posted the whole user object on every save, so the
   * empty password field either overwrote the credential or made the form
   * permanently invalid.
   *
   * @param user - Account carrying the identifier and the new values.
   * @param password - New password, or an empty string to leave it unchanged.
   * @returns The updated account.
   */
  update(user: User, password = ''): Observable<User> {
    const payload: Record<string, unknown> = this.writablePayload(user);

    if (password) {
      payload['password'] = password;
    }

    return this.http
      .patch<ItemResponse<IUser>>(`${this.endpoint}/${user._id}`, payload)
      .pipe(map(response => new User(response.data)));
  }

  /**
   * Delete an account.
   *
   * @param id - User identifier.
   */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.endpoint}/${id}`);
  }

  private writablePayload(user: User): Record<string, unknown> {
    return {
      firstName: user.firstName.trim(),
      lastName: user.lastName.trim(),
      email: user.email.trim().toLowerCase(),
      role: user.role,
      isActive: user.isActive,
    };
  }
}
