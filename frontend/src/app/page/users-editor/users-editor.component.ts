import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';

import { IconModule } from 'src/app/icon/icon.module';
import { User, UserRole } from 'src/app/model/user';
import { ApiError } from 'src/app/service/api.types';
import { NotificationService } from 'src/app/service/notification.service';
import { UserService } from 'src/app/service/user.service';

// Both patterns are copied from the API's Joi schema rather than approximated.
// A stricter client rule would reject a name or passphrase the server accepts,
// and a looser one would let the user submit something that comes straight back
// as a 400.

/** Letters, marks, spaces, hyphens and apostrophes — "O'Brien" is a name. */
const NAME_PATTERN = /^[\p{L}\p{M}\s'’-]+$/u;

/** One lower-case letter, one upper-case, one digit and one symbol. */
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])[\s\S]+$/;

const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;

/**
 * Required-with-content.
 *
 * `Validators.required` accepts a string of spaces, which the API then rejects
 * after trimming.
 */
function requiredText(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length > 0
    ? null
    : { required: true };
}

/**
 * Password rules, which differ between creating and editing.
 *
 * On edit the API never returns the stored password, so an unconditionally
 * required field left the form permanently invalid and made saving an existing
 * account impossible. Here an empty value on edit is valid and means "leave the
 * password unchanged"; a value that *is* typed must still satisfy the server's
 * strength rule, so the account is never rejected after the fact.
 */
function passwordValidator(required: boolean): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value : '';

    if (value.length === 0) {
      return required ? { required: true } : null;
    }

    if (value.length > PASSWORD_MAX) {
      return { maxlength: { requiredLength: PASSWORD_MAX, actualLength: value.length } };
    }

    return value.length >= PASSWORD_MIN && STRONG_PASSWORD.test(value)
      ? null
      : { weakPassword: true };
  };
}

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.User]: 'roles.viewer',
  [UserRole.Editor]: 'roles.editor',
  [UserRole.Admin]: 'roles.admin',
};

const ROLE_HELP: Record<UserRole, string> = {
  [UserRole.User]: 'roleHelp.viewer',
  [UserRole.Editor]: 'roleHelp.editor',
  [UserRole.Admin]: 'roleHelp.admin',
};

/**
 * Create or edit a user account.
 *
 * The route parameter `0` means "new"; any other value is loaded from the API
 * before the form is shown.
 */
@Component({
  standalone: true,
  selector: 'app-users-editor',
  imports: [ReactiveFormsModule, RouterLink, TranslateModule, IconModule],
  templateUrl: './users-editor.component.html',
  styleUrl: './users-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersEditorComponent {
  private readonly userService = inject(UserService);
  private readonly notifications = inject(NotificationService);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  /** Identifier of the account being edited; null while creating. */
  private readonly userId = signal<string | null>(null);

  protected readonly isNew = signal(true);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly submitting = signal(false);
  protected readonly passwordVisible = signal(false);

  /** Error the server reported that could not be attached to a single field. */
  protected readonly formError = signal<string | null>(null);

  protected readonly titleKey = computed(() =>
    this.isNew() ? 'userEditor.createTitle' : 'userEditor.editTitle'
  );

  protected readonly submitKey = computed(() => (this.isNew() ? 'actions.create' : 'actions.save'));

  protected readonly passwordHintKey = computed(() =>
    this.isNew() ? 'userEditor.passwordCreateHint' : 'userEditor.passwordEditHint'
  );

  /** Placeholder rows rendered while the account loads. */
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly roleOptions = [
    { value: UserRole.User, label: ROLE_LABELS[UserRole.User] },
    { value: UserRole.Editor, label: ROLE_LABELS[UserRole.Editor] },
    { value: UserRole.Admin, label: ROLE_LABELS[UserRole.Admin] },
  ];

  protected readonly form = this.fb.nonNullable.group({
    firstName: [
      '',
      [
        requiredText,
        Validators.minLength(2),
        Validators.maxLength(100),
        Validators.pattern(NAME_PATTERN),
      ],
    ],
    lastName: [
      '',
      [
        requiredText,
        Validators.minLength(2),
        Validators.maxLength(100),
        Validators.pattern(NAME_PATTERN),
      ],
    ],
    email: ['', [requiredText, Validators.email, Validators.maxLength(255)]],
    role: [UserRole.User],
    isActive: [true],
    password: ['', [passwordValidator(true)]],
  });

  private readonly role = toSignal(this.form.controls.role.valueChanges, {
    initialValue: this.form.controls.role.value,
  });

  /** Description of the currently selected role, shown under the select. */
  protected readonly roleHelpKey = computed(() => ROLE_HELP[this.role()] ?? 'roles.unknown');

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => this.load(params.get('id')));
  }

  protected togglePasswordVisibility(): void {
    this.passwordVisible.update(visible => !visible);
  }

  /** Re-run the initial load after a failure. */
  protected retry(): void {
    this.load(this.userId() ?? '0');
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.formError.set(null);
    this.submitting.set(true);

    const value = this.form.getRawValue();
    const user = new User({
      _id: this.userId() ?? '',
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      email: value.email.trim(),
      role: value.role,
      isActive: value.isActive,
    });

    const creating = this.isNew();
    const request = creating
      ? this.userService.create(user, value.password)
      : this.userService.update(user, value.password);

    request
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.notifications.showSuccess(
            this.translate.instant(creating ? 'userEditor.created' : 'userEditor.updated'),
            ''
          );
          void this.router.navigate(['/users']);
        },
        error: (error: unknown) => this.handleApiError(error),
      });
  }

  /** Whether a field's message should be shown, and which one. */
  protected errorKey(name: string): string | null {
    const control = this.form.get(name);

    if (!control || control.valid || !(control.touched || control.dirty)) {
      return null;
    }

    const errors = control.errors ?? {};

    if (typeof errors['server'] === 'string') return errors['server'];
    if (errors['required']) return 'form.required';
    if (errors['weakPassword']) return 'form.weakPassword';
    if (errors['email']) return 'form.invalidEmail';
    if (errors['minlength']) return 'form.minLength';
    if (errors['maxlength']) return 'form.maxLength';
    if (errors['pattern']) return 'form.lettersOnly';

    return 'error.generic';
  }

  protected errorParams(name: string): Record<string, unknown> {
    const errors = this.form.get(name)?.errors ?? {};
    return {
      min: errors['minlength']?.requiredLength,
      max: errors['maxlength']?.requiredLength,
    };
  }

  /** Ids of the hint and the visible error, for `aria-describedby`. */
  protected describedBy(name: string, hasHint: boolean): string | null {
    const ids: string[] = [];

    if (hasHint) ids.push(`${name}-hint`);
    if (this.errorKey(name)) ids.push(`${name}-error`);

    return ids.length > 0 ? ids.join(' ') : null;
  }

  private load(id: string | null): void {
    const creating = !id || id === '0';

    this.isNew.set(creating);
    this.userId.set(creating ? null : id);
    this.formError.set(null);
    this.loadFailed.set(false);
    this.passwordVisible.set(false);

    const password = this.form.controls.password;
    password.setValidators([passwordValidator(creating)]);
    password.updateValueAndValidity({ emitEvent: false });

    if (creating) {
      this.form.reset();
      this.loading.set(false);
      return;
    }

    this.loading.set(true);

    this.userService
      .getOne(id as string)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: user =>
          this.form.reset({
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            isActive: user.isActive ?? true,
            password: '',
          }),
        error: () => this.loadFailed.set(true),
      });
  }

  /**
   * Show what the server rejected.
   *
   * A 409 has several causes here — a taken email address, but also "you cannot
   * revoke your own administrator access" and "at least one active
   * administrator must remain". Only the first belongs on the email field; the
   * API distinguishes them with `type: 'DuplicateEmailError'`, and reporting an
   * account-policy refusal as an email error would be actively misleading.
   */
  private handleApiError(error: unknown): void {
    const response = error instanceof HttpErrorResponse ? error : null;
    const body = (response?.error ?? null) as ApiError | null;

    if (response?.status === 409) {
      const message = body?.error || this.translate.instant('error.conflict');

      if (body?.type === 'DuplicateEmailError') {
        this.setServerError('email', message);
      } else {
        this.formError.set(message);
      }
      return;
    }

    const unmapped: string[] = [];

    for (const detail of body?.details ?? []) {
      const name = detail.field.split('.').pop() ?? detail.field;

      if (this.form.get(name)) {
        this.setServerError(name, detail.message);
      } else {
        unmapped.push(detail.message);
      }
    }

    if (unmapped.length > 0) {
      this.formError.set(unmapped.join(' '));
      return;
    }

    if (body?.details?.length) {
      return;
    }

    this.formError.set(body?.error || this.translate.instant('error.generic'));
  }

  private setServerError(name: string, message: string): void {
    const control = this.form.get(name);

    if (!control) {
      this.formError.set(message);
      return;
    }

    control.setErrors({ ...(control.errors ?? {}), server: message });
    control.markAsTouched();
  }
}
