import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from './common/navbar/navbar.component';
import { TranslateService } from '@ngx-translate/core';
import { IMenuItem, ConfigService } from './service/config.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, NavbarComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  sidebar: IMenuItem[];
  title = 'NyelvSzo2.0';

  constructor(
    private config: ConfigService,
    public translate: TranslateService
  ) {
    this.sidebar = this.config.sidebarMenu;
    translate.addLangs(['hu', 'en']);
    translate.setDefaultLang('hu');
  }

  switchLanguage(lang: string) {
    this.translate.use(lang);
  }
}
