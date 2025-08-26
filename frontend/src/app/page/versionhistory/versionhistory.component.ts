import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

  @Component({
    standalone: true,
    selector: 'app-versionhistory',
    imports: [CommonModule, TranslateModule],
    templateUrl: './versionhistory.component.html',
  })
export class VersionhistoryComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
