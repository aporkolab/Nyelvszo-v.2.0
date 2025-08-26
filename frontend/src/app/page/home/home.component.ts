import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-home',
  imports: [CommonModule, TranslateModule],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
