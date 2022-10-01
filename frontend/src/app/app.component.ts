import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ConfigService, IMenuItem } from './service/config.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  constructor(private config: ConfigService, public translate: TranslateService) {translate.addLangs(['hu', 'en']);
  translate.setDefaultLang('hu');}

  sidebar: IMenuItem[] = this.config.sidebarMenu;
  title = 'NyelvSzo2.0';

  switchLanguage(lang: string){
    this.translate.use(lang);
  }
}