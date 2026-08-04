import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  Observable,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';

import { IconModule } from 'src/app/icon/icon.module';
import { Entry } from 'src/app/model/entry';
import { EMPTY_PAGINATION, Pagination } from 'src/app/service/api.types';
import { AuthService } from 'src/app/service/auth.service';
import { EntryColumn, EntryService, EntrySort } from 'src/app/service/entry.service';
import { NotificationService } from 'src/app/service/notification.service';

const PAGE_SIZE = 20;
const MIN_TERM_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

/** Columns the search can be restricted to, in the order they are offered. */
const SEARCH_COLUMNS: readonly EntryColumn[] = [
  'hungarian',
  'english',
  'fieldOfExpertise',
  'wordType',
];

/**
 * Orderings the API supports.
 *
 * `relevance` is omitted deliberately: the server resolves it to the same
 * `{ hungarian: 1 }` sort as `alphabetical`, so offering both would present the
 * reader with two controls that do exactly the same thing.
 */
const SORT_OPTIONS: readonly EntrySort[] = ['alphabetical', 'newest', 'oldest', 'popular'];
const DEFAULT_SORT: EntrySort = 'alphabetical';

/** Number of placeholder rows drawn while a page is in flight. */
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5] as const;

/** One rendered pagination slot; `page === 0` marks the ellipsis. */
interface PageItem {
  readonly key: string;
  readonly page: number;
}

/** Everything a request depends on. A change to any field issues a new search. */
interface Criteria {
  readonly term: string;
  readonly column: EntryColumn | '';
  readonly page: number;
  readonly sortBy: EntrySort;
  readonly token: number;
}

/** The four things the results area can be showing. */
type ResultState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly entries: Entry[]; readonly pagination: Pagination };

/**
 * Dictionary search — the landing screen.
 *
 * The URL query string is the single source of truth for the search: the
 * component reads its state from `q`, `column`, `page` and `sort`, and every
 * interaction writes back through a navigation. That is what makes a search
 * linkable, survivable across a refresh, and correct under the back button.
 *
 * Ordering is delegated to the API. The previous version sorted the twenty rows
 * of the current page in a client-side pipe, which meant "sort alphabetically"
 * silently reordered a slice rather than the result set.
 */
@Component({
  standalone: true,
  selector: 'app-entries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, TranslateModule, IconModule],
  templateUrl: './entries.component.html',
  styleUrl: './entries.component.scss',
})
export class EntriesComponent {
  private readonly entryService = inject(EntryService);
  private readonly notifications = inject(NotificationService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly auth = inject(AuthService);

  readonly columns = SEARCH_COLUMNS;
  readonly sortOptions = SORT_OPTIONS;
  readonly skeletonRows = SKELETON_ROWS;

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly columnControl = new FormControl<EntryColumn | ''>('', { nonNullable: true });
  readonly sortControl = new FormControl<EntrySort>(DEFAULT_SORT, { nonNullable: true });

  /** Committed search state, mirrored from the query string. */
  private readonly term = signal('');
  private readonly column = signal<EntryColumn | ''>('');
  private readonly page = signal(1);
  private readonly sortBy = signal<EntrySort>(DEFAULT_SORT);

  /** Bumped to re-issue the current request after a retry or a deletion. */
  private readonly reloadToken = signal(0);

  /** Live input value, so the clear button appears without depending on zone ticks. */
  readonly typed = signal('');

  /** Language changes, read by the announcement so it is re-translated in place. */
  private readonly languageChange = toSignal(this.translate.onLangChange);

  private readonly criteria = computed<Criteria>(() => ({
    term: this.term(),
    column: this.column(),
    page: this.page(),
    sortBy: this.sortBy(),
    token: this.reloadToken(),
  }));

  private readonly state = toSignal(
    toObservable(this.criteria).pipe(
      distinctUntilChanged(
        (a, b) =>
          a.term === b.term &&
          a.column === b.column &&
          a.page === b.page &&
          a.sortBy === b.sortBy &&
          a.token === b.token
      ),
      switchMap((criteria): Observable<ResultState> => {
        if (criteria.term.length < MIN_TERM_LENGTH) {
          return of<ResultState>({ status: 'idle' });
        }

        return this.entryService
          .search({
            search: criteria.term,
            column: criteria.column,
            page: criteria.page,
            limit: PAGE_SIZE,
            sortBy: criteria.sortBy,
          })
          .pipe(
            map((response): ResultState => ({
              status: 'ready',
              entries: response.data,
              pagination: response.pagination ?? EMPTY_PAGINATION,
            })),
            catchError(() => of<ResultState>({ status: 'error' })),
            startWith<ResultState>({ status: 'loading' })
          );
      })
    ),
    { initialValue: { status: 'idle' } as ResultState }
  );

  readonly status = computed(() => this.state().status);

  readonly results = computed<readonly Entry[]>(() => {
    const state = this.state();
    return state.status === 'ready' ? state.entries : [];
  });

  readonly pagination = computed<Pagination>(() => {
    const state = this.state();
    return state.status === 'ready' ? state.pagination : EMPTY_PAGINATION;
  });

  readonly total = computed(() => this.pagination().totalItems);
  readonly totalPages = computed(() => this.pagination().totalPages);
  readonly hasResults = computed(() => this.results().length > 0);

  /** True once the API has answered but matched nothing. */
  readonly isEmpty = computed(() => this.status() === 'ready' && !this.hasResults());

  /**
   * The headword column is the only one the API can order by, and only
   * ascending, so it is the only header that gets a sort control.
   */
  readonly hungarianSort = computed(() => (this.sortBy() === DEFAULT_SORT ? 'ascending' : 'none'));

  /** First and last page always present, a window of five around the current one. */
  readonly pageList = computed<readonly PageItem[]>(() => {
    const { currentPage, totalPages } = this.pagination();
    if (totalPages <= 1) return [];

    const window = new Set<number>([1, totalPages]);
    for (let page = currentPage - 2; page <= currentPage + 2; page++) {
      if (page >= 1 && page <= totalPages) window.add(page);
    }

    const items: PageItem[] = [];
    let previous = 0;

    for (const page of [...window].sort((a, b) => a - b)) {
      if (previous && page - previous > 1) {
        items.push({ key: `gap-${page}`, page: 0 });
      }
      items.push({ key: `page-${page}`, page });
      previous = page;
    }

    return items;
  });

  /** Text pushed to the polite live region whenever the result set settles. */
  readonly announcement = computed(() => {
    this.languageChange();

    switch (this.status()) {
      case 'ready':
        return this.translate.instant('search.resultCount', { count: this.total() });
      case 'error':
        return this.translate.instant('search.errorTitle');
      default:
        return '';
    }
  });

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(params => this.applyQueryParams(params));

    this.searchControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(value => this.typed.set(value));

    // A search is committed only after the reader stops typing, and only once
    // the term is long enough to be worth a prefix query.
    this.searchControl.valueChanges
      .pipe(
        map(value => value.trim()),
        debounceTime(SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        takeUntilDestroyed()
      )
      .subscribe(term => this.navigate({ q: term, page: 1 }, true));

    this.columnControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(column => this.navigate({ column, page: 1 }));

    this.sortControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(sort => this.navigate({ sort, page: 1 }));
  }

  /** Clear the term and hand focus back to the input. */
  onClear(): void {
    this.searchControl.setValue('', { emitEvent: false });
    this.typed.set('');
    this.navigate({ q: '', page: 1 }, true);
    this.searchInput()?.nativeElement.focus();
  }

  /** Re-assert the alphabetical ordering from the headword column header. */
  sortAlphabetically(): void {
    this.navigate({ sort: DEFAULT_SORT, page: 1 });
  }

  /**
   * Move to another page.
   *
   * @param page - 1-based page number; 0 marks an ellipsis slot and is ignored.
   */
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.pagination().currentPage) return;
    this.navigate({ page });
  }

  /** Re-issue the current request after a failure. */
  retry(): void {
    this.reloadToken.update(token => token + 1);
  }

  /**
   * Delete an entry after confirmation, then refresh the listing.
   *
   * @param entry - The entry to remove.
   */
  onDelete(entry: Entry): void {
    const question = this.translate.instant('confirm.deleteEntry', { name: entry.hungarian });
    if (!confirm(question)) return;

    this.entryService
      .delete(entry._id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notifications.showSuccess(
            this.translate.instant('entryEditor.deleted'),
            this.translate.instant('Dictionary')
          );
          this.refreshAfterDelete();
        },
        error: () =>
          this.notifications.showError(
            this.translate.instant('error.generic'),
            this.translate.instant('Dictionary')
          ),
      });
  }

  /**
   * Removing the last row of a page would otherwise leave the reader stranded on
   * an empty page, so step back one instead of reloading it.
   */
  private refreshAfterDelete(): void {
    if (this.results().length <= 1 && this.page() > 1) {
      this.navigate({ page: this.page() - 1 });
      return;
    }
    this.reloadToken.update(token => token + 1);
  }

  /**
   * Adopt the query string as the component's state.
   *
   * Every value is validated here rather than trusted, because the query string
   * is user-editable: an unknown column or a negative page must degrade to the
   * default instead of being forwarded to the API.
   */
  private applyQueryParams(params: ParamMap): void {
    const term = (params.get('q') ?? '').trim();

    const rawColumn = params.get('column') ?? '';
    const column = SEARCH_COLUMNS.includes(rawColumn as EntryColumn)
      ? (rawColumn as EntryColumn)
      : '';

    const page = Math.max(1, Math.trunc(Number(params.get('page'))) || 1);

    const rawSort = params.get('sort') ?? '';
    const sort = SORT_OPTIONS.includes(rawSort as EntrySort)
      ? (rawSort as EntrySort)
      : DEFAULT_SORT;

    this.term.set(term);
    this.column.set(column);
    this.page.set(page);
    this.sortBy.set(sort);

    // Writing the control back only when it genuinely differs keeps a trailing
    // space (or an in-flight edit) from being wiped by our own navigation.
    if (this.searchControl.value.trim() !== term) {
      this.searchControl.setValue(term, { emitEvent: false });
      this.typed.set(term);
    }
    if (this.columnControl.value !== column) {
      this.columnControl.setValue(column, { emitEvent: false });
    }
    if (this.sortControl.value !== sort) {
      this.sortControl.setValue(sort, { emitEvent: false });
    }
  }

  /**
   * Write the next search state into the URL.
   *
   * Defaults are emitted as `null` so they drop out of the query string, which
   * keeps a plain `/entries` link clean and a shared search minimal.
   *
   * @param patch - The parts of the state that changed.
   * @param replaceUrl - True while typing, so a search does not fill the history.
   */
  private navigate(
    patch: Partial<{ q: string; column: EntryColumn | ''; page: number; sort: EntrySort }>,
    replaceUrl = false
  ): void {
    const next = {
      q: this.term(),
      column: this.column(),
      page: this.page(),
      sort: this.sortBy(),
      ...patch,
    };

    const queryParams: Params = {
      q: next.q || null,
      column: next.column || null,
      page: next.page > 1 ? next.page : null,
      sort: next.sort !== DEFAULT_SORT ? next.sort : null,
    };

    void this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl });
  }
}
