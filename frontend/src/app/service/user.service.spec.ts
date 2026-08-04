import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from 'src/environments/environment';
import { User, UserRole } from '../model/user';
import { UserService } from './user.service';

const ENDPOINT = `${environment.apiUrl}/users`;

const PAGE = {
  data: [
    {
      _id: 'u1',
      firstName: 'Ádám',
      lastName: 'Porkoláb',
      email: 'adam@example.org',
      role: UserRole.Admin,
      isActive: true,
    },
  ],
  pagination: {
    currentPage: 3,
    totalPages: 5,
    totalItems: 42,
    itemsPerPage: 10,
    hasNextPage: true,
    hasPrevPage: true,
  },
};

describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** An account carrying server-owned fields the API must never be sent. */
  function dirtyUser(): User {
    return new User({
      _id: 'u1',
      firstName: '  Ádám ',
      lastName: ' Porkoláb ',
      email: '  Adam@Example.ORG ',
      role: UserRole.Editor,
      isActive: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
      lastLogin: '2026-03-01T00:00:00.000Z',
    });
  }

  describe('list', () => {
    it('forwards page and limit and maps the payload to User instances', () => {
      let result: { data: User[]; pagination: { totalItems: number } } | undefined;
      service.list(3, 10).subscribe(response => (result = response));

      const request = http.expectOne(candidate => candidate.url === ENDPOINT);
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('page')).toBe('3');
      expect(request.request.params.get('limit')).toBe('10');

      request.flush(PAGE);

      expect(result?.data[0]).toBeInstanceOf(User);
      expect(result?.data[0].fullName).toBe('Ádám Porkoláb');
      expect(result?.pagination.totalItems).toBe(42);
    });

    it('defaults to the first page of 25', () => {
      service.list().subscribe();

      const request = http.expectOne(candidate => candidate.url === ENDPOINT);
      expect(request.request.params.get('page')).toBe('1');
      expect(request.request.params.get('limit')).toBe('25');
      request.flush(PAGE);
    });
  });

  it('fetches a single account as a User instance', () => {
    let result: User | undefined;
    service.getOne('u1').subscribe(user => (result = user));

    const request = http.expectOne(`${ENDPOINT}/u1`);
    expect(request.request.method).toBe('GET');
    request.flush({ data: PAGE.data[0] });

    expect(result).toBeInstanceOf(User);
    expect(result?.isAdmin).toBeTrue();
  });

  describe('create', () => {
    it('includes the password alongside the writable fields', () => {
      service.create(dirtyUser(), 'initial-secret').subscribe();

      const request = http.expectOne(ENDPOINT);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({
        firstName: 'Ádám',
        lastName: 'Porkoláb',
        email: 'adam@example.org',
        role: UserRole.Editor,
        isActive: false,
        password: 'initial-secret',
      });
      request.flush({ data: PAGE.data[0] });
    });
  });

  describe('update', () => {
    it('OMITS the password key entirely when it is an empty string', () => {
      service.update(dirtyUser(), '').subscribe();

      const request = http.expectOne(`${ENDPOINT}/u1`);
      expect(request.request.method).toBe('PATCH');

      const body = request.request.body as Record<string, unknown>;
      // Not merely undefined — the key must be absent, or the API rejects it
      // and the administrator can never save an unrelated change.
      expect('password' in body).toBeFalse();
      request.flush({ data: PAGE.data[0] });
    });

    it('omits the password when the argument is left off altogether', () => {
      service.update(dirtyUser()).subscribe();

      const request = http.expectOne(`${ENDPOINT}/u1`);
      expect('password' in (request.request.body as Record<string, unknown>)).toBeFalse();
      request.flush({ data: PAGE.data[0] });
    });

    it('includes the password when one was actually typed', () => {
      service.update(dirtyUser(), 'new-secret').subscribe();

      const request = http.expectOne(`${ENDPOINT}/u1`);
      expect((request.request.body as { password?: string }).password).toBe('new-secret');
      request.flush({ data: PAGE.data[0] });
    });

    it('sends only the writable fields, normalised', () => {
      service.update(dirtyUser()).subscribe();

      const request = http.expectOne(`${ENDPOINT}/u1`);
      const body = request.request.body as Record<string, unknown>;

      expect(Object.keys(body).sort()).toEqual([
        'email',
        'firstName',
        'isActive',
        'lastName',
        'role',
      ]);
      expect('_id' in body).toBeFalse();
      expect('createdAt' in body).toBeFalse();
      expect('updatedAt' in body).toBeFalse();
      expect('lastLogin' in body).toBeFalse();
      expect(body['email']).toBe('adam@example.org');

      request.flush({ data: PAGE.data[0] });
    });
  });

  it('deletes with DELETE', () => {
    service.delete('u1').subscribe();

    const request = http.expectOne(`${ENDPOINT}/u1`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });
});
