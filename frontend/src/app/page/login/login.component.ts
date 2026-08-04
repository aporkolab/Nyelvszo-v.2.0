import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { IconModule } from 'src/app/icon/icon.module';
import { AuthService } from 'src/app/service/auth.service';
import { NotificationService } from 'src/app/service/notification.service';

/**
 * Sign-in screen.
 *
 * Only editors and administrators ever need it: the dictionary itself is public.
 * The screen has to handle three arrivals — a deliberate click on "sign in", a
 * guard redirect carrying `returnUrl`, and the interceptor's redirect carrying
 * `reason=session-expired` — and say something different in each case.
 */
@Component({
  standalone: true,
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslateModule, IconModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notifications = inject(NotificationService);
  private readonly translate = inject(TranslateService);

  readonly auth = inject(AuthService);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  /**
   * Every validity and touched transition on the form, as a signal.
   *
   * Reading it inside the error computeds is what makes them recompute under
   * OnPush: `touched` alone emits nothing on `statusChanges`, so an error that
   * should appear on blur would otherwise stay hidden until the next keystroke.
   */
  private readonly formEvents = toSignal(this.form.events);

  private readonly queryParams = toSignal(this.route.queryParamMap);

  private readonly errorAlert = viewChild<ElementRef<HTMLElement>>('errorAlert');

  /** True when the interceptor sent the user here after a failed token refresh. */
  readonly sessionExpired = computed(() => this.queryParams()?.get('reason') === 'session-expired');

  readonly emailError = computed<string | null>(() => {
    this.formEvents();
    const control = this.form.controls.email;
    if (!control.touched || control.valid) return null;
    return control.hasError('required') ? 'login.emailRequired' : 'login.emailInvalid';
  });

  readonly passwordError = computed<string | null>(() => {
    this.formEvents();
    const control = this.form.controls.password;
    return !control.touched || control.valid ? null : 'login.passwordRequired';
  });

  constructor() {
    // A failure left over from an earlier visit in this tab must not greet the
    // user as if this attempt had already failed.
    this.auth.error.set(null);

    // Move focus to the alert the moment it exists, so the failure is announced
    // rather than sitting silently above a form the user is still typing in.
    effect(() => {
      this.errorAlert()?.nativeElement.focus();
    });
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const credentials = this.form.getRawValue();

    this.auth
      .login(credentials)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.showSuccess(
            this.translate.instant('login.success'),
            this.translate.instant('login.title')
          );

          const target = this.safeReturnUrl();
          if (target) {
            void this.router.navigateByUrl(target);
          }
        },
        // The failure is rendered from auth.error(); nothing more to do here.
        error: () => undefined,
      });
  }

  /**
   * The `returnUrl` query parameter, if it is a same-origin path.
   *
   * Anything protocol-relative or absolute is discarded: a query parameter is
   * attacker-controllable, and following one blindly turns the sign-in screen
   * into an open redirect.
   *
   * @returns An in-app path to navigate to, or null to keep the default landing.
   */
  private safeReturnUrl(): string | null {
    const raw = this.queryParams()?.get('returnUrl');
    if (!raw) return null;
    if (!raw.startsWith('/') || raw.startsWith('//')) return null;
    if (raw.startsWith('/login')) return null;
    return raw;
  }
}
