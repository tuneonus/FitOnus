export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export interface PageRequest {
  page: number;
  limit: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const offsetOf = (request: PageRequest): number => (request.page - 1) * request.limit;

export const toPaginationMeta = (request: PageRequest, total: number): PaginationMeta => ({
  page: request.page,
  limit: request.limit,
  total,
  totalPages: Math.ceil(total / request.limit),
});
