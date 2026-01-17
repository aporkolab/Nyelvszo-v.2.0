import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { ConfigService } from './config.service';

export interface BaseEntity {
  _id: string;
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    message?: string;
    timestamp?: string;
  };
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface QueryOptions {
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  filters?: Record<string, string | number | boolean>;
}

@Injectable({
  providedIn: 'root',
})
export class BaseService<T extends BaseEntity> {
  protected readonly apiUrl: string = environment.apiUrl;
  protected entity: string = '';

  readonly list$ = new BehaviorSubject<T[]>([]);
  readonly loading$ = new BehaviorSubject<boolean>(false);
  readonly error$ = new BehaviorSubject<string | null>(null);

  constructor(
    protected readonly http: HttpClient,
    protected readonly config: ConfigService
  ) {}

  protected get endpoint(): string {
    return `${this.apiUrl}/${this.entity}`;
  }

  getAll(options?: QueryOptions): Observable<T[]> {
    this.loading$.next(true);
    this.error$.next(null);

    let params = new HttpParams();

    if (options?.page) {
      params = params.set('page', options.page.toString());
    }
    if (options?.pageSize) {
      params = params.set('limit', options.pageSize.toString());
    }
    if (options?.sortField) {
      params = params.set('sortBy', options.sortField);
    }
    if (options?.sortOrder) {
      params = params.set('sortOrder', options.sortOrder);
    }
    if (options?.search) {
      params = params.set('search', options.search);
    }
    if (options?.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        params = params.set(key, value.toString());
      });
    }

    return this.http.get<ApiResponse<T[]> | T[]>(this.endpoint, { params }).pipe(
      map(response => {
        // Handle both {data: [...]} and [...] response formats
        if (response && typeof response === 'object' && 'data' in response) {
          return (response as ApiResponse<T[]>).data;
        }
        return response as T[];
      }),
      tap(data => {
        this.list$.next(data);
        this.loading$.next(false);
      }),
      catchError(error => {
        this.loading$.next(false);
        this.error$.next(error.message || 'An error occurred');
        return throwError(() => error);
      })
    );
  }

  getOne(id: string): Observable<T> {
    this.loading$.next(true);
    this.error$.next(null);

    return this.http.get<ApiResponse<T> | T>(`${this.endpoint}/${id}`).pipe(
      map(response => {
        // Handle both {data: entity} and entity response formats
        if (response && typeof response === 'object' && 'data' in response) {
          return (response as ApiResponse<T>).data;
        }
        return response as T;
      }),
      tap(() => this.loading$.next(false)),
      catchError(error => {
        this.loading$.next(false);
        this.error$.next(error.message || 'An error occurred');
        return throwError(() => error);
      })
    );
  }

  create(entity: Omit<T, '_id'> | T): Observable<T> {
    this.loading$.next(true);
    this.error$.next(null);

    const payload = { ...entity, _id: undefined };

    return this.http.post<ApiResponse<T> | T>(this.endpoint, payload).pipe(
      map(response => {
        if (response && typeof response === 'object' && 'data' in response) {
          return (response as ApiResponse<T>).data;
        }
        return response as T;
      }),
      tap(created => {
        const currentList = this.list$.value;
        this.list$.next([...currentList, created]);
        this.loading$.next(false);
      }),
      catchError(error => {
        this.loading$.next(false);
        this.error$.next(error.message || 'An error occurred');
        return throwError(() => error);
      })
    );
  }

  update(entity: T): Observable<T> {
    this.loading$.next(true);
    this.error$.next(null);

    return this.http.patch<ApiResponse<T> | T>(`${this.endpoint}/${entity._id}`, entity).pipe(
      map(response => {
        if (response && typeof response === 'object' && 'data' in response) {
          return (response as ApiResponse<T>).data;
        }
        return response as T;
      }),
      tap(updated => {
        const currentList = this.list$.value;
        const index = currentList.findIndex(item => item._id === entity._id);
        if (index !== -1) {
          currentList[index] = updated;
          this.list$.next([...currentList]);
        }
        this.loading$.next(false);
      }),
      catchError(error => {
        this.loading$.next(false);
        this.error$.next(error.message || 'An error occurred');
        return throwError(() => error);
      })
    );
  }

  delete(entity: T): Observable<T> {
    this.loading$.next(true);
    this.error$.next(null);

    return this.http.delete<T>(`${this.endpoint}/${entity._id}`).pipe(
      tap(() => {
        const currentList = this.list$.value;
        this.list$.next(currentList.filter(item => item._id !== entity._id));
        this.loading$.next(false);
      }),
      catchError(error => {
        this.loading$.next(false);
        this.error$.next(error.message || 'An error occurred');
        return throwError(() => error);
      })
    );
  }

  refresh(): void {
    this.getAll().subscribe();
  }

  clearError(): void {
    this.error$.next(null);
  }
}
