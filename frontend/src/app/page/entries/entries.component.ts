import { Component, OnInit, OnDestroy, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Entry } from 'src/app/model/entry';
import { ConfigService, TableColumn } from 'src/app/service/config.service';
import { EntryService, SearchOptions } from 'src/app/service/entry.service';
import { NotificationService } from 'src/app/service/notification.service';
import { AuthService } from 'src/app/service/auth.service';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { IconModule } from 'src/app/icon/icon.module';
import { SorterPipe } from 'src/app/pipe/sorter.pipe';

@Component({
  standalone: true,
  selector: 'app-entries',
  imports: [CommonModule, RouterModule, TranslateModule, FormsModule, IconModule, SorterPipe],
  templateUrl: './entries.component.html',
  styleUrls: ['./entries.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class EntriesComponent implements OnInit, OnDestroy {
  columns: TableColumn[];
  readonly entity = 'Entry';

  // Search state
  searchTerm = '';
  filterKey = 'hungarian'; // Default: search Hungarian column
  currentPage = 1;
  pageSize = 25;

  // Sort state
  columnKey = '';
  sortDir = 1;

  // Results
  results: Entry[] = [];
  hasSearched = false;

  // Reactive streams
  private readonly searchTerm$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly config: ConfigService,
    readonly entryService: EntryService,
    public readonly auth: AuthService,
    private readonly router: Router,
    private readonly notifyService: NotificationService,
    public readonly translate: TranslateService
  ) {
    this.columns = this.config.entriesTableColumns;
    translate.addLangs(['en', 'hu']);
    translate.setDefaultLang('hu');
  }

  ngOnInit(): void {
    this.setupSearch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch(): void {
    this.searchTerm$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.searchTerm.trim().length >= 2) {
          this.currentPage = 1;
          this.performSearch();
        } else {
          this.results = [];
          this.hasSearched = false;
        }
      });
  }

  onSearchChange(): void {
    this.searchTerm$.next(this.searchTerm);
  }

  onFilterKeyChange(): void {
    if (this.searchTerm.trim().length >= 2) {
      this.currentPage = 1;
      this.performSearch();
    }
  }

  performSearch(): void {
    if (!this.searchTerm.trim()) {
      this.results = [];
      this.hasSearched = false;
      return;
    }

    const options: SearchOptions = {
      page: this.currentPage,
      limit: this.pageSize,
      sortBy: 'alphabetical',
    };

    const term = this.searchTerm.trim();

    // If filtering by specific column, use that filter
    // Otherwise search across all text fields
    switch (this.filterKey) {
      case 'hungarian':
        options.hungarian = term;
        break;
      case 'english':
        options.english = term;
        break;
      case 'fieldOfExpertise':
        options.fieldOfExpertise = term;
        break;
      case 'wordType':
        options.wordType = term;
        break;
      default:
        // Search all columns (hungarian, english, fieldOfExpertise, wordType)
        options.search = term;
        break;
    }

    this.entryService
      .search(options)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: response => {
          this.results = response.data;
          this.hasSearched = true;
        },
        error: err => {
          this.showError(err);
          this.results = [];
          this.hasSearched = true;
        },
      });
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.performSearch();
  }

  onColumnSelect(key: string): void {
    this.columnKey = key;
    this.sortDir = this.sortDir * -1;
  }

  onSelectOne(entry: Entry): void {
    this.router.navigate(['/', 'entries', 'edit', entry._id]);
  }

  onDeleteOne(entry: Entry): void {
    if (!confirm('Do you really want to delete this record? This process cannot be undone.')) {
      return;
    }

    this.entryService
      .delete(entry)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.performSearch();
          this.showSuccessDelete();
        },
        error: (err: Error) => this.showError(err),
      });
  }

  private showSuccessDelete(): void {
    this.notifyService.showSuccess(`${this.entity} deleted successfully!`, 'NyelvSzó v.2.0.0');
  }

  private showError(err: unknown): void {
    let message = 'Unknown error';
    if (err instanceof Error) {
      message = err.message;
    } else if (typeof err === 'string') {
      message = err;
    } else if (err && typeof err === 'object') {
      // Handle HttpErrorResponse
      const httpErr = err as {
        error?: { message?: string };
        message?: string;
        statusText?: string;
      };
      message =
        httpErr.error?.message || httpErr.message || httpErr.statusText || JSON.stringify(err);
    }
    this.notifyService.showError(`Something went wrong. Details: ${message}`, 'NyelvSzó v.2.0.0');
  }

  get pageList(): (number | string)[] {
    const pagination = this.entryService.pagination$.value;
    if (!pagination || pagination.totalPages <= 1) {
      return [];
    }

    const total = pagination.totalPages;
    const current = this.currentPage;
    const delta = 2; // Pages to show around current page
    const pages: (number | string)[] = [];

    // Always show first page
    pages.push(1);

    // Calculate range around current page
    const rangeStart = Math.max(2, current - delta);
    const rangeEnd = Math.min(total - 1, current + delta);

    // Add ellipsis after first page if needed
    if (rangeStart > 2) {
      pages.push('...');
    }

    // Add pages in range
    for (let i = rangeStart; i <= rangeEnd; i++) {
      pages.push(i);
    }

    // Add ellipsis before last page if needed
    if (rangeEnd < total - 1) {
      pages.push('...');
    }

    // Always show last page (if more than 1 page)
    if (total > 1) {
      pages.push(total);
    }

    return pages;
  }

  get pagination() {
    return this.entryService.pagination$.value;
  }
}
