import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Entry } from '../model/entry';
import { BaseService } from './base.service';
import { ConfigService } from './config.service';

export interface SearchResult<T> {
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface SearchOptions {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'relevance' | 'alphabetical' | 'newest' | 'oldest' | 'popular';
  hungarian?: string;
  english?: string;
  fieldOfExpertise?: string;
  wordType?: string;
}

@Injectable({
  providedIn: 'root',
})
export class EntryService extends BaseService<Entry> {
  readonly searchResults$ = new BehaviorSubject<Entry[]>([]);
  readonly pagination$ = new BehaviorSubject<SearchResult<Entry>['pagination'] | null>(null);
  readonly searching$ = new BehaviorSubject<boolean>(false);

  constructor(http: HttpClient, config: ConfigService) {
    super(http, config);
    this.entity = 'entries';
  }

  search(options: SearchOptions = {}): Observable<SearchResult<Entry>> {
    this.searching$.next(true);
    this.error$.next(null);

    let params = new HttpParams();

    if (options.search) {
      params = params.set('search', options.search);
    }
    if (options.page) {
      params = params.set('page', options.page.toString());
    }
    if (options.limit) {
      params = params.set('limit', options.limit.toString());
    }
    if (options.sortBy) {
      params = params.set('sortBy', options.sortBy);
    }
    if (options.hungarian) {
      params = params.set('hungarian', options.hungarian);
    }
    if (options.english) {
      params = params.set('english', options.english);
    }
    if (options.fieldOfExpertise) {
      params = params.set('fieldOfExpertise', options.fieldOfExpertise);
    }
    if (options.wordType) {
      params = params.set('wordType', options.wordType);
    }

    return this.http.get<SearchResult<Entry>>(this.endpoint, { params }).pipe(
      tap(response => {
        this.searchResults$.next(response.data);
        this.pagination$.next(response.pagination);
        this.searching$.next(false);
      }),
      catchError(error => {
        this.searching$.next(false);
        this.error$.next(error.message || 'Search failed');
        return throwError(() => error);
      })
    );
  }

  clearSearch(): void {
    this.searchResults$.next([]);
    this.pagination$.next(null);
  }
}
