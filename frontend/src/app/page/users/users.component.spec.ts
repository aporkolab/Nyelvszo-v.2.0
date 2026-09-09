import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { environment } from 'src/environments/environment';
import { UsersComponent } from './users.component';

const PAGE = {
  data: [
    {
      _id: '1',
      firstName: 'Ádám',
      lastName: 'Porkoláb',
      email: 'adam@example.org',
      role: 3,
      isActive: true,
    },
  ],
  pagination: {
    currentPage: 1,
    totalPages: 1,
    totalItems: 1,
    itemsPerPage: 25,
    hasNextPage: false,
    hasPrevPage: false,
  },
};

describe('UsersComponent', () => {
  let component: UsersComponent;
  let fixture: ComponentFixture<UsersComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        UsersComponent,
        TranslateModule.forRoot(),
        NoopAnimationsModule,
      ],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(UsersComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('requests the first page on creation', () => {
    const request = http.expectOne(
      candidate => candidate.url === `${environment.apiUrl}/users` && candidate.method === 'GET'
    );

    expect(request.request.params.get('page')).toBe('1');

    request.flush(PAGE);

    expect(component.status()).toBe('ready');
    expect(component.users().length).toBe(1);
    expect(component.users()[0].fullName).toBe('Ádám Porkoláb');
  });

  it('shows the error state when the list cannot be loaded', () => {
    http
      .expectOne(candidate => candidate.url === `${environment.apiUrl}/users`)
      .flush(
        { error: 'Server unavailable', statusCode: 500 },
        { status: 500, statusText: 'Error' }
      );

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('Server unavailable');
  });

  it('keeps a refused deletion on screen with the message the API gave', () => {
    http.expectOne(candidate => candidate.url === `${environment.apiUrl}/users`).flush(PAGE);

    spyOn(window, 'confirm').and.returnValue(true);
    component.onDelete(component.users()[0]);

    http
      .expectOne(`${environment.apiUrl}/users/1`)
      .flush(
        { error: 'You cannot delete the last administrator.', statusCode: 409 },
        { status: 409, statusText: 'Conflict' }
      );

    expect(component.conflictMessage()).toBe('You cannot delete the last administrator.');
    expect(component.deletingId()).toBeNull();
  });
});
