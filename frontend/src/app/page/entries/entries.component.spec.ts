import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { Entry } from 'src/app/model/entry';
import { Pagination } from 'src/app/service/api.types';
import { EntryService } from 'src/app/service/entry.service';
import { EntriesComponent } from './entries.component';

function pagination(overrides: Partial<Pagination> = {}): Pagination {
  return {
    currentPage: 1,
    totalPages: 1,
    totalItems: 1,
    itemsPerPage: 20,
    hasNextPage: false,
    hasPrevPage: false,
    ...overrides,
  };
}

function entry(hungarian: string): Entry {
  return new Entry({
    _id: hungarian,
    hungarian,
    english: `${hungarian}-en`,
    fieldOfExpertise: 'fonológia',
    wordType: 'főnév',
  });
}

describe('EntriesComponent', () => {
  let fixture: ComponentFixture<EntriesComponent>;
  let component: EntriesComponent;
  let queryParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let search: jasmine.Spy;

  async function setup(params: Record<string, string> = {}): Promise<void> {
    TestBed.resetTestingModule();

    queryParams = new BehaviorSubject(convertToParamMap(params));
    search = jasmine
      .createSpy('search')
      .and.returnValue(of({ data: [entry('morféma')], pagination: pagination() }));

    await TestBed.configureTestingModule({
      imports: [
        EntriesComponent,
        TranslateModule.forRoot(),
        NoopAnimationsModule,
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams.asObservable() } },
        { provide: EntryService, useValue: { search, delete: () => of(undefined) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EntriesComponent);
    component = fixture.componentInstance;
    await flush();
  }

  /** Run the effect that feeds the search stream, then settle its result. */
  async function flush(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('creates', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('stays idle and issues no request below the minimum term length', async () => {
    await setup({ q: 'm' });

    expect(search).not.toHaveBeenCalled();
    expect(component.status()).toBe('idle');
  });

  it('restores the whole search from the query string', async () => {
    await setup({ q: 'morféma', column: 'english', page: '3', sort: 'newest' });

    expect(search).toHaveBeenCalledWith({
      search: 'morféma',
      column: 'english',
      page: 3,
      limit: 20,
      sortBy: 'newest',
    });
    expect(component.searchControl.value).toBe('morféma');
    expect(component.columnControl.value).toBe('english');
    expect(component.sortControl.value).toBe('newest');
  });

  it('falls back to the defaults for an unusable column, page or sort', async () => {
    await setup({ q: 'morféma', column: 'nonsense', page: '-4', sort: 'sideways' });

    expect(search).toHaveBeenCalledWith({
      search: 'morféma',
      column: '',
      page: 1,
      limit: 20,
      sortBy: 'alphabetical',
    });
  });

  it('exposes the results and their pagination once the request settles', async () => {
    await setup({ q: 'morféma' });

    expect(component.status()).toBe('ready');
    expect(component.results().length).toBe(1);
    expect(component.total()).toBe(1);
    expect(component.isEmpty()).toBeFalse();
  });

  it('reports an empty result set rather than an error', async () => {
    await setup();
    search.and.returnValue(of({ data: [], pagination: pagination({ totalItems: 0 }) }));
    queryParams.next(convertToParamMap({ q: 'morféma' }));
    await flush();

    expect(component.status()).toBe('ready');
    expect(component.isEmpty()).toBeTrue();
  });

  it('surfaces a failed request as an error state instead of throwing', async () => {
    await setup();
    search.and.returnValue(throwError(() => new Error('offline')));
    queryParams.next(convertToParamMap({ q: 'morféma' }));
    await flush();

    expect(component.status()).toBe('error');
    expect(component.results()).toEqual([]);
  });

  it('windows the page list with ellipses around the current page', async () => {
    await setup();
    search.and.returnValue(
      of({
        data: [entry('morféma')],
        pagination: pagination({ currentPage: 10, totalPages: 20, totalItems: 400 }),
      })
    );
    queryParams.next(convertToParamMap({ q: 'morféma', page: '10' }));
    await flush();

    expect(component.pageList().map(item => item.page)).toEqual([1, 0, 8, 9, 10, 11, 12, 0, 20]);
  });

  it('marks the headword column as sorted only while the alphabetical order is active', async () => {
    await setup({ q: 'morféma' });
    expect(component.hungarianSort()).toBe('ascending');

    queryParams.next(convertToParamMap({ q: 'morféma', sort: 'popular' }));
    await flush();
    expect(component.hungarianSort()).toBe('none');
  });
});
