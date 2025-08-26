import { Component } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ConfigService, IMenuItem } from './service/config.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
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

  switchLanguage(lang: string){
    this.translate.use(lang);
  }
}