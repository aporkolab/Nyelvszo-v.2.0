import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Entry } from 'src/app/model/entry';
import { ConfigService, TableColumn } from 'src/app/service/config.service';
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
export class EntriesComponent implements OnInit, OnDestroy {
  columns: TableColumn[];
  list$: Observable<Entry[]>;
  readonly entity = 'Entry';

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly config: ConfigService,
    private readonly entryService: EntryService,
    private readonly router: Router,
    private readonly notifyService: NotificationService
  ) {
    this.columns = this.config.entriesTableColumns;
    this.list$ = this.entryService.list$;
  }

  ngOnInit(): void {
    this.loadEntries();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadEntries(): void {
    // Request all entries with high page size for dictionary search
    this.entryService.getAll({ pageSize: 10000 }).pipe(takeUntil(this.destroy$)).subscribe();
  }

  private showSuccessDelete(): void {
    this.notifyService.showSuccess(`${this.entity} deleted successfully!`, 'NyelvSzó v.2.0.0');
  }

  private showError(err: Error | string): void {
    const message = err instanceof Error ? err.message : err;
    this.notifyService.showError(`Something went wrong. Details: ${message}`, 'NyelvSzó v.2.0.0');
  }

  onSelectOne(entry: Entry): void {
    this.router.navigate(['/', 'entries', 'edit', entry._id]);
  }

  onDeleteOne(entry: Entry): void {
    this.entryService
      .delete(entry)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.loadEntries(),
        error: (err: Error) => this.showError(err),
        complete: () => this.showSuccessDelete(),
      });
  }
}
