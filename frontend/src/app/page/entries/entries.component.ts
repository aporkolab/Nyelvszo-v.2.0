import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Entry } from 'src/app/model/entry';
import { ConfigService } from 'src/app/service/config.service';
import { EntryService } from 'src/app/service/entry.service';
import { NotificationService } from 'src/app/service/notification.service';

@Component({
  selector: 'app-entries',
  templateUrl: './entries.component.html',
  styleUrls: ['./entries.component.scss']
})
export class EntriesComponent implements OnInit {
  columns = this.config.entriesTableColumns;
  list$ = this.entryService.getAll();
  entity = 'Entry';

  constructor(
    private config: ConfigService,
    private entryService: EntryService,
    private router: Router,
    private notifyService: NotificationService
  ) {}

  ngOnInit(): void {}

  showSuccessDelete() {
    this.notifyService.showSuccess(
      `${this.entity} delete successfully!`,
      'NyelvSzó v.2.0.0'
    );
  }

  showError(err: String) {
    this.notifyService.showError(
      'Something went wrong. Details:' + err,
      'NyelvSzó v.2.0.0'
    );
  }

  onSelectOne(entry: Entry): void {
    this.router.navigate(['/', 'entries', 'edit', entry._id]);
  }

  onDeleteOne(entry: Entry): void {
    this.entryService.delete(entry).subscribe({
      next: () => (this.list$ = this.entryService.getAll()),
      error: (err) => this.showError(err),
      complete: () => this.showSuccessDelete(),
    });
  }
}