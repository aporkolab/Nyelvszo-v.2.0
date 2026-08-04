import { Injectable, inject } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

/** Heading shown on a toast when the call site does not supply one. */
const DEFAULT_TITLE = 'NyelvSzó';

/**
 * Thin wrapper over ngx-toastr.
 *
 * Its only job is to keep the toast library behind one seam and to supply the
 * application name as the default heading — every call site used to repeat the
 * literal string 'NyelvSzó v.2.0.0', which meant the version number was baked
 * into a dozen unrelated files.
 */
@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private readonly toastr = inject(ToastrService);

  /**
   * Confirm that an action completed.
   *
   * @param message - What happened, in the user's language.
   * @param title - Optional heading; defaults to the application name.
   */
  showSuccess(message: string, title: string = DEFAULT_TITLE): void {
    this.toastr.success(message, title);
  }

  /**
   * Report a failure the user cannot act on directly.
   *
   * @param message - What went wrong, in the user's language.
   * @param title - Optional heading; defaults to the application name.
   */
  showError(message: string, title: string = DEFAULT_TITLE): void {
    this.toastr.error(message, title);
  }

  /**
   * State a neutral fact.
   *
   * @param message - The information, in the user's language.
   * @param title - Optional heading; defaults to the application name.
   */
  showInfo(message: string, title: string = DEFAULT_TITLE): void {
    this.toastr.info(message, title);
  }

  /**
   * Flag something the user should act on, such as a refused operation.
   *
   * @param message - The warning, in the user's language.
   * @param title - Optional heading; defaults to the application name.
   */
  showWarning(message: string, title: string = DEFAULT_TITLE): void {
    this.toastr.warning(message, title);
  }
}
