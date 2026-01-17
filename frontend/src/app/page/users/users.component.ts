import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgxDataTableComponent } from 'src/app/data-table/ngx-data-table/ngx-data-table.component';
import { User } from 'src/app/model/user';
import { ConfigService, TableColumn } from 'src/app/service/config.service';
import { NotificationService } from 'src/app/service/notification.service';
import { UserService } from 'src/app/service/user.service';

@Component({
  standalone: true,
  selector: 'app-users',
  imports: [CommonModule, NgxDataTableComponent, TranslateModule],
  templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit, OnDestroy {
  columns: TableColumn[];
  list$: Observable<User[]>;
  readonly entity = 'User';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly config: ConfigService,
    private readonly userService: UserService,
    private readonly router: Router,
    private readonly notifyService: NotificationService
  ) {
    this.columns = this.config.usersTableColumn;
    this.list$ = this.userService.getAll();
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadUsers(): void {
    this.list$ = this.userService.getAll();
  }

  private showSuccessDelete(): void {
    this.notifyService.showSuccess(`${this.entity} deleted successfully!`, 'NyelvSzó v.2.0.0');
  }

  private showError(err: string): void {
    this.notifyService.showError(`Something went wrong. Details: ${err}`, 'NyelvSzó v.2.0.0');
  }

  onSelectOne(user: User): void {
    this.router.navigate(['/users', 'edit', user._id]);
  }

  onDeleteOne(user: User): void {
    this.userService
      .delete(user)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadUsers(),
        error: (err: Error) => this.showError(err.message),
        complete: () => this.showSuccessDelete(),
      });
  }
}
