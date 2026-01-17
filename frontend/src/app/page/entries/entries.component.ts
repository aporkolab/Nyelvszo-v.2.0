import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Entry } from 'src/app/model/entry';
import { ConfigService, TableColumn } from 'src/app/service/config.service';
import { EntryService, SearchOptions } from 'src/app/service/entry.service';
import { NotificationService } from 'src/app/service/notification.service';
import { NgxDataTableComponent } from '../../data-table/ngx-data-table/ngx-data-table.component';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  selector: 'app-entries',
  imports: [CommonModule, NgxDataTableComponent, TranslateModule, FormsModule],
  templateUrl: './entries.component.html',
})
export class EntriesComponent implements OnInit, OnDestroy {
  columns: TableColumn[];
  readonly entity = 'Entry';

  // Search state
  searchTerm = '';
  currentPage = 1;
  pageSize = 25;

  // Reactive streams
  private readonly searchTerm$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly config: ConfigService,
    readonly entryService: EntryService,
    private readonly router: Router,
    private readonly notifyService: NotificationService
  ) {
    this.columns = this.config.entriesTableColumns;
  }

  ngOnInit(): void {
    this.setupSearch();
    // Load initial data
    this.performSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch(): void {
    // Debounced search - waits 300ms after user stops typing
    this.searchTerm$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.currentPage = 1;
        this.performSearch();
      });
  }

  onSearchChange(term: string): void {
    this.searchTerm = term;
    this.searchTerm$.next(term);
  }

  performSearch(): void {
    const options: SearchOptions = {
      search: this.searchTerm || undefined,
      page: this.currentPage,
      limit: this.pageSize,
      sortBy: 'alphabetical',
    };

    this.entryService.search(options).pipe(takeUntil(this.destroy$)).subscribe();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.performSearch();
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
        next: () => this.performSearch(),
        error: (err: Error) => this.showError(err),
        complete: () => this.showSuccessDelete(),
      });
  }
}
