import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from 'src/app/service/auth.service';
import { User } from 'src/app/model/user';
import { IconModule } from '../../icon/icon.module';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, IconModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent {
  readonly user$: BehaviorSubject<User | null>;

  constructor(
    private readonly auth: AuthService,
    public readonly translate: TranslateService
  ) {
    this.user$ = this.auth.user$;
    translate.addLangs(['en', 'hu']);
    translate.setDefaultLang('hu');
  }

  getRightsDescription(role: number): string {
    switch (role) {
      case 1:
        return 'You may view all tables except users, but you may not create, edit or delete any entities.';
      case 2:
        return 'You may view all tables except users, and you may edit any of them but you may not create or delete any entities.';
      case 3:
        return 'You may view all tables, and you may create, edit or delete any entities.';
      default:
        return 'Invalid role value. The role value can only be 1, 2 or 3.';
    }
  }

  switchLanguage(lang: string): void {
    this.translate.use(lang);
  }

  logout(): void {
    this.auth.logout();
  }
}
