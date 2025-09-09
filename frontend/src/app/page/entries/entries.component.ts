import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Entry } from 'src/app/model/entry';
import { ConfigService } from 'src/app/service/config.service';
import { EntryService } from 'src/app/service/entry.service';
import { NotificationService } from 'src/app/service/notification.service';
import { NgxDataTableComponent } from '../../data-table/ngx-data-table/ngx-data-table.component';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  standalone: true,
  selector: 'app-entries',
  imports: [CommonModule, NgxDataTableComponent, TranslateModule],
  templateUrl: './entries.component.html',
})
export class EntriesComponent implements OnInit {
  columns;
  list$;
  entity = 'Entry';

  constructor(
    private config: ConfigService,
    private entryService: EntryService,
    private router: Router,
    private notifyService: NotificationService
  ) {
    this.columns = this.config.entriesTableColumns;
    this.list$ = this.entryService.getAll();
  }

  ngOnInit(): void {}

  showSuccessDelete() {
    this.notifyService.showSuccess(`${this.entity} delete successfully!`, 'NyelvSzó v.2.0.0');
  }

  showError(err: String) {
    this.notifyService.showError('Something went wrong. Details:' + err, 'NyelvSzó v.2.0.0');
  }

  onSelectOne(entry: Entry): void {
    this.router.navigate(['/', 'entries', 'edit', entry._id]);
  }

  onDeleteOne(entry: Entry): void {
    this.entryService.delete(entry).subscribe({
      next: () => (this.list$ = this.entryService.getAll()),
      error: err => this.showError(err),
      complete: () => this.showSuccessDelete(),
    });
  }
}
