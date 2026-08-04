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
import { RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { IconModule } from 'src/app/icon/icon.module';
import { User, UserRole } from 'src/app/model/user';
import { ApiError, EMPTY_PAGINATION, Pagination } from 'src/app/service/api.types';
import { NotificationService } from 'src/app/service/notification.service';
import { UserService } from 'src/app/service/user.service';

/** The three states an asynchronous list can be in. */
type LoadStatus = 'loading' | 'ready' | 'error';

const PAGE_SIZE = 25;
const ELLIPSIS = '…';

/**
 * Account administration.
 *
 * Self-contained: the shared data-table component this page used to delegate to
 * rendered every entity the same way, which is why the account list showed a
 * raw Mongo identifier and no account status. Pagination is done by the server —
 * the previous implementation fetched every account at once.
 */
@Component({
  standalone: true,
  selector: 'app-users',
  imports: [RouterLink, TranslateModule, IconModule],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersComponent {
  private readonly userService = inject(UserService);
  private readonly notifications = inject(NotificationService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly status = signal<LoadStatus>('loading');
  readonly users = signal<User[]>([]);
  readonly pagination = signal<Pagination>(EMPTY_PAGINATION);
  readonly page = signal(1);

  /** Message from a failed load, shown in the error state. */
  readonly errorMessage = signal<string | null>(null);

  /** Message from a refused deletion (HTTP 409); actionable, so it stays on screen. */
  readonly conflictMessage = signal<string | null>(null);

  /** Identifier of the account currently being deleted, if any. */
  readonly deletingId = signal<string | null>(null);

  /** Placeholder rows for the loading state. */
  readonly skeletonRows = [0, 1, 2, 3, 4];

  /**
   * Page numbers to render, with ellipses standing in for the omitted runs.
   * Empty while there is only one page, so the control disappears entirely.
   */
  readonly pageItems = computed<(number | string)[]>(() => {
    const total = this.pagination().totalPages;
    const current = this.page();

    if (total <= 1) {
      return [];
    }

    const items: (number | string)[] = [1];
    const from = Math.max(2, current - 1);
    const to = Math.min(total - 1, current + 1);

    if (from > 2) {
      items.push(ELLIPSIS);
    }

    for (let candidate = from; candidate <= to; candidate++) {
      items.push(candidate);
    }

    if (to < total - 1) {
      items.push(ELLIPSIS);
    }

    items.push(total);

    return items;
  });

  constructor() {
    this.load();
  }

  /** Whether an item in the pagination list is an ellipsis rather than a page number. */
  isEllipsis(item: number | string): boolean {
    return item === ELLIPSIS;
  }

  /** Translation key naming a role. */
  roleLabel(role: UserRole): string {
    switch (role) {
      case UserRole.Admin:
        return 'roles.admin';
      case UserRole.Editor:
        return 'roles.editor';
      case UserRole.User:
        return 'roles.viewer';
      default:
        return 'roles.unknown';
    }
  }

  /** Fetch the current page of accounts. */
  load(): void {
    this.status.set('loading');
    this.errorMessage.set(null);

    this.userService
      .list(this.page(), PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.users.set(response.data);
          this.pagination.set(response.pagination ?? EMPTY_PAGINATION);
          this.status.set('ready');
        },
        error: (error: unknown) => {
          this.users.set([]);
          this.pagination.set(EMPTY_PAGINATION);
          this.errorMessage.set(this.messageFor(error));
          this.status.set('error');
        },
      });
  }

  /**
   * Move to another page.
   *
   * @param page - 1-based page number.
   */
  goTo(page: number): void {
    const total = Math.max(1, this.pagination().totalPages);
    const target = Math.min(Math.max(1, page), total);

    if (target === this.page()) {
      return;
    }

    this.page.set(target);
    this.load();
  }

  /** Dismiss the refused-deletion message. */
  dismissConflict(): void {
    this.conflictMessage.set(null);
  }

  /**
   * Delete an account after confirmation.
   *
   * The API refuses two deletions — your own account, and the last remaining
   * administrator — with 409 and an explanatory message. That message is the
   * useful part, so it is shown verbatim and kept on screen instead of being
   * flattened into a generic failure.
   *
   * @param user - The account to remove.
   */
  onDelete(user: User): void {
    const name = user.fullName || user.email;

    if (!window.confirm(this.text('confirm.deleteUser', { name }))) {
      return;
    }

    this.deletingId.set(user._id);
    this.conflictMessage.set(null);

    this.userService
      .delete(user._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deletingId.set(null);
          this.notifications.showSuccess(this.text('users.deleted', { name }));

          // Removing the only row of the last page would otherwise leave the
          // administrator staring at an empty page that is not the first one.
          if (this.users().length === 1 && this.page() > 1) {
            this.page.set(this.page() - 1);
          }

          this.load();
        },
        error: (error: unknown) => {
          this.deletingId.set(null);
          const message = this.messageFor(error);

          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.conflictMessage.set(message);
            this.notifications.showWarning(message, this.text('users.deleteBlockedTitle'));
            return;
          }

          this.notifications.showError(message);
        },
      });
  }

  private text(key: string, params?: Record<string, unknown>): string {
    return String(this.translate.instant(key, params));
  }

  private messageFor(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const body: unknown = error.error;

      if (typeof body === 'string' && body.trim()) {
        return body;
      }

      const apiError = body as ApiError | null;
      if (apiError && typeof apiError.error === 'string' && apiError.error.trim()) {
        return apiError.error;
      }

      if (error.status === 0) {
        return this.text('error.network');
      }

      if (error.status === 403) {
        return this.text('error.forbidden');
      }
    }

    return this.text('error.generic');
  }
}
