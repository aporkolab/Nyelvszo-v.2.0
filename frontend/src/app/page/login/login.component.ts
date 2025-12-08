import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService, ILoginData } from 'src/app/service/auth.service';
import { NotificationService } from 'src/app/service/notification.service';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit, OnDestroy {
  loginData: ILoginData = {
    email: '',
    password: '',
  };

  isLoading = false;
  errorMessage: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly auth: AuthService,
    private readonly notifyService: NotificationService
  ) {}

  ngOnInit(): void {
    
    this.auth.isLoading$
      .pipe(takeUntil(this.destroy$))
      .subscribe((loading) => (this.isLoading = loading));

    
    this.auth.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe((error) => {
        this.errorMessage = error;
        if (error) {
          this.notifyService.showError(error, 'Login Error');
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onLogin(): void {
    if (!this.loginData.email || !this.loginData.password) {
      this.notifyService.showWarning('Please enter email and password', 'Validation');
      return;
    }

    this.errorMessage = null;
    this.auth.login(this.loginData)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notifyService.showSuccess('Login successful!', 'Welcome');
        },
        error: () => {
          
        },
      });
  }
}
