import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { LoginComponent } from './login.component';

/** Minimal stand-in for the query parameters the guard and interceptor add. */
function activatedRouteWith(params: Record<string, string>) {
  const map = new Map(Object.entries(params));
  return {
    queryParamMap: of({
      get: (key: string) => map.get(key) ?? null,
      has: (key: string) => map.has(key),
      getAll: (key: string) => (map.has(key) ? [map.get(key) as string] : []),
      keys: [...map.keys()],
    }),
  };
}

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;

  async function setup(params: Record<string, string> = {}): Promise<void> {
    TestBed.resetTestingModule();

    await TestBed.configureTestingModule({
      imports: [LoginComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: activatedRouteWith(params) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('creates', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('starts invalid and touches both controls instead of submitting an empty form', async () => {
    await setup();
    expect(component.form.invalid).toBeTrue();

    component.onSubmit();

    expect(component.form.controls.email.touched).toBeTrue();
    expect(component.form.controls.password.touched).toBeTrue();
  });

  it('reports a malformed email once the control is touched', async () => {
    await setup();

    component.form.controls.email.setValue('not-an-address');
    component.form.controls.email.markAsTouched();

    expect(component.emailError()).toBe('login.emailInvalid');
  });

  it('shows the session-expired notice only when the interceptor asks for it', async () => {
    await setup();
    expect(component.sessionExpired()).toBeFalse();

    await setup({ reason: 'session-expired' });
    expect(component.sessionExpired()).toBeTrue();
  });
});
