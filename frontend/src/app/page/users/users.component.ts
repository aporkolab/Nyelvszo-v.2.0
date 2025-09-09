import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { NgxDataTableComponent } from 'src/app/data-table/ngx-data-table/ngx-data-table.component';
import { User } from 'src/app/model/user';
import { ConfigService } from 'src/app/service/config.service';
import { NotificationService } from 'src/app/service/notification.service';
import { UserService } from 'src/app/service/user.service';

@Component({
  standalone: true,
  selector: 'app-users',
  imports: [CommonModule, NgxDataTableComponent, TranslateModule],
  templateUrl: './users.component.html',
})
export class UsersComponent implements OnInit {
  columns;
  list$;
  entity = 'User';

  constructor(
    private config: ConfigService,
    private userService: UserService,
    private router: Router,
    private notifyService: NotificationService
  ) {
    this.columns = this.config.usersTableColumn;
    this.list$ = this.userService.getAll();
  }

  ngOnInit(): void {}

  showSuccessDelete() {
    this.notifyService.showSuccess(`${this.entity} delete successfully!`, 'NyelvSzó v.2.0.0');
  }

  showError(err: String) {
    this.notifyService.showError('Something went wrong. Details:' + err, 'NyelvSzó v.2.0.0');
  }

  onSelectOne(user: User): void {
    this.router.navigate(['/', 'users', 'edit', user._id]);
  }

  onDeleteOne(user: User): void {
    this.userService.delete(user).subscribe({
      next: () => (this.list$ = this.userService.getAll()),
      error: err => this.showError(err),
      complete: () => this.showSuccessDelete(),
    });
  }
}
