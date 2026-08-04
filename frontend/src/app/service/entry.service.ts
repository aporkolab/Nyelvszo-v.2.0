import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from 'src/environments/environment';
import { Entry, IEntry } from '../model/entry';
import { ItemResponse, ListResponse } from './api.types';

/** Fields the dictionary can be searched within. */
export type EntryColumn = 'hungarian' | 'english' | 'fieldOfExpertise' | 'wordType';

export type EntrySort = 'relevance' | 'alphabetical' | 'newest' | 'oldest' | 'popular';

export interface EntrySearchOptions {
  /** Free-text term, searched across both language columns. */
  search?: string;
  /** Restrict the search to a single column instead. */
  column?: EntryColumn | '';
  page?: number;
  limit?: number;
  sortBy?: EntrySort;
}

@Injectable({ providedIn: 'root' })
export class EntryService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiUrl}/entries`;

  /**
   * Search the dictionary.
   *
   * A column-scoped search is sent as that column's own query parameter, which
   * is what the API expects; sending it as `search` would silently widen the
   * query to both language fields.
   *
   * @param options - Search term, scope, paging and sort.
   * @returns The page of results with its pagination metadata.
   */
  search(options: EntrySearchOptions = {}): Observable<ListResponse<Entry>> {
    let params = new HttpParams();

    const term = options.search?.trim();
    if (term) {
      params = options.column ? params.set(options.column, term) : params.set('search', term);
    }

    if (options.page) params = params.set('page', options.page);
    if (options.limit) params = params.set('limit', options.limit);
    if (options.sortBy) params = params.set('sortBy', options.sortBy);

    return this.http
      .get<ListResponse<IEntry>>(this.endpoint, { params })
      .pipe(map(response => ({ ...response, data: response.data.map(item => new Entry(item)) })));
  }

  /**
   * Fetch a single entry.
   *
   * @param id - Entry identifier.
   * @returns The entry.
   */
  getOne(id: string): Observable<Entry> {
    return this.http
      .get<ItemResponse<IEntry>>(`${this.endpoint}/${id}`)
      .pipe(map(response => new Entry(response.data)));
  }

  /**
   * Create an entry.
   *
   * @param entry - Entry to create.
   * @returns The created entry.
   */
  create(entry: Entry): Observable<Entry> {
    return this.http
      .post<ItemResponse<IEntry>>(this.endpoint, this.writablePayload(entry))
      .pipe(map(response => new Entry(response.data)));
  }

  /**
   * Update an entry.
   *
   * @param entry - Entry carrying the identifier and the new values.
   * @returns The updated entry.
   */
  update(entry: Entry): Observable<Entry> {
    return this.http
      .patch<ItemResponse<IEntry>>(`${this.endpoint}/${entry._id}`, this.writablePayload(entry))
      .pipe(map(response => new Entry(response.data)));
  }

  /**
   * Soft-delete an entry.
   *
   * @param id - Entry identifier.
   */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.endpoint}/${id}`);
  }

  /**
   * Project an entry down to the fields the API accepts.
   *
   * Sending the whole object would include server-owned fields (`views`,
   * `createdBy`, timestamps) that the Joi schema rejects outright.
   */
  private writablePayload(entry: Entry): Record<string, string> {
    return {
      hungarian: entry.hungarian.trim(),
      english: entry.english.trim(),
      fieldOfExpertise: entry.fieldOfExpertise.trim(),
      wordType: entry.wordType?.trim() ?? '',
    };
  }
}
