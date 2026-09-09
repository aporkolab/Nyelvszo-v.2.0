import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { UserRole } from '../../model/user';
import { UsersEditorComponent } from './users-editor.component';

function configure(id: string) {
  TestBed.configureTestingModule({
    imports: [UsersEditorComponent, TranslateModule.forRoot(),],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      provideNoopAnimations(),
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id })) } },
    ],
  });
}

/** The component's form, which is protected for the template's benefit. */
function formOf(component: UsersEditorComponent): FormGroup {
  return (component as unknown as { form: FormGroup }).form;
}

describe('UsersEditorComponent', () => {
  let fixture: ComponentFixture<UsersEditorComponent>;
  let component: UsersEditorComponent;

  afterEach(() => TestBed.resetTestingModule());

  describe('creating', () => {
    beforeEach(async () => {
      configure('0');
      await TestBed.compileComponents();
      fixture = TestBed.createComponent(UsersEditorComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('requires a password', () => {
      const password = formOf(component).controls['password'];
      expect(password.hasError('required')).toBeTrue();
    });

    it('rejects a password that does not meet the server rule', () => {
      const password = formOf(component).controls['password'];

      password.setValue('password1234');
      expect(password.hasError('weakPassword')).toBeTrue();

      password.setValue('Password1234!');
      expect(password.valid).toBeTrue();
    });
  });

  describe('editing', () => {
    beforeEach(async () => {
      configure('u-1');
      await TestBed.compileComponents();
      fixture = TestBed.createComponent(UsersEditorComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();

      const http = TestBed.inject(HttpTestingController);
      const request = http.expectOne(req => req.url.endsWith('/users/u-1'));
      request.flush({
        data: {
          _id: 'u-1',
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          role: UserRole.Editor,
          isActive: true,
        },
      });
      fixture.detectChanges();
    });

    it('is valid with an empty password, which means "leave it unchanged"', () => {
      const form = formOf(component);

      expect(form.controls['password'].value).toBe('');
      expect(form.valid).toBeTrue();
    });

    it('still enforces the strength rule once a password is typed', () => {
      const password = formOf(component).controls['password'];

      password.setValue('short');
      expect(password.hasError('weakPassword')).toBeTrue();
    });
  });
});
