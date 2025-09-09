import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-contact',
  imports: [CommonModule, TranslateModule],
  templateUrl: './contact.component.html',
})
export class ContactComponent implements OnInit {
  constructor() {}

  ngOnInit(): void {}
}
