import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { User } from 'src/app/model/user';
import { UserService } from 'src/app/service/user.service';
import { NotificationService } from 'src/app/service/notification.service';

@Component({
  standalone: true,
  selector: 'app-users-editor',
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  templateUrl: './users-editor.component.html',
})
export class UsersEditorComponent implements OnInit, OnDestroy {
  user: User = new User();
  entity = 'User';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly userService: UserService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly notifyService: NotificationService
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(
        switchMap(params => {
          const id = params['id'];
          if (id === '0' || !id) {
            this.user = new User();
            return [];
          }
          return this.userService.getOne(id);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: user => {
          if (user) {
            this.user = user;
          }
        },
        error: err => this.showError(err.message || 'Failed to load user'),
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSubmit(user: User): void {
    if (user && user._id) {
      this.onUpdate(user);
    } else {
      this.onCreate(user);
    }
  }

  onUpdate(user: User): void {
    this.userService
      .update(user)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.router.navigate(['/users']),
        error: err => this.showError(err.message || 'Update failed'),
        complete: () => this.showSuccessEdit(),
      });
  }

  onCreate(user: User): void {
    this.userService
      .create(user)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.router.navigate(['/users']),
        error: err => this.showError(err.message || 'Create failed'),
        complete: () => this.showSuccessCreate(),
      });
  }

  showSuccessEdit(): void {
    this.notifyService.showSuccess(`${this.entity} edited successfully!`, 'NyelvSzó v.2.0.0');
  }

  showSuccessCreate(): void {
    this.notifyService.showSuccess(`${this.entity} created successfully!`, 'NyelvSzó v.2.0.0');
  }

  showError(err: string): void {
    this.notifyService.showError(`Something went wrong. Details: ${err}`, 'NyelvSzó v.2.0.0');
  }
}
