/**
 * Utility functions for formatting dates pinned explicitly to the Asia/Manila timezone.
 */

/**
 * Formats a date to a clean, regional representation in the Asia/Manila timezone.
 * Example output: "July 4, 2026"
 */
export function formatManilaDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    ...options,
  }).format(d);
}

/**
 * Formats a date to a full date and time representation in the Asia/Manila timezone.
 * Example output: "July 4, 2026 • 3:50 PM"
 */
export function formatManilaDateTime(date: Date | string): string {
  return formatManilaDate(date, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
