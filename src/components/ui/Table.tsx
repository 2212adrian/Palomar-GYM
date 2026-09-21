//src/components/ui/Table.tsx
import React, { useState, useMemo, useEffect } from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import {
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from 'lucide-react';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  sortable?: boolean;
  sortValue?: (item: T) => any;
  render?: (item: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchKeys?: (keyof T | string)[];
  searchPlaceholder?: string;
  defaultSortKey?: string;
  defaultSortDirection?: 'asc' | 'desc';
  itemsPerPage?: number;
  loading?: boolean;
  loadingLabel?: string;
  getRowClassName?: (item: T) => string;
  onRowClick?: (item: T) => void;
}

export function Table<T>({
  data,
  columns,
  searchKeys = [],
  searchPlaceholder = 'Search records...',
  defaultSortKey = '',
  defaultSortDirection = 'asc',
  itemsPerPage: propItemsPerPage,
  loading = false,
  getRowClassName,
  onRowClick,
}: TableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    defaultSortDirection
  );
  const [currentPage, setCurrentPage] = useState(1);

  const getPaginationItems = (currentPage: number, totalPages: number) => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    // If near the start: 1, 2, 3, 4, 5, "...", totalPages
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }

    // If near the end: 1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages
    if (currentPage >= totalPages - 3) {
      return [
        1,
        '...',
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    }

    // In the middle: 1, "...", current - 1, current, current + 1, "...", totalPages
    return [
      1,
      '...',
      currentPage - 1,
      currentPage,
      currentPage + 1,
      '...',
      totalPages,
    ];
  };

  const [viewportItemsPerPage, setViewportItemsPerPage] = useState(() => {
    if (typeof window === 'undefined') return 25;
    const width = window.innerWidth;
    if (width < 768) return 10;
    if (width < 1024) return 15;
    return 25;
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setViewportItemsPerPage(10);
      } else if (width < 1024) {
        setViewportItemsPerPage(15);
      } else {
        setViewportItemsPerPage(25);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const itemsPerPage =
    propItemsPerPage !== undefined ? propItemsPerPage : viewportItemsPerPage;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortKey, sortDirection, itemsPerPage]);

  const filteredData = useMemo(() => {
    if (!searchQuery || searchKeys.length === 0) return data;
    const lowerQuery = searchQuery.toLowerCase();

    return data.filter((item: any) => {
      return searchKeys.some((key) => {
        const val = item[key];
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(lowerQuery);
      });
    });
  }, [data, searchQuery, searchKeys]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const colDef = columns.find((col) => col.key === sortKey);
    const dirMultiplier = sortDirection === 'asc' ? 1 : -1;

    return [...filteredData].sort((a: any, b: any) => {
      let valA = colDef?.sortValue ? colDef.sortValue(a) : a[sortKey];
      let valB = colDef?.sortValue ? colDef.sortValue(b) : b[sortKey];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * dirMultiplier;
      }

      if (valA < valB) return -1 * dirMultiplier;
      if (valA > valB) return 1 * dirMultiplier;
      return 0;
    });
  }, [filteredData, sortKey, sortDirection, columns]);

  const totalItems = sortedData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedData = useMemo(() => {
    const startIndex = (clampedPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, clampedPage, itemsPerPage]);

  const startIndex = (clampedPage - 1) * itemsPerPage;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  return (
    <div className="space-y-4">
      {searchKeys.length > 0 && (
        <div className="relative max-w-sm">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500 dark:text-slate-400">
            <Search className="w-4 h-4" aria-hidden="true" />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 dark:border-white/10 rounded-xl text-xs bg-slate-100 dark:bg-[#13161a] text-slate-900 dark:text-slate-100 outline-none focus:ring-1 focus:ring-slate-950 dark:focus:ring-[#bf0202] transition-all"
          />
        </div>
      )}

      <div className="border border-slate-200 dark:border-white/5 rounded-xl overflow-x-auto bg-slate-50/50 dark:bg-neutral-900/30">
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <thead className="bg-slate-100 dark:bg-[#13161a] border-b border-slate-200 dark:border-white/5">
            <tr>
              {columns.map((col) => {
                const isSortedColumn = sortKey === col.key;

                // Set native ARIA sort values [ascending | descending | none]
                const ariaSort = col.sortable
                  ? isSortedColumn
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined;

                return (
                  <th
                    key={col.key}
                    aria-sort={ariaSort}
                    className={`py-2 px-4 text-xs font-heading tracking-wider uppercase text-slate-600 dark:text-slate-400 select-none whitespace-nowrap ${col.headerClassName || ''}`}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 dark:hover:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 dark:focus-visible:ring-[#bf0202] rounded px-1 -mx-1 py-1 transition-colors w-full text-left"
                      >
                        <span>{col.header}</span>
                        <span className="text-slate-500 dark:text-slate-400">
                          {isSortedColumn ? (
                            sortDirection === 'asc' ? (
                              <ChevronUp
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                            ) : (
                              <ChevronDown
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                            )
                          ) : (
                            <ArrowUpDown
                              className="w-3 h-3 opacity-60"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1">
                        <span>{col.header}</span>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/5">
            {loading ? (
              Array.from({ length: 5 }).map((_, rIdx) => (
                <tr
                  key={`skeleton-row-${rIdx}`}
                  className="border-b border-slate-200 dark:border-white/5"
                >
                  {columns.map((col, cIdx) => (
                    <td
                      key={`skeleton-cell-${cIdx}`}
                      className="py-2.5 px-4 align-middle"
                    >
                      <Skeleton
                        height={col.key === 'barcode_id' ? 32 : 18}
                        width={col.key === 'select' ? 18 : '75%'}
                        baseColor={isDark ? '#1e232d' : '#e2e8f0'}
                        highlightColor={isDark ? '#2d333f' : '#f1f5f9'}
                        borderRadius="6px"
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-8 text-center text-xs text-slate-400"
                >
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedData.map((item, rowIdx) => {
                const rowStyleClass = getRowClassName
                  ? getRowClassName(item)
                  : '';
                const isClickableRow = !!onRowClick;

                // Handle keyboard enter/space triggered actions on the row
                const handleRowKeyDown = (
                  e: React.KeyboardEvent<HTMLTableRowElement>
                ) => {
                  if (isClickableRow && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick(item);
                  }
                };

                return (
                  <tr
                    key={rowIdx}
                    onClick={() => onRowClick?.(item)}
                    onKeyDown={handleRowKeyDown}
                    tabIndex={isClickableRow ? 0 : undefined}
                    role={isClickableRow ? 'button' : undefined}
                    className={`group/row hover:bg-slate-100/50 dark:hover:bg-neutral-900/10 focus-visible:outline-none focus-visible:bg-slate-100/50 dark:focus-visible:bg-neutral-900/10 transition-colors duration-150 ${
                      isClickableRow ? 'cursor-pointer' : ''
                    } ${rowStyleClass}`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`py-2.5 px-4 align-middle text-slate-800 dark:text-slate-200 whitespace-nowrap ${col.cellClassName || ''}`}
                      >
                        {col.render ? col.render(item) : (item as any)[col.key]}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && totalItems > 0 && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-1 py-2 text-xs font-body">
          {/* Enhanced slate contrast color for body text */}
          <span className="text-slate-600 dark:text-slate-300">
            Showing{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              {startIndex + 1}
            </span>{' '}
            to{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              {Math.min(startIndex + itemsPerPage, totalItems)}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              {totalItems}
            </span>{' '}
            entries
          </span>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={clampedPage === 1}
              title="Previous page"
              aria-label="Previous page"
              className="p-1.5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            {getPaginationItems(clampedPage, totalPages).map((item, idx) => {
              if (item === '...') {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="px-2 py-1 text-xs text-slate-400 select-none font-mono"
                  >
                    …
                  </span>
                );
              }

              const page = Number(item);
              const isSelected = clampedPage === page;

              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  title={`Go to page ${page}`}
                  aria-label={`Go to page ${page}`}
                  className={`min-w-8 h-8 px-2.5 rounded-lg font-mono text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white shadow-xs'
                      : 'border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800'
                  }`}
                >
                  {page}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() =>
                setCurrentPage((prev) => Math.min(prev + 1, totalPages))
              }
              disabled={clampedPage === totalPages}
              title="Next page"
              aria-label="Next page"
              className="p-1.5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
