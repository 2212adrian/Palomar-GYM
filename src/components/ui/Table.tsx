import React, { useState, useMemo, useEffect } from 'react';
import { 
  ChevronUp, 
  ChevronDown, 
  ArrowUpDown, 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Loader2 
} from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  sortValue?: (item: T) => any; // Custom value resolver for complex fields
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
}

export function Table<T>({
  data,
  columns,
  searchKeys = [],
  searchPlaceholder = "Search records...",
  defaultSortKey = '',
  defaultSortDirection = 'asc',
  itemsPerPage = 10,
  loading = false,
  loadingLabel = "Loading data..."
}: TableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string>(defaultSortKey);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);
  const [currentPage, setCurrentPage] = useState(1);

  // Reset to first page when filtering or sorting parameters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortKey, sortDirection]);

  // 1. Filter Data based on Search Keys
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

  // 2. Sort Filtered Data
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    const colDef = columns.find(col => col.key === sortKey);
    const dirMultiplier = sortDirection === 'asc' ? 1 : -1;

    return [...filteredData].sort((a: any, b: any) => {
      let valA = colDef?.sortValue ? colDef.sortValue(a) : a[sortKey];
      let valB = colDef?.sortValue ? colDef.sortValue(b) : b[sortKey];

      // Handle null/undefined values
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

  // 3. Paginate Sorted & Filtered Data
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
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Input Bar (Visible only if searchKeys are provided) */}
      {searchKeys.length > 0 && (
        <div className="relative max-w-sm">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-slate-500">
            <Search className="w-4 h-4" />
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

      {/* Styled Responsive Table Wrapper */}
      <div className="border border-slate-200 dark:border-white/5 rounded-xl overflow-x-auto bg-slate-50/50 dark:bg-neutral-900/30">
        <table className="w-full min-w-max border-collapse text-left text-sm">  
          <thead className="bg-slate-100 dark:bg-[#13161a] border-b border-slate-200 dark:border-white/5">
            <tr>
              {columns.map((col) => (
                <th
  key={col.key}
  onClick={() => col.sortable && handleSort(col.key)}
  className={`p-4 text-xs font-heading tracking-wider uppercase text-slate-600 dark:text-slate-400 select-none whitespace-nowrap ${
    col.sortable ? 'cursor-pointer hover:bg-slate-200/50 dark:hover:bg-neutral-800/30 transition-colors' : ''
  } ${col.headerClassName || ''}`}
>
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className="text-slate-400 dark:text-slate-500">
                        {sortKey === col.key ? (
                          sortDirection === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-60" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-white/5">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-xs text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  {loadingLabel}
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center text-xs text-slate-400">
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedData.map((item, rowIdx) => (
                <tr 
                  key={rowIdx} 
                  className="hover:bg-slate-100/50 dark:hover:bg-neutral-900/10 transition-colors"
                >
                  {columns.map((col) => (
                    <td 
  key={col.key} 
  className={`p-4 align-middle text-slate-800 dark:text-slate-200 whitespace-nowrap ${col.cellClassName || ''}`}
>
                      {col.render ? col.render(item) : (item as any)[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls Footer */}
      {!loading && totalItems > 0 && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4 px-1 py-2 text-xs font-body">
          <span className="text-slate-500 dark:text-slate-400">
            Showing <span className="font-semibold text-slate-900 dark:text-white">{startIndex + 1}</span> to{' '}
            <span className="font-semibold text-slate-900 dark:text-white">{Math.min(startIndex + itemsPerPage, totalItems)}</span> of{' '}
            <span className="font-semibold text-slate-900 dark:text-white">{totalItems}</span> entries
          </span>

          <div className="flex items-center gap-1.5">
            {/* Added accessible dynamic labels and system attributes [14] */}
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={clampedPage === 1}
              title="Previous page"
              aria-label="Previous page"
              className="p-1.5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer inline-flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                type="button"
                onClick={() => setCurrentPage(page)}
                title={`Go to page ${page}`}
                aria-label={`Go to page ${page}`}
                className={`px-3 py-1.5 rounded-lg font-mono font-semibold transition-all cursor-pointer ${
                  clampedPage === page
                    ? 'bg-[#1b365d] dark:bg-[#bf0202] text-white'
                    : 'border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-neutral-800'
                }`}
              >
                {page}
              </button>
            ))}

            {/* Added accessible dynamic labels and system attributes [14] */}
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
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