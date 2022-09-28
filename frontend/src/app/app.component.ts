import { Component } from '@angular/core';
import { ConfigService, IMenuItem } from './service/config.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  constructor(private config: ConfigService) {}
  sidebar: IMenuItem[] = this.config.sidebarMenu;
  title = 'vizsgaremek';
}