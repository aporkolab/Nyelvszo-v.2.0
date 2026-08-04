import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';

import { IconModule } from 'src/app/icon/icon.module';
import { Entry } from 'src/app/model/entry';
import { ApiError } from 'src/app/service/api.types';
import { EntryService } from 'src/app/service/entry.service';
import { NotificationService } from 'src/app/service/notification.service';

/**
 * Required-with-content.
 *
 * `Validators.required` accepts a string of spaces, which the API then rejects
 * after trimming — the user would see a server error for a field the form had
 * already declared valid.
 */
function requiredText(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.trim().length > 0
    ? null
    : { required: true };
}

/**
 * Create or edit a dictionary entry.
 *
 * The route parameter `0` means "new"; any other value is loaded from the API
 * before the form is shown.
 */
@Component({
  standalone: true,
  selector: 'app-entries-editor',
  imports: [ReactiveFormsModule, RouterLink, TranslateModule, IconModule],
  templateUrl: './entries-editor.component.html',
  styleUrl: './entries-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntriesEditorComponent {
  private readonly entryService = inject(EntryService);
  private readonly notifications = inject(NotificationService);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  /** Identifier of the record being edited; null while creating. */
  private readonly entryId = signal<string | null>(null);

  protected readonly isNew = signal(true);
  protected readonly loading = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly submitting = signal(false);

  /** Error the server reported that could not be attached to a single field. */
  protected readonly formError = signal<string | null>(null);

  protected readonly titleKey = computed(() =>
    this.isNew() ? 'entryEditor.createTitle' : 'entryEditor.editTitle'
  );

  protected readonly submitKey = computed(() => (this.isNew() ? 'actions.create' : 'actions.save'));

  /** Placeholder rows rendered while the record loads. */
  protected readonly skeletonRows = [0, 1, 2, 3];

  protected readonly form = this.fb.nonNullable.group({
    hungarian: ['', [requiredText, Validators.maxLength(500)]],
    english: ['', [requiredText, Validators.maxLength(500)]],
    fieldOfExpertise: ['', [requiredText, Validators.maxLength(200)]],
    wordType: ['', [Validators.maxLength(100)]],
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => this.load(params.get('id')));
  }

  /** Re-run the initial load after a failure. */
  protected retry(): void {
    this.load(this.entryId() ?? '0');
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
    const entry = new Entry({
      _id: this.entryId() ?? '',
      hungarian: value.hungarian.trim(),
      english: value.english.trim(),
      fieldOfExpertise: value.fieldOfExpertise.trim(),
      wordType: value.wordType.trim(),
    });

    const creating = this.isNew();
    const request = creating ? this.entryService.create(entry) : this.entryService.update(entry);

    request
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.notifications.showSuccess(
            this.translate.instant(creating ? 'entryEditor.created' : 'entryEditor.updated'),
            ''
          );
          void this.router.navigate(['/entries']);
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
    if (errors['maxlength']) return 'form.maxLength';

    return 'error.generic';
  }

  protected errorParams(name: string): Record<string, unknown> {
    const errors = this.form.get(name)?.errors ?? {};
    return { max: errors['maxlength']?.requiredLength };
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
    this.entryId.set(creating ? null : id);
    this.formError.set(null);
    this.loadFailed.set(false);

    if (creating) {
      this.form.reset();
      this.loading.set(false);
      return;
    }

    this.loading.set(true);

    this.entryService
      .getOne(id as string)
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: entry =>
          this.form.reset({
            hungarian: entry.hungarian,
            english: entry.english,
            fieldOfExpertise: entry.fieldOfExpertise,
            wordType: entry.wordType,
          }),
        error: () => this.loadFailed.set(true),
      });
  }

  /**
   * Show what the server rejected.
   *
   * Field-level `details` are attached to the matching control so the message
   * appears where the value is; anything without a control is shown above the
   * form rather than swallowed.
   */
  private handleApiError(error: unknown): void {
    const response = error instanceof HttpErrorResponse ? error : null;
    const body = (response?.error ?? null) as ApiError | null;
    const unmapped: string[] = [];

    for (const detail of body?.details ?? []) {
      const name = detail.field.split('.').pop() ?? detail.field;
      const control = this.form.get(name);

      if (control) {
        control.setErrors({ ...(control.errors ?? {}), server: detail.message });
        control.markAsTouched();
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
}
