import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { IconModule } from 'src/app/icon/icon.module';
import { AuthService, ILoginData } from 'src/app/service/auth.service';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './login.component.html',
})
export class LoginComponent implements OnInit {
  loginData: ILoginData = {};

  constructor(
    private auth: AuthService,
    private icon: IconModule
  ) {}

  ngOnInit(): void {
    this.auth.logout();
  }

  onLogin(): void {
    this.auth.login(this.loginData);
  }
}
