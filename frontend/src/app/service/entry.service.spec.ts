import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from 'src/environments/environment';
import { Entry } from '../model/entry';
import { EntryService } from './entry.service';

const ENDPOINT = `${environment.apiUrl}/entries`;

const PAGE = {
  data: [
    {
      _id: 'e1',
      hungarian: 'nyelvészet',
      english: 'linguistics',
      fieldOfExpertise: 'általános',
      wordType: 'főnév',
      views: 12,
    },
  ],
  pagination: {
    currentPage: 2,
    totalPages: 4,
    totalItems: 70,
    itemsPerPage: 20,
    hasNextPage: true,
    hasPrevPage: true,
  },
};

describe('EntryService', () => {
  let service: EntryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(EntryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('search', () => {
    it('sends a plain term as `search`', () => {
      service.search({ search: 'nyelv' }).subscribe();

      const request = http.expectOne(candidate => candidate.url === ENDPOINT);
      expect(request.request.method).toBe('GET');
      expect(request.request.params.get('search')).toBe('nyelv');
      request.flush(PAGE);
    });

    it('sends a column-scoped term as THAT column, never as `search`', () => {
      service.search({ search: 'nyelv', column: 'hungarian' }).subscribe();

      const request = http.expectOne(candidate => candidate.url === ENDPOINT);
      expect(request.request.params.get('hungarian')).toBe('nyelv');
      // Sending it as `search` as well would silently widen the query.
      expect(request.request.params.get('search')).toBeNull();
      request.flush(PAGE);
    });

    it('scopes to any of the four searchable columns', () => {
      const columns = ['hungarian', 'english', 'fieldOfExpertise', 'wordType'] as const;

      for (const column of columns) {
        service.search({ search: 'term', column }).subscribe();

        const request = http.expectOne(candidate => candidate.url === ENDPOINT);
        expect(request.request.params.get(column)).toBe('term');
        expect(request.request.params.get('search')).toBeNull();
        request.flush(PAGE);
      }
    });

    it('treats an empty column as an unscoped search', () => {
      service.search({ search: 'nyelv', column: '' }).subscribe();

      const request = http.expectOne(candidate => candidate.url === ENDPOINT);
      expect(request.request.params.get('search')).toBe('nyelv');
      request.flush(PAGE);
    });

    it('trims the term and drops one that is only whitespace', () => {
      service.search({ search: '  nyelv  ' }).subscribe();
      http.expectOne(candidate => candidate.url === ENDPOINT).flush(PAGE);

      service.search({ search: '   ' }).subscribe();
      const blank = http.expectOne(candidate => candidate.url === ENDPOINT);
      expect(blank.request.params.keys().length).toBe(0);
      blank.flush(PAGE);
    });

    it('forwards page, limit and sortBy', () => {
      service.search({ page: 2, limit: 20, sortBy: 'popular' }).subscribe();

      const request = http.expectOne(candidate => candidate.url === ENDPOINT);
      expect(request.request.params.get('page')).toBe('2');
      expect(request.request.params.get('limit')).toBe('20');
      expect(request.request.params.get('sortBy')).toBe('popular');
      request.flush(PAGE);
    });

    it('sends no parameters at all for an empty search', () => {
      service.search().subscribe();

      const request = http.expectOne(candidate => candidate.url === ENDPOINT);
      expect(request.request.params.keys().length).toBe(0);
      request.flush(PAGE);
    });

    it('maps the payload into Entry instances and keeps the pagination', () => {
      let result: { data: Entry[]; pagination: { totalItems: number } } | undefined;
      service.search().subscribe(response => (result = response));

      http.expectOne(candidate => candidate.url === ENDPOINT).flush(PAGE);

      expect(result?.data[0]).toBeInstanceOf(Entry);
      expect(result?.data[0].hungarian).toBe('nyelvészet');
      expect(result?.pagination.totalItems).toBe(70);
    });
  });

  it('fetches a single entry as an Entry instance', () => {
    let result: Entry | undefined;
    service.getOne('e1').subscribe(entry => (result = entry));

    const request = http.expectOne(`${ENDPOINT}/e1`);
    expect(request.request.method).toBe('GET');
    request.flush({ data: PAGE.data[0] });

    expect(result).toBeInstanceOf(Entry);
    expect(result?.english).toBe('linguistics');
  });

  describe('writing', () => {
    function dirtyEntry(): Entry {
      return new Entry({
        _id: 'e1',
        hungarian: '  nyelvészet  ',
        english: '  linguistics ',
        fieldOfExpertise: ' általános ',
        wordType: ' főnév ',
        views: 12,
        createdAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'someone-else',
      });
    }

    it('creates with ONLY the four writable fields', () => {
      service.create(dirtyEntry()).subscribe();

      const request = http.expectOne(ENDPOINT);
      expect(request.request.method).toBe('POST');
      expect(Object.keys(request.request.body as object).sort()).toEqual([
        'english',
        'fieldOfExpertise',
        'hungarian',
        'wordType',
      ]);
      expect(request.request.body).toEqual({
        hungarian: 'nyelvészet',
        english: 'linguistics',
        fieldOfExpertise: 'általános',
        wordType: 'főnév',
      });
      request.flush({ data: PAGE.data[0] });
    });

    it('updates with PATCH against the entry URL and the same whitelist', () => {
      service.update(dirtyEntry()).subscribe();

      const request = http.expectOne(`${ENDPOINT}/e1`);
      expect(request.request.method).toBe('PATCH');

      const body = request.request.body as Record<string, unknown>;
      expect('_id' in body).toBeFalse();
      expect('views' in body).toBeFalse();
      expect('createdAt' in body).toBeFalse();
      expect('createdBy' in body).toBeFalse();
      expect('isActive' in body).toBeFalse();

      request.flush({ data: PAGE.data[0] });
    });

    it('sends an empty word type rather than undefined when it is missing', () => {
      const entry = new Entry({ hungarian: 'a', english: 'b', fieldOfExpertise: 'c' });
      (entry as unknown as { wordType: string | undefined }).wordType = undefined;

      service.create(entry).subscribe();

      const request = http.expectOne(ENDPOINT);
      expect((request.request.body as { wordType: string }).wordType).toBe('');
      request.flush({ data: PAGE.data[0] });
    });

    it('deletes with DELETE', () => {
      service.delete('e1').subscribe();

      const request = http.expectOne(`${ENDPOINT}/e1`);
      expect(request.request.method).toBe('DELETE');
      request.flush(null);
    });
  });
});
