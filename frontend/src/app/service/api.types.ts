/**
 * Response envelopes returned by the NyelvSzó API.
 *
 * Every endpoint wraps its payload in `data`; list endpoints add `pagination`.
 * Declaring the shapes once here is what keeps the services from each
 * re-inventing a slightly different guess at the contract.
 */

export interface Pagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ItemResponse<T> {
  data: T;
  meta?: { message?: string };
}

export interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
  meta?: Record<string, unknown>;
}

/** Error body produced by the API's global error handler. */
export interface ApiError {
  error: string;
  statusCode: number;
  type?: string;
  timestamp?: string;
  path?: string;
  details?: { field: string; message: string }[];
}

export const EMPTY_PAGINATION: Pagination = {
  currentPage: 1,
  totalPages: 1,
  totalItems: 0,
  itemsPerPage: 20,
  hasNextPage: false,
  hasPrevPage: false,
};
