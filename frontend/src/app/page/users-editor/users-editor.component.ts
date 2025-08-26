import { UserService } from 'src/app/service/user.service';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, of } from 'rxjs';
import { User } from 'src/app/model/user';
import { NotificationService } from 'src/app/service/notification.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-users-editor',
  imports: [CommonModule, FormsModule, RouterModule, TranslateModule],
  templateUrl: './users-editor.component.html',
})
export class UsersEditorComponent implements OnInit {
  user$!: Observable<User>;
  user: User = new User();
  entity = 'User';

  constructor(
    private userService: UserService,
    private route: ActivatedRoute,
    private router: Router,
    private notifyService: NotificationService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe({
      next: (param) => {
        if (param['id'] == '0') {
          return of(new User());
        }
        this.user$ = this.userService.getOne(param['id']);
        return this.userService.getOne(param['id']);
      },
    });
    this.user$.subscribe({
      next: (user) =>
        (this.user = user ? user : this.user),
    });
  }

  onUpdate(user: User) {
    this.userService.update(user).subscribe({
      next: (category) => this.router.navigate(['/', 'users']),
      error: (err) => this.showError(err),
      complete: () => this.showSuccessEdit(),
    });
  }

  onCreate(user: User) {
    this.userService.create(user).subscribe({
      next: (category) => this.router.navigate(['/', 'users']),
      error: (err) => this.showError(err),
      complete: () => this.showSuccessCreate(),
    });
  }

  showSuccessEdit() {
    this.notifyService.showSuccess(
      `${this.entity} edited successfully!`,
      'NyelvSzó v.2.0.0'
    );
  }

  showSuccessCreate() {
    this.notifyService.showSuccess(
      `${this.entity} created successfully!`,
      'NyelvSzó v.2.0.0'
    );
  }

  showError(err: String) {
    this.notifyService.showError(
      'Something went wrong. Details:' + err,
      'NyelvSzó v.2.0.0'
    );
  }

  onSubmit(user: User) {
    // ha van _id -> update, különben create
    if (user && user._id) {
      this.onUpdate(user);
    } else {
      this.onCreate(user);
    }
  }

}