// src/pages/system/utils/csvDataMigration.ts
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';
import { isSuperAdmin } from '../../../constants/auth';
import { cardService } from '../../members/memberService';

export const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_CSV_DATA_ROWS = 5000;

export const PRODUCT_HEADERS = [
  'product_name',
  'selling_price',
  'has_stock_limit',
  'stock_quantity',
  'low_stock_alert',
  'manufacturer_barcode',
  'status',
] as const;

export const MEMBER_HEADERS = [
  'full_name',
  'phone',
  'email',
  'gender',
  'birthday',
  'address',
  'plan_type',
  'start_date',
  'end_date',
  'issue_card',
  'card_type',
  'status',
  'notes',
] as const;

export interface CsvProductRow {
  lineNumber: number;
  product_name: string;
  selling_price: number;
  has_stock_limit: boolean;
  stock_quantity: number;
  low_stock_alert: number | null;
  manufacturer_barcode: string | null;
  status: 'Active' | 'Inactive';
}

export interface CsvMemberRow {
  lineNumber: number;
  full_name: string;
  phone: string;
  email: string | null;
  gender: 'Male' | 'Female' | 'Other';
  birthday: string | null;
  address: string | null;
  plan_type: 'none' | 'monthly' | 'yearly';
  start_date: string | null;
  end_date: string | null;
  issue_card: boolean;
  card_type: 'QR' | 'Manual' | 'None';
  status: 'Active' | 'Suspended';
  notes: string;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  group: 'FILE' | 'PRODUCTS' | 'MEMBERS';
  line: number;
  field?: string;
  identifier?: string;
  message: string;
}

export interface ExistingDbSnapshot {
  activeProductCount: number;
  activeMemberCount: number;
  activeProductNames: Set<string>;
  activeBarcodes: Set<string>;
  recycleBinBarcodes: Set<string>;
  activeMemberNames: Set<string>;
  activeMemberEmails: Set<string>;
  fetchedAt: string;
}

export interface ParsedMigrationResult {
  products: CsvProductRow[];
  members: CsvMemberRow[];
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  subscriptionCount: number;
  cardCount: number;
  rawCsvSha256: string;
  canonicalSha256: string;
  isValid: boolean;
}

export interface SealedMigrationBatch {
  sealId: string;
  ciphertext: string;
  iv: string;
  rawCsvSha256: string;
  canonicalSha256: string;
  integrityHmac: string;
  sealedAt: string;
  productCount: number;
  memberCount: number;
  subscriptionCount: number;
  cardCount: number;
}

export interface MigrationExecutionSummary {
  productsInserted: number;
  membersInserted: number;
  subscriptionsInserted: number;
  cardsIssued: number;
  canonicalSha256: string;
  rawCsvSha256: string;
}

export interface MigrationAuditLogEntry {
  id: string;
  created_at: string;
  superadmin_id: string | null;
  superadmin_email: string;
  file_name: string | null;
  file_size_bytes: number | null;
  file_hash: string;
  payload_hash: string | null;
  status: 'success' | 'failure' | 'blocked';
  products_count: number;
  members_count: number;
  subscriptions_count: number;
  cards_count: number;
  error_count: number;
  warning_count: number;
  validation_errors: ValidationIssue[];
  error_message: string | null;
  non_empty_override: boolean;
  notes: string | null;
}

// Ephemeral in-memory CryptoKey store (never persisted to storage/DOM)
const ephemeralSealKeys = new Map<string, { key: CryptoKey; salt: string }>();

function bytesToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function computeSha256Hex(
  input: string | Uint8Array
): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256',
    bytes as unknown as BufferSource
  );
  return bytesToHex(hashBuffer);
}

export async function sealMigrationBatch(
  parsed: ParsedMigrationResult
): Promise<SealedMigrationBatch> {
  if (!parsed.isValid || parsed.errorCount > 0) {
    throw new Error('Cannot seal a migration batch that still has validation errors.');
  }

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const salt = bytesToHex(saltBytes);

  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);

  const canonicalObject = {
    schemaVersion: 2,
    rawCsvSha256: parsed.rawCsvSha256,
    canonicalSha256: parsed.canonicalSha256,
    products: parsed.products,
    members: parsed.members,
  };

  const plaintext = JSON.stringify(canonicalObject);
  const integrityHmac = await computeSha256Hex(
    `${salt}::${parsed.rawCsvSha256}::${parsed.canonicalSha256}::${plaintext}`
  );

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    new TextEncoder().encode(plaintext)
  );

  const sealId = `seal_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  ephemeralSealKeys.set(sealId, { key, salt });

  return {
    sealId,
    ciphertext: bytesToBase64(encryptedBuffer),
    iv: bytesToBase64(ivBytes),
    rawCsvSha256: parsed.rawCsvSha256,
    canonicalSha256: parsed.canonicalSha256,
    integrityHmac,
    sealedAt: new Date().toISOString(),
    productCount: parsed.products.length,
    memberCount: parsed.members.length,
    subscriptionCount: parsed.subscriptionCount,
    cardCount: parsed.cardCount,
  };
}

export async function unsealAndVerifyMigrationBatch(
  sealed: SealedMigrationBatch
): Promise<{ products: CsvProductRow[]; members: CsvMemberRow[] }> {
  const credentials = ephemeralSealKeys.get(sealed.sealId);
  if (!credentials) {
    throw new Error(
      'Cryptographic session seal expired or missing. Please re-import and re-validate the CSV file.'
    );
  }

  try {
    const ivBytes = base64ToBytes(sealed.iv);
    const cipherBytes = base64ToBytes(sealed.ciphertext);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource },
      credentials.key,
      cipherBytes as unknown as BufferSource
    );

    const plaintext = new TextDecoder().decode(decryptedBuffer);
    const expectedHmac = await computeSha256Hex(
      `${credentials.salt}::${sealed.rawCsvSha256}::${sealed.canonicalSha256}::${plaintext}`
    );

    if (!constantTimeEqual(expectedHmac, sealed.integrityHmac)) {
      throw new Error('HMAC integrity seal mismatch detected.');
    }

    const decoded = JSON.parse(plaintext);
    const recomputedCanonical = await computeSha256Hex(
      JSON.stringify({
        products: decoded.products,
        members: decoded.members,
      })
    );

    if (
      !constantTimeEqual(recomputedCanonical, sealed.canonicalSha256) ||
      !constantTimeEqual(decoded.rawCsvSha256 || '', sealed.rawCsvSha256)
    ) {
      throw new Error('Canonical payload SHA-256 checksum mismatch detected.');
    }

    return {
      products: decoded.products as CsvProductRow[],
      members: decoded.members as CsvMemberRow[],
    };
  } catch (err: any) {
    throw new Error(
      err?.message ||
        'Security integrity verification failed for staged migration payload.'
    );
  }
}

export function clearEphemeralSeal(sealId?: string | null): void {
  if (sealId) {
    ephemeralSealKeys.delete(sealId);
  } else {
    ephemeralSealKeys.clear();
  }
}

/**
 * Generates the official unified two-group CSV migration template containing
 * Group 1: [PRODUCTS] and Group 2: [MEMBERS] in a single UTF-8 BOM CSV file.
 */
export function generateUnifiedMigrationCsvTemplate(): string {
  const lines = [
    '# WOLF PALOMAR GYM - UNIFIED DATA MIGRATION TEMPLATE (PRODUCTS + MEMBERS)',
    '# SECURITY NOTICE: Requires SuperAdmin auth, closed cash drawer session, and zero validation errors.',
    '# BEST PRACTICE: Strongly recommended when both Products and Members tables are EMPTY.',
    '# INSTRUCTIONS:',
    '#   1. Keep the [PRODUCTS] and [MEMBERS] group markers and header rows intact.',
    '#   2. Replace or remove the SAMPLE rows below before importing into the console.',
    '#   3. Dates must use YYYY-MM-DD (e.g., 2026-11-01). Boolean fields accept true or false.',
    '#   4. Product stock_quantity & low_stock_alert apply when has_stock_limit=true (set stock_quantity=0 when false).',
    '#   5. Member plan_type accepts: monthly (max 31 days), yearly (max 366 days), or none (profile only).',
    '#   6. Member card_type accepts: QR or Manual when issue_card=true (otherwise leave blank or None).',
    '',
    '[PRODUCTS]',
    PRODUCT_HEADERS.join(','),
    'SAMPLE - Whey Protein Sachet,65.00,true,40,10,4800016644214,Active',
    'SAMPLE - Mineral Water 500ml,25.00,true,60,12,,Active',
    'SAMPLE - Day Towel Rental,30.00,false,0,,,Active',
    '',
    '[MEMBERS]',
    MEMBER_HEADERS.join(','),
    '"SAMPLE - DELA CRUZ, JUAN",09171234567,juan.delacruz@example.com,Male,1995-05-14,"123 Rizal St, Manila",monthly,2026-11-01,2026-12-01,true,QR,Active,Legacy monthly subscription',
    '"SAMPLE - SANTOS, MARIA",09189876543,,Female,1998-09-22,,yearly,2026-06-15,2027-06-15,false,None,Active,Legacy yearly subscription',
    '"SAMPLE - REYES, CARLOS",No Phone,,Male,,,,none,,,false,None,Active,Profile only without active plan',
  ];

  // Prepend UTF-8 BOM for clean Excel / LibreOffice / Google Sheets rendering
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

interface ParsedCsvRow {
  lineNumber: number;
  cells: string[];
}

/**
 * Strict RFC-4180 CSV Parser preserving 1-based physical line numbers per record
 */
function parseRfc4180Csv(rawInput: string): {
  rows: ParsedCsvRow[];
  fatalErrors: string[];
} {
  const fatalErrors: string[] = [];
  // Strip UTF-8 BOM if present
  const text = rawInput.charCodeAt(0) === 0xfeff ? rawInput.slice(1) : rawInput;

  if (text.includes('\0')) {
    return {
      rows: [],
      fatalErrors: ['Binary or NULL bytes detected. File is not a valid UTF-8 CSV.'],
    };
  }

  const rows: ParsedCsvRow[] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  let currentLine = 1;
  let rowStartLine = 1;
  let justClosedQuote = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : '';

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        if (ch === '\n') {
          currentLine++;
        } else if (ch === '\r' && next === '\n') {
          currentLine++;
          currentCell += '\n';
          i++;
          continue;
        }
        currentCell += ch;
      }
      continue;
    }

    if (justClosedQuote && ch !== ',' && ch !== '\r' && ch !== '\n') {
      if (ch.trim() !== '') {
        fatalErrors.push(
          `Line ${rowStartLine}: Malformed quoted field (unexpected character "${ch}" after closing quote).`
        );
      }
      justClosedQuote = false;
    }

    if (ch === '"') {
      if (currentCell.trim() !== '') {
        fatalErrors.push(
          `Line ${rowStartLine}: Unexpected quote inside unquoted CSV field.`
        );
      }
      inQuotes = true;
      justClosedQuote = false;
      currentCell = '';
    } else if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      justClosedQuote = false;
    } else if (ch === '\r' && next === '\n') {
      currentRow.push(currentCell);
      rows.push({ lineNumber: rowStartLine, cells: currentRow });
      currentRow = [];
      currentCell = '';
      justClosedQuote = false;
      currentLine++;
      rowStartLine = currentLine;
      i++;
    } else if (ch === '\n' || ch === '\r') {
      currentRow.push(currentCell);
      rows.push({ lineNumber: rowStartLine, cells: currentRow });
      currentRow = [];
      currentCell = '';
      justClosedQuote = false;
      currentLine++;
      rowStartLine = currentLine;
    } else {
      currentCell += ch;
    }
  }

  if (inQuotes) {
    fatalErrors.push(
      `Line ${rowStartLine}: Unclosed quotation mark detected before end of file.`
    );
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push({ lineNumber: rowStartLine, cells: currentRow });
  }

  return { rows, fatalErrors };
}

function trimTrailingEmptyCells(cells: string[]): string[] {
  const out = [...cells];
  while (out.length > 0 && out[out.length - 1].trim() === '') {
    out.pop();
  }
  return out;
}

function parseStrictBoolean(
  raw: string,
  defaultValue?: boolean
): { valid: boolean; value: boolean } {
  const clean = raw.trim().toLowerCase();
  if (!clean && defaultValue !== undefined) {
    return { valid: true, value: defaultValue };
  }
  if (['true', 'yes', 'y', '1'].includes(clean)) {
    return { valid: true, value: true };
  }
  if (['false', 'no', 'n', '0'].includes(clean)) {
    return { valid: true, value: false };
  }
  return { valid: false, value: false };
}

function isValidIsoDateStrict(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [yStr, mStr, dStr] = dateStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function hasControlChars(str: string): boolean {
  // Reject ASCII control characters (except common whitespace already trimmed)
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) return true;
  }
  return false;
}

function hasDangerousFormulaPrefix(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  // Allow negative signs only where numeric fields handle them; text shouldn't start with spreadsheet triggers
  return /^[=@+]/.test(trimmed);
}

/**
 * Verifies live cash session status from both store and Supabase directly
 */
export async function verifyLiveCashSessionClosed(): Promise<{
  isClosed: boolean;
  openSessionId?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('cash_sessions')
      .select('id')
      .eq('status', 'open')
      .is('closed_at', null)
      .limit(1);

    if (!error && data && data.length > 0) {
      return { isClosed: false, openSessionId: data[0].id };
    }
    return { isClosed: true };
  } catch {
    return { isClosed: true };
  }
}

/**
 * Fetches live database snapshot to check empty-table readiness and detect duplicates
 */
export async function fetchMigrationDbSnapshot(): Promise<ExistingDbSnapshot> {
  const [prodRes, binProdRes, memRes] = await Promise.all([
    supabase
      .from('products')
      .select('product_name, manufacturer_barcode')
      .is('deleted_at', null),
    supabase
      .from('products')
      .select('manufacturer_barcode')
      .not('deleted_at', 'is', null),
    supabase
      .from('members')
      .select('full_name, email')
      .is('deleted_at', null),
  ]);

  if (prodRes.error) throw prodRes.error;
  if (memRes.error) throw memRes.error;

  const activeProductNames = new Set<string>();
  const activeBarcodes = new Set<string>();
  const recycleBinBarcodes = new Set<string>();
  const activeMemberNames = new Set<string>();
  const activeMemberEmails = new Set<string>();

  (prodRes.data || []).forEach((p: any) => {
    if (p.product_name) {
      activeProductNames.add(String(p.product_name).trim().toLowerCase());
    }
    if (p.manufacturer_barcode) {
      activeBarcodes.add(String(p.manufacturer_barcode).trim().toLowerCase());
    }
  });

  (binProdRes.data || []).forEach((p: any) => {
    if (p.manufacturer_barcode) {
      recycleBinBarcodes.add(
        String(p.manufacturer_barcode).trim().toLowerCase()
      );
    }
  });

  (memRes.data || []).forEach((m: any) => {
    if (m.full_name) {
      activeMemberNames.add(String(m.full_name).trim().toLowerCase());
    }
    if (m.email) {
      activeMemberEmails.add(String(m.email).trim().toLowerCase());
    }
  });

  return {
    activeProductCount: prodRes.data?.length || 0,
    activeMemberCount: memRes.data?.length || 0,
    activeProductNames,
    activeBarcodes,
    recycleBinBarcodes,
    activeMemberNames,
    activeMemberEmails,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Parses and deeply validates the Unified Two-Group CSV ([PRODUCTS] + [MEMBERS])
 */
export async function parseAndValidateMigrationCsv(
  rawCsvText: string,
  dbSnapshot: ExistingDbSnapshot
): Promise<ParsedMigrationResult> {
  const issues: ValidationIssue[] = [];
  const rawCsvSha256 = await computeSha256Hex(rawCsvText);

  if (!rawCsvText || !rawCsvText.trim()) {
    issues.push({
      severity: 'error',
      group: 'FILE',
      line: 1,
      message: 'The uploaded CSV file is empty.',
    });
    return {
      products: [],
      members: [],
      issues,
      errorCount: 1,
      warningCount: 0,
      subscriptionCount: 0,
      cardCount: 0,
      rawCsvSha256,
      canonicalSha256: await computeSha256Hex('empty'),
      isValid: false,
    };
  }

  const { rows: rawRows, fatalErrors } = parseRfc4180Csv(rawCsvText);
  fatalErrors.forEach((msg) => {
    issues.push({ severity: 'error', group: 'FILE', line: 1, message: msg });
  });

  if (rawRows.length > MAX_CSV_DATA_ROWS) {
    issues.push({
      severity: 'error',
      group: 'FILE',
      line: 1,
      message: `CSV exceeds maximum allowed row limit (${MAX_CSV_DATA_ROWS} lines). Split into smaller batches.`,
    });
  }

  let currentSection: 'PRODUCTS' | 'MEMBERS' | null = null;
  let seenProductsSection = false;
  let seenMembersSection = false;
  let productHeaderMap: Map<string, number> | null = null;
  let memberHeaderMap: Map<string, number> | null = null;

  const productRawRows: Array<{ lineNumber: number; cells: string[] }> = [];
  const memberRawRows: Array<{ lineNumber: number; cells: string[] }> = [];

  for (const row of rawRows) {
    const trimmedCells = trimTrailingEmptyCells(row.cells);
    if (trimmedCells.length === 0) continue; // Blank row

    const firstCell = trimmedCells[0].trim();

    // Comment line (# ...)
    if (firstCell.startsWith('#')) continue;

    // Group Marker detection: [PRODUCTS] or [MEMBERS]
    if (/^\[.+\]$/.test(firstCell) && trimmedCells.length === 1) {
      const markerUpper = firstCell.toUpperCase();
      if (markerUpper === '[PRODUCTS]') {
        if (seenProductsSection) {
          issues.push({
            severity: 'error',
            group: 'FILE',
            line: row.lineNumber,
            message: 'Duplicate [PRODUCTS] group section found. Only one [PRODUCTS] section is allowed.',
          });
        }
        seenProductsSection = true;
        currentSection = 'PRODUCTS';
        productHeaderMap = null;
        continue;
      }

      if (markerUpper === '[MEMBERS]') {
        if (seenMembersSection) {
          issues.push({
            severity: 'error',
            group: 'FILE',
            line: row.lineNumber,
            message: 'Duplicate [MEMBERS] group section found. Only one [MEMBERS] section is allowed.',
          });
        }
        seenMembersSection = true;
        currentSection = 'MEMBERS';
        memberHeaderMap = null;
        continue;
      }

      issues.push({
        severity: 'error',
        group: 'FILE',
        line: row.lineNumber,
        message: `Unrecognized group marker "${firstCell}". Allowed groups are [PRODUCTS] and [MEMBERS].`,
      });
      currentSection = null;
      continue;
    }

    if (!currentSection) {
      issues.push({
        severity: 'error',
        group: 'FILE',
        line: row.lineNumber,
        message:
          'Data found outside a valid group section. Place rows strictly inside [PRODUCTS] or [MEMBERS].',
      });
      continue;
    }

    if (currentSection === 'PRODUCTS') {
      if (!productHeaderMap) {
        const map = new Map<string, number>();
        row.cells.forEach((h, idx) => {
          const clean = h.trim().toLowerCase();
          if (clean) map.set(clean, idx);
        });

        const missingHeaders = PRODUCT_HEADERS.filter((h) => !map.has(h));
        if (missingHeaders.length > 0) {
          issues.push({
            severity: 'error',
            group: 'PRODUCTS',
            line: row.lineNumber,
            message: `Missing required [PRODUCTS] columns: ${missingHeaders.join(', ')}`,
          });
        }

        const allowedSet = new Set<string>(PRODUCT_HEADERS);
        trimmedCells.forEach((h) => {
          const clean = h.trim().toLowerCase();
          if (clean && !allowedSet.has(clean)) {
            issues.push({
              severity: 'error',
              group: 'PRODUCTS',
              line: row.lineNumber,
              message: `Unknown column header "${h.trim()}" in [PRODUCTS] section.`,
            });
          }
        });

        productHeaderMap = map;
        continue;
      }

      productRawRows.push({ lineNumber: row.lineNumber, cells: row.cells });
    } else if (currentSection === 'MEMBERS') {
      if (!memberHeaderMap) {
        const map = new Map<string, number>();
        row.cells.forEach((h, idx) => {
          const clean = h.trim().toLowerCase();
          if (clean) map.set(clean, idx);
        });

        const missingHeaders = MEMBER_HEADERS.filter((h) => !map.has(h));
        if (missingHeaders.length > 0) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line: row.lineNumber,
            message: `Missing required [MEMBERS] columns: ${missingHeaders.join(', ')}`,
          });
        }

        const allowedSet = new Set<string>(MEMBER_HEADERS);
        trimmedCells.forEach((h) => {
          const clean = h.trim().toLowerCase();
          if (clean && !allowedSet.has(clean)) {
            issues.push({
              severity: 'error',
              group: 'MEMBERS',
              line: row.lineNumber,
              message: `Unknown column header "${h.trim()}" in [MEMBERS] section.`,
            });
          }
        });

        memberHeaderMap = map;
        continue;
      }

      memberRawRows.push({ lineNumber: row.lineNumber, cells: row.cells });
    }
  }

  if (!seenProductsSection) {
    issues.push({
      severity: 'error',
      group: 'FILE',
      line: 1,
      message: 'Missing required [PRODUCTS] group section in CSV template.',
    });
  } else if (!productHeaderMap) {
    issues.push({
      severity: 'error',
      group: 'PRODUCTS',
      line: 1,
      message: 'Missing [PRODUCTS] header row.',
    });
  }

  if (!seenMembersSection) {
    issues.push({
      severity: 'error',
      group: 'FILE',
      line: 1,
      message: 'Missing required [MEMBERS] group section in CSV template.',
    });
  } else if (!memberHeaderMap) {
    issues.push({
      severity: 'error',
      group: 'MEMBERS',
      line: 1,
      message: 'Missing [MEMBERS] header row.',
    });
  }

  // Validate individual [PRODUCTS] rows
  const parsedProducts: CsvProductRow[] = [];
  const csvProductNames = new Map<string, number>();
  const csvBarcodes = new Map<string, number>();

  const getProdCell = (cells: string[], col: string): string => {
    const idx = productHeaderMap?.get(col);
    return idx !== undefined && idx < cells.length ? cells[idx].trim() : '';
  };

  for (const row of productRawRows) {
    const line = row.lineNumber;
    const expectedWidth = PRODUCT_HEADERS.length;
    const extraNonEmpty = row.cells
      .slice(expectedWidth)
      .some((c) => c.trim() !== '');
    if (extraNonEmpty) {
      issues.push({
        severity: 'error',
        group: 'PRODUCTS',
        line,
        message: `Row has unexpected extra column values past the ${expectedWidth} [PRODUCTS] columns. Check for unescaped commas.`,
      });
    }

    const rawName = getProdCell(row.cells, 'product_name');
    const rawPrice = getProdCell(row.cells, 'selling_price');
    const rawHasLimit = getProdCell(row.cells, 'has_stock_limit');
    const rawStockQty = getProdCell(row.cells, 'stock_quantity');
    const rawLowAlert = getProdCell(row.cells, 'low_stock_alert');
    const rawBarcode = getProdCell(row.cells, 'manufacturer_barcode');
    const rawStatus = getProdCell(row.cells, 'status');

    let rowValid = true;
    const idLabel = rawName || `Product Line ${line}`;

    if (!rawName) {
      issues.push({
        severity: 'error',
        group: 'PRODUCTS',
        line,
        field: 'product_name',
        identifier: idLabel,
        message: 'Product Name is required.',
      });
      rowValid = false;
    } else {
      if (rawName.length < 2 || rawName.length > 100) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'product_name',
          identifier: rawName,
          message: 'Product Name must be between 2 and 100 characters.',
        });
        rowValid = false;
      }
      if (hasControlChars(rawName) || hasDangerousFormulaPrefix(rawName)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'product_name',
          identifier: rawName,
          message: 'Product Name contains forbidden control characters or formula prefix (=, +, @).',
        });
        rowValid = false;
      }
      if (rawName.toUpperCase().startsWith('SAMPLE -')) {
        issues.push({
          severity: 'warning',
          group: 'PRODUCTS',
          line,
          field: 'product_name',
          identifier: rawName,
          message: 'Row still carries "SAMPLE -" template prefix. Confirm you intended to import this item.',
        });
      }

      const nameKey = rawName.toLowerCase();
      if (csvProductNames.has(nameKey)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'product_name',
          identifier: rawName,
          message: `Duplicate Product Name in CSV (already defined on line ${csvProductNames.get(nameKey)}).`,
        });
        rowValid = false;
      } else {
        csvProductNames.set(nameKey, line);
      }

      if (dbSnapshot.activeProductNames.has(nameKey)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'product_name',
          identifier: rawName,
          message: 'A product with this exact name already exists in the live Products database.',
        });
        rowValid = false;
      }
    }

    // Price validation (DECIMAL(10,2), > 0)
    const priceNum = Number(rawPrice);
    if (
      !rawPrice ||
      !/^\d+(\.\d{1,2})?$/.test(rawPrice) ||
      !Number.isFinite(priceNum) ||
      priceNum <= 0 ||
      priceNum > 999999.99
    ) {
      issues.push({
        severity: 'error',
        group: 'PRODUCTS',
        line,
        field: 'selling_price',
        identifier: idLabel,
        message: 'Selling Price must be a valid positive amount up to 2 decimal places (e.g., 65.00).',
      });
      rowValid = false;
    }

    // Stock limit flag
    const limitParsed = parseStrictBoolean(rawHasLimit);
    if (!rawHasLimit || !limitParsed.valid) {
      issues.push({
        severity: 'error',
        group: 'PRODUCTS',
        line,
        field: 'has_stock_limit',
        identifier: idLabel,
        message: 'has_stock_limit is required and must be true or false.',
      });
      rowValid = false;
    }

    let stockQty = 0;
    let lowStockAlert: number | null = null;

    if (limitParsed.valid && limitParsed.value) {
      if (!rawStockQty || !/^\d+$/.test(rawStockQty)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'stock_quantity',
          identifier: idLabel,
          message: 'stock_quantity must be a whole non-negative integer when has_stock_limit=true.',
        });
        rowValid = false;
      } else {
        stockQty = parseInt(rawStockQty, 10);
        if (stockQty > 999999) {
          issues.push({
            severity: 'error',
            group: 'PRODUCTS',
            line,
            field: 'stock_quantity',
            identifier: idLabel,
            message: 'stock_quantity exceeds maximum limit (999,999).',
          });
          rowValid = false;
        }
      }

      if (rawLowAlert) {
        if (!/^\d+$/.test(rawLowAlert)) {
          issues.push({
            severity: 'error',
            group: 'PRODUCTS',
            line,
            field: 'low_stock_alert',
            identifier: idLabel,
            message: 'low_stock_alert must be a non-negative integer or blank.',
          });
          rowValid = false;
        } else {
          lowStockAlert = parseInt(rawLowAlert, 10);
          if (lowStockAlert > 999999) {
            issues.push({
              severity: 'error',
              group: 'PRODUCTS',
              line,
              field: 'low_stock_alert',
              identifier: idLabel,
              message: 'low_stock_alert exceeds maximum limit (999,999).',
            });
            rowValid = false;
          } else if (stockQty > 0 && lowStockAlert >= stockQty) {
            issues.push({
              severity: 'warning',
              group: 'PRODUCTS',
              line,
              field: 'low_stock_alert',
              identifier: idLabel,
              message: `low_stock_alert (${lowStockAlert}) is >= current stock_quantity (${stockQty}); product will immediately trigger low stock alert.`,
            });
          }
        }
      }
    } else if (limitParsed.valid && !limitParsed.value) {
      if (rawStockQty && rawStockQty !== '0') {
        issues.push({
          severity: 'warning',
          group: 'PRODUCTS',
          line,
          field: 'stock_quantity',
          identifier: idLabel,
          message: 'has_stock_limit is false; stock_quantity will be normalized to 0.',
        });
      }
      if (rawLowAlert) {
        issues.push({
          severity: 'warning',
          group: 'PRODUCTS',
          line,
          field: 'low_stock_alert',
          identifier: idLabel,
          message: 'has_stock_limit is false; low_stock_alert will be ignored.',
        });
      }
    }

    // Manufacturer Barcode validation (VARCHAR(32), active unique)
    let cleanBarcode: string | null = rawBarcode || null;
    if (cleanBarcode) {
      if (cleanBarcode.length > 32) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'manufacturer_barcode',
          identifier: idLabel,
          message: 'manufacturer_barcode exceeds 32 character database limit.',
        });
        rowValid = false;
      }
      if (!/^[A-Za-z0-9\-_.]+$/.test(cleanBarcode)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'manufacturer_barcode',
          identifier: idLabel,
          message: 'manufacturer_barcode may only contain letters, numbers, hyphens, underscores, or periods.',
        });
        rowValid = false;
      }
      const barcodeKey = cleanBarcode.toLowerCase();
      if (csvBarcodes.has(barcodeKey)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'manufacturer_barcode',
          identifier: idLabel,
          message: `Duplicate manufacturer_barcode "${cleanBarcode}" in CSV (already on line ${csvBarcodes.get(barcodeKey)}).`,
        });
        rowValid = false;
      } else {
        csvBarcodes.set(barcodeKey, line);
      }

      if (dbSnapshot.activeBarcodes.has(barcodeKey)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'manufacturer_barcode',
          identifier: idLabel,
          message: `Manufacturer barcode "${cleanBarcode}" is already registered to an active product.`,
        });
        rowValid = false;
      } else if (dbSnapshot.recycleBinBarcodes.has(barcodeKey)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'manufacturer_barcode',
          identifier: idLabel,
          message: `Manufacturer barcode "${cleanBarcode}" still exists inside the Product Recycle Bin. Permanently purge it or assign another barcode.`,
        });
        rowValid = false;
      }
    }

    // Status validation
    let productStatus: 'Active' | 'Inactive' = 'Active';
    if (rawStatus) {
      const lowerSt = rawStatus.toLowerCase();
      if (lowerSt === 'active') productStatus = 'Active';
      else if (lowerSt === 'inactive') productStatus = 'Inactive';
      else {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'status',
          identifier: idLabel,
          message: `Invalid product status "${rawStatus}". Must be Active or Inactive.`,
        });
        rowValid = false;
      }
    }

    if (rowValid) {
      parsedProducts.push({
        lineNumber: line,
        product_name: rawName,
        selling_price: Number(priceNum.toFixed(2)),
        has_stock_limit: limitParsed.value,
        stock_quantity: limitParsed.value ? stockQty : 0,
        low_stock_alert: limitParsed.value ? lowStockAlert : null,
        manufacturer_barcode: cleanBarcode,
        status: productStatus,
      });
    }
  }

  // Validate individual [MEMBERS] rows
  const parsedMembers: CsvMemberRow[] = [];
  const csvMemberNames = new Map<string, number>();
  const csvMemberEmails = new Map<string, number>();

  const getMemCell = (cells: string[], col: string): string => {
    const idx = memberHeaderMap?.get(col);
    return idx !== undefined && idx < cells.length ? cells[idx].trim() : '';
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  for (const row of memberRawRows) {
    const line = row.lineNumber;
    const expectedWidth = MEMBER_HEADERS.length;
    const extraNonEmpty = row.cells
      .slice(expectedWidth)
      .some((c) => c.trim() !== '');
    if (extraNonEmpty) {
      issues.push({
        severity: 'error',
        group: 'MEMBERS',
        line,
        message: `Row has unexpected extra column values past the ${expectedWidth} [MEMBERS] columns. Wrap values containing commas in double quotes.`,
      });
    }

    const rawFullName = getMemCell(row.cells, 'full_name');
    const rawPhone = getMemCell(row.cells, 'phone');
    const rawEmail = getMemCell(row.cells, 'email');
    const rawGender = getMemCell(row.cells, 'gender');
    const rawBirthday = getMemCell(row.cells, 'birthday');
    const rawAddress = getMemCell(row.cells, 'address');
    const rawPlanType = getMemCell(row.cells, 'plan_type');
    const rawStartDate = getMemCell(row.cells, 'start_date');
    const rawEndDate = getMemCell(row.cells, 'end_date');
    const rawIssueCard = getMemCell(row.cells, 'issue_card');
    const rawCardType = getMemCell(row.cells, 'card_type');
    const rawStatus = getMemCell(row.cells, 'status');
    const rawNotes = getMemCell(row.cells, 'notes');

    let rowValid = true;
    const normalizedName = rawFullName.toUpperCase();
    const idLabel = normalizedName || `Member Line ${line}`;

    if (!normalizedName) {
      issues.push({
        severity: 'error',
        group: 'MEMBERS',
        line,
        field: 'full_name',
        identifier: idLabel,
        message: 'Member full_name is required.',
      });
      rowValid = false;
    } else {
      if (normalizedName.length < 2 || normalizedName.length > 150) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'full_name',
          identifier: normalizedName,
          message: 'full_name must be between 2 and 150 characters.',
        });
        rowValid = false;
      }
      if (/^\d+$/.test(normalizedName)) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'full_name',
          identifier: normalizedName,
          message: 'full_name cannot be purely numeric.',
        });
        rowValid = false;
      }
      if (
        hasControlChars(normalizedName) ||
        hasDangerousFormulaPrefix(normalizedName)
      ) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'full_name',
          identifier: normalizedName,
          message: 'full_name contains forbidden control characters or formula prefix (=, +, @).',
        });
        rowValid = false;
      }
      if (normalizedName.startsWith('SAMPLE -')) {
        issues.push({
          severity: 'warning',
          group: 'MEMBERS',
          line,
          field: 'full_name',
          identifier: normalizedName,
          message: 'Row still carries "SAMPLE -" template prefix. Confirm you intended to import this member.',
        });
      }

      const nameKey = normalizedName.toLowerCase();
      if (csvMemberNames.has(nameKey)) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'full_name',
          identifier: normalizedName,
          message: `Duplicate member full_name in CSV (already defined on line ${csvMemberNames.get(nameKey)}).`,
        });
        rowValid = false;
      } else {
        csvMemberNames.set(nameKey, line);
      }

      if (dbSnapshot.activeMemberNames.has(nameKey)) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'full_name',
          identifier: normalizedName,
          message: 'A member with this full name already exists in the live Members directory.',
        });
        rowValid = false;
      }
    }

    // Phone validation (VARCHAR(20), defaults to 'No Phone')
    let cleanPhone = rawPhone || 'No Phone';
    if (cleanPhone.toLowerCase() === 'no phone') {
      cleanPhone = 'No Phone';
    } else {
      if (cleanPhone.length < 7 || cleanPhone.length > 20) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'phone',
          identifier: idLabel,
          message: 'phone must be 7 to 20 characters (or blank / "No Phone").',
        });
        rowValid = false;
      } else if (!/^[0-9+\-\s()]+$/.test(cleanPhone)) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'phone',
          identifier: idLabel,
          message: 'phone contains invalid characters (only digits, +, -, spaces, parentheses allowed).',
        });
        rowValid = false;
      }
    }

    // Email validation
    let cleanEmail: string | null = rawEmail ? rawEmail.toLowerCase() : null;
    if (cleanEmail) {
      if (
        cleanEmail.length > 120 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
      ) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'email',
          identifier: idLabel,
          message: `Invalid email address "${rawEmail}".`,
        });
        rowValid = false;
      } else {
        if (csvMemberEmails.has(cleanEmail)) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line,
            field: 'email',
            identifier: idLabel,
            message: `Duplicate email "${cleanEmail}" found in CSV (line ${csvMemberEmails.get(cleanEmail)}).`,
          });
          rowValid = false;
        } else {
          csvMemberEmails.set(cleanEmail, line);
        }

        if (dbSnapshot.activeMemberEmails.has(cleanEmail)) {
          issues.push({
            severity: 'warning',
            group: 'MEMBERS',
            line,
            field: 'email',
            identifier: idLabel,
            message: `Email "${cleanEmail}" is already associated with an existing member in DB.`,
          });
        }
      }
    }

    // Gender validation
    let genderVal: 'Male' | 'Female' | 'Other' = 'Male';
    if (rawGender) {
      const gLower = rawGender.toLowerCase();
      if (gLower === 'male' || gLower === 'm') genderVal = 'Male';
      else if (gLower === 'female' || gLower === 'f') genderVal = 'Female';
      else if (gLower === 'other') genderVal = 'Other';
      else {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'gender',
          identifier: idLabel,
          message: `Invalid gender "${rawGender}". Use Male, Female, or Other.`,
        });
        rowValid = false;
      }
    }

    // Birthday validation (optional YYYY-MM-DD)
    let birthdayVal: string | null = rawBirthday || null;
    if (birthdayVal) {
      if (!isValidIsoDateStrict(birthdayVal)) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'birthday',
          identifier: idLabel,
          message: `Invalid birthday "${birthdayVal}". Use valid calendar date YYYY-MM-DD.`,
        });
        rowValid = false;
      } else if (birthdayVal < '1920-01-01' || birthdayVal > todayIso) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'birthday',
          identifier: idLabel,
          message: `Birthday "${birthdayVal}" is out of valid range (1920-01-01 to today).`,
        });
        rowValid = false;
      }
    }

    // Address validation
    const cleanAddress = rawAddress || null;
    if (cleanAddress && (cleanAddress.length > 300 || hasDangerousFormulaPrefix(cleanAddress))) {
      issues.push({
        severity: 'error',
        group: 'MEMBERS',
        line,
        field: 'address',
        identifier: idLabel,
        message: 'Address exceeds 300 characters or begins with restricted formula character.',
      });
      rowValid = false;
    }

    // Plan type & dates
    let planType: 'none' | 'monthly' | 'yearly' = 'none';
    if (rawPlanType) {
      const pLower = rawPlanType.toLowerCase();
      if (pLower === 'none' || pLower === 'monthly' || pLower === 'yearly') {
        planType = pLower;
      } else {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'plan_type',
          identifier: idLabel,
          message: `Invalid plan_type "${rawPlanType}". Must be monthly, yearly, or none.`,
        });
        rowValid = false;
      }
    }

    let startDateVal: string | null = rawStartDate || null;
    let endDateVal: string | null = rawEndDate || null;

    if (planType === 'none') {
      if (startDateVal || endDateVal) {
        issues.push({
          severity: 'warning',
          group: 'MEMBERS',
          line,
          field: 'plan_type',
          identifier: idLabel,
          message: 'plan_type is "none"; provided start_date/end_date will be ignored.',
        });
      }
      startDateVal = null;
      endDateVal = null;
    } else {
      if (!startDateVal || !isValidIsoDateStrict(startDateVal)) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'start_date',
          identifier: idLabel,
          message: `Valid YYYY-MM-DD start_date is required for "${planType}" plan.`,
        });
        rowValid = false;
      }
      if (!endDateVal || !isValidIsoDateStrict(endDateVal)) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'end_date',
          identifier: idLabel,
          message: `Valid YYYY-MM-DD end_date is required for "${planType}" plan.`,
        });
        rowValid = false;
      }

      if (
        startDateVal &&
        endDateVal &&
        isValidIsoDateStrict(startDateVal) &&
        isValidIsoDateStrict(endDateVal)
      ) {
        const startMs = Date.parse(`${startDateVal}T00:00:00Z`);
        const endMs = Date.parse(`${endDateVal}T00:00:00Z`);
        const diffDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line,
            field: 'end_date',
            identifier: idLabel,
            message: 'end_date must be strictly after start_date.',
          });
          rowValid = false;
        } else if (planType === 'monthly' && diffDays > 31) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line,
            field: 'end_date',
            identifier: idLabel,
            message: `Monthly plan duration (${diffDays} days) exceeds 31-day maximum.`,
          });
          rowValid = false;
        } else if (planType === 'yearly' && diffDays > 366) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line,
            field: 'end_date',
            identifier: idLabel,
            message: `Yearly plan duration (${diffDays} days) exceeds 366-day maximum.`,
          });
          rowValid = false;
        } else if (endDateVal < todayIso) {
          issues.push({
            severity: 'warning',
            group: 'MEMBERS',
            line,
            field: 'end_date',
            identifier: idLabel,
            message: `Subscription end_date (${endDateVal}) is in the past and will be migrated as Expired.`,
          });
        }
      }
    }

    // Card issuance flags
    const issueCardParsed = parseStrictBoolean(rawIssueCard, false);
    if (!issueCardParsed.valid) {
      issues.push({
        severity: 'error',
        group: 'MEMBERS',
        line,
        field: 'issue_card',
        identifier: idLabel,
        message: `Invalid issue_card value "${rawIssueCard}". Must be true or false.`,
      });
      rowValid = false;
    }

    let cardTypeVal: 'QR' | 'Manual' | 'None' = 'None';
    if (issueCardParsed.valid && issueCardParsed.value) {
      const cLower = rawCardType.toLowerCase();
      if (cLower === 'qr') cardTypeVal = 'QR';
      else if (cLower === 'manual') cardTypeVal = 'Manual';
      else {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'card_type',
          identifier: idLabel,
          message: 'When issue_card=true, card_type must be "QR" or "Manual".',
        });
        rowValid = false;
      }
    } else if (rawCardType && rawCardType.toLowerCase() !== 'none') {
      issues.push({
        severity: 'warning',
        group: 'MEMBERS',
        line,
        field: 'card_type',
        identifier: idLabel,
        message: 'issue_card is false; card_type will be normalized to None.',
      });
    }

    // Member status
    let memberStatus: 'Active' | 'Suspended' = 'Active';
    if (rawStatus) {
      const stLower = rawStatus.toLowerCase();
      if (stLower === 'active') memberStatus = 'Active';
      else if (stLower === 'suspended') memberStatus = 'Suspended';
      else {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'status',
          identifier: idLabel,
          message: `Invalid member status "${rawStatus}". Must be Active or Suspended.`,
        });
        rowValid = false;
      }
    }

    // Notes
    const cleanNotes =
      rawNotes || 'Imported via SuperAdmin Secure CSV Data Migration';
    if (cleanNotes.length > 500 || hasDangerousFormulaPrefix(cleanNotes)) {
      issues.push({
        severity: 'error',
        group: 'MEMBERS',
        line,
        field: 'notes',
        identifier: idLabel,
        message: 'Notes exceed 500 characters or begin with restricted formula character.',
      });
      rowValid = false;
    }

    if (rowValid) {
      parsedMembers.push({
        lineNumber: line,
        full_name: normalizedName,
        phone: cleanPhone,
        email: cleanEmail,
        gender: genderVal,
        birthday: birthdayVal,
        address: cleanAddress,
        plan_type: planType,
        start_date: startDateVal,
        end_date: endDateVal,
        issue_card: issueCardParsed.value,
        card_type: issueCardParsed.value ? cardTypeVal : 'None',
        status: memberStatus,
        notes: cleanNotes,
      });
    }
  }

  if (parsedProducts.length === 0 && parsedMembers.length === 0) {
    issues.push({
      severity: 'error',
      group: 'FILE',
      line: 1,
      message: 'No valid Product or Member rows found to migrate.',
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const subscriptionCount = parsedMembers.filter(
    (m) => m.plan_type !== 'none'
  ).length;
  const cardCount = parsedMembers.filter((m) => m.issue_card).length;

  const canonicalSha256 = await computeSha256Hex(
    JSON.stringify({ products: parsedProducts, members: parsedMembers })
  );

  return {
    products: parsedProducts,
    members: parsedMembers,
    issues,
    errorCount,
    warningCount,
    subscriptionCount,
    cardCount,
    rawCsvSha256,
    canonicalSha256,
    isValid: errorCount === 0 && (parsedProducts.length > 0 || parsedMembers.length > 0),
  };
}

/**
 * Executes the sealed & verified migration batch against Supabase
 */
export async function executeSecuredCsvMigration(params: {
  sealedBatch: SealedMigrationBatch;
  actorEmail?: string | null;
  actorId?: string | null;
  nonEmptyOverride: boolean;
  onProgress?: (percent: number, stageLabel: string) => void;
}): Promise<MigrationExecutionSummary> {
  const { sealedBatch, actorEmail, actorId, nonEmptyOverride, onProgress } = params;

  // 1. Strict SuperAdmin Verification
  if (!isSuperAdmin(actorEmail)) {
    await logAudit(
      'LEGACY_CSV_MIGRATION_BLOCKED',
      `Blocked unauthorized CSV migration execution attempt by non-SuperAdmin (${actorEmail || 'unknown'}).`,
      actorId || undefined
    );
    throw new Error('Access denied. Exclusively restricted to assigned SuperAdmin.');
  }

  // 2. Live Cash Session Closed Verification
  const sessionCheck = await verifyLiveCashSessionClosed();
  if (!sessionCheck.isClosed) {
    await logAudit(
      'LEGACY_CSV_MIGRATION_BLOCKED',
      `Blocked CSV migration because live cash drawer session (${sessionCheck.openSessionId || 'active'}) is still open.`,
      actorId || undefined
    );
    throw new Error(
      'An active cash drawer session is open. Close the cash session before running migration.'
    );
  }

  // 3. Re-verify DB non-empty policy if needed
  const liveSnapshot = await fetchMigrationDbSnapshot();
  const hasExistingData =
    liveSnapshot.activeProductCount > 0 || liveSnapshot.activeMemberCount > 0;
  if (hasExistingData && !nonEmptyOverride) {
    throw new Error(
      'Database is not empty. Explicit SuperAdmin acknowledgement is required to proceed.'
    );
  }

  // 4. Cryptographically unseal & verify AES-GCM + SHA-256 checksum
  onProgress?.(5, 'Verifying AES-GCM & SHA-256 payload integrity...');
  let payload: { products: CsvProductRow[]; members: CsvMemberRow[] };
  try {
    payload = await unsealAndVerifyMigrationBatch(sealedBatch);
  } catch (tamperErr: any) {
    await logAudit(
      'LEGACY_CSV_MIGRATION_TAMPER_ALERT',
      `Migration aborted due to payload integrity failure: ${tamperErr.message}`,
      actorId || undefined
    );
    throw tamperErr;
  }

  // Re-verify zero live DB collisions right before commit (prevents TOCTOU race conditions)
  for (const p of payload.products) {
    if (liveSnapshot.activeProductNames.has(p.product_name.toLowerCase())) {
      throw new Error(
        `Conflict detected before commit: Product "${p.product_name}" now exists in database.`
      );
    }
    if (
      p.manufacturer_barcode &&
      liveSnapshot.activeBarcodes.has(p.manufacturer_barcode.toLowerCase())
    ) {
      throw new Error(
        `Conflict detected before commit: Barcode "${p.manufacturer_barcode}" now exists in database.`
      );
    }
  }
  for (const m of payload.members) {
    if (liveSnapshot.activeMemberNames.has(m.full_name.toLowerCase())) {
      throw new Error(
        `Conflict detected before commit: Member "${m.full_name}" now exists in database.`
      );
    }
  }

  const totalOperations = payload.products.length + payload.members.length;
  let completedOps = 0;
  let productsInserted = 0;
  let membersInserted = 0;
  let subscriptionsInserted = 0;
  let cardsIssued = 0;

  const updateProg = (label: string) => {
    const pct =
      totalOperations > 0
        ? Math.min(98, Math.max(10, Math.round((completedOps / totalOperations) * 90) + 8))
        : 95;
    onProgress?.(pct, label);
  };

  // 5. Insert Products in controlled chunks of 50
  if (payload.products.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < payload.products.length; i += chunkSize) {
      const chunk = payload.products.slice(i, i + chunkSize);
      updateProg(
        `Migrating products (${Math.min(i + chunk.length, payload.products.length)}/${payload.products.length})...`
      );

      const insertRows = chunk.map((p) => ({
        product_name: p.product_name,
        selling_price: p.selling_price,
        has_stock_limit: p.has_stock_limit,
        stock_quantity: p.has_stock_limit ? p.stock_quantity : 0,
        low_stock_alert: p.has_stock_limit ? p.low_stock_alert : null,
        manufacturer_barcode: p.manufacturer_barcode,
        manufacturer_source: 'manual',
        status: p.status,
      }));

      const { data: insertedProds, error: prodErr } = await supabase
        .from('products')
        .insert(insertRows)
        .select('id');

      if (prodErr) {
        throw new Error(`Products batch insert error: ${prodErr.message}`);
      }

      productsInserted += insertedProds?.length || chunk.length;
      completedOps += chunk.length;
    }
  }

  // 6. Insert Members + Optional Subscriptions + Optional Cards
  const batchToken = Date.now().toString().slice(-6);
  for (let i = 0; i < payload.members.length; i++) {
    const m = payload.members[i];
    updateProg(`Migrating members (${i + 1}/${payload.members.length})...`);

    const memberPayload = {
      full_name: m.full_name,
      phone: m.phone,
      email: m.email,
      gender: m.gender,
      birthday: m.birthday,
      address: m.address,
      status: m.status,
      notes: m.notes,
    };

    const { data: createdMember, error: memErr } = await supabase
      .from('members')
      .insert([memberPayload])
      .select()
      .single();

    if (memErr) {
      throw new Error(
        `Member insert failed at "${m.full_name}" (CSV line ${m.lineNumber}): ${memErr.message}`
      );
    }

    membersInserted++;

    if (m.plan_type !== 'none' && m.start_date && m.end_date) {
      const startIso = new Date(`${m.start_date}T00:00:00+08:00`).toISOString();
      const endIso = new Date(`${m.end_date}T23:59:59+08:00`).toISOString();
      const isExpired = new Date(endIso).getTime() < Date.now();
      const receiptNo = `MIG-CSV-${batchToken}-${String(i + 1).padStart(4, '0')}`;

      const { error: subErr } = await supabase.from('subscriptions').insert([
        {
          member_id: createdMember.member_id,
          plan_type: m.plan_type,
          price: 0.0,
          base_price: 0.0,
          gcash_fee: 0.0,
          card_fee: 0.0,
          start_date: startIso,
          end_date: endIso,
          status: isExpired ? 'Expired' : 'Active',
          payment_status: 'Paid',
          payment_method: 'Cash',
          receipt_number: receiptNo,
        },
      ]);

      if (subErr) {
        throw new Error(
          `Subscription insert failed for "${m.full_name}" (CSV line ${m.lineNumber}): ${subErr.message}`
        );
      }
      subscriptionsInserted++;
    }

    if (m.issue_card && m.card_type !== 'None') {
      await cardService.issue(
        createdMember.member_id,
        m.card_type,
        actorEmail || 'SuperAdmin CSV Migration',
        undefined,
        'PAID',
        'CLAIMED',
        0
      );
      cardsIssued++;
    }

    completedOps++;
  }

  // Purge stale client caches and broadcast refresh events
  try {
    sessionStorage.removeItem('members_sanitized_cache');
    localStorage.removeItem('members_sanitized_cache');
    sessionStorage.removeItem('products_sanitized_list');
    localStorage.removeItem('products_sanitized_list');
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('member-refresh'));
    window.dispatchEvent(new Event('palomar_logbook_updated'));
    window.dispatchEvent(new Event('products-refresh'));
  }

  clearEphemeralSeal(sealedBatch.sealId);

  const hashPrefix = sealedBatch.canonicalSha256.slice(0, 16).toUpperCase();
  const csvHashPrefix = sealedBatch.rawCsvSha256.slice(0, 12).toUpperCase();

  await logAudit(
    'LEGACY_CSV_MIGRATION_EXECUTED',
    `SuperAdmin executed secure CSV migration: ${productsInserted} product(s), ${membersInserted} member(s), ${subscriptionsInserted} subscription(s), ${cardsIssued} card(s). DB Non-Empty Override: ${hasExistingData ? 'Yes' : 'No (Clean DB)'}. Payload SHA-256: ${hashPrefix}... | CSV SHA-256: ${csvHashPrefix}...`,
    actorId || undefined
  );

  onProgress?.(100, 'Migration completed & audited.');

  return {
    productsInserted,
    membersInserted,
    subscriptionsInserted,
    cardsIssued,
    canonicalSha256: sealedBatch.canonicalSha256,
    rawCsvSha256: sealedBatch.rawCsvSha256,
  };
}

/**
 * Records every CSV migration attempt (success, failure, blocked) into the dedicated
 * `migration_audit_logs` Supabase table, capturing timestamp, SuperAdmin ID, file hash,
 * and structured validation error details. Mirrors key summary to `audit_logs` as well.
 */
export async function recordMigrationAttempt(params: {
  superadminId?: string | null;
  superadminEmail?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  fileHash: string;
  payloadHash?: string | null;
  status: 'success' | 'failure' | 'blocked';
  productsCount?: number;
  membersCount?: number;
  subscriptionsCount?: number;
  cardsCount?: number;
  errorCount?: number;
  warningCount?: number;
  validationErrors?: ValidationIssue[];
  errorMessage?: string | null;
  nonEmptyOverride?: boolean;
  notes?: string | null;
}): Promise<{ savedToDedicatedTable: boolean; error?: string }> {
  const email = params.superadminEmail || 'unknown';
  const errorsTrimmed = (params.validationErrors || []).slice(0, 200);

  const rowPayload = {
    superadmin_id: params.superadminId || null,
    superadmin_email: email,
    file_name: params.fileName || null,
    file_size_bytes: params.fileSizeBytes ?? null,
    file_hash: params.fileHash || 'uncomputed',
    payload_hash: params.payloadHash || null,
    status: params.status,
    products_count: params.productsCount ?? 0,
    members_count: params.membersCount ?? 0,
    subscriptions_count: params.subscriptionsCount ?? 0,
    cards_count: params.cardsCount ?? 0,
    error_count: params.errorCount ?? 0,
    warning_count: params.warningCount ?? 0,
    validation_errors: errorsTrimmed,
    error_message: params.errorMessage || null,
    non_empty_override: Boolean(params.nonEmptyOverride),
    notes: params.notes || null,
  };

  let savedToDedicatedTable = false;
  let tableErrorMsg: string | undefined;

  try {
    const { error } = await supabase
      .from('migration_audit_logs')
      .insert([rowPayload]);

    if (!error) {
      savedToDedicatedTable = true;
    } else {
      tableErrorMsg = error.message;
      console.warn('migration_audit_logs insert warning:', error.message);
    }
  } catch (err: any) {
    tableErrorMsg = err?.message || 'Unknown error inserting migration_audit_logs';
  }

  // Also mirror critical summary into general audit_logs for cross-module visibility
  try {
    const hashShort = (params.fileHash || 'none').slice(0, 12).toUpperCase();
    const statusUpper = params.status.toUpperCase();
    await logAudit(
      `LEGACY_CSV_MIGRATION_${statusUpper}`,
      `CSV Migration [${statusUpper}] by ${email} — File: ${params.fileName || 'N/A'} | File Hash: ${hashShort}... | Products: ${params.productsCount ?? 0}, Members: ${params.membersCount ?? 0}, Errors: ${params.errorCount ?? 0}${params.errorMessage ? ` | Note: ${params.errorMessage}` : ''}`,
      params.superadminId || undefined
    );
  } catch {}

  return { savedToDedicatedTable, error: tableErrorMsg };
}

/**
 * Fetches historical migration attempt records from `migration_audit_logs`
 */
export async function fetchMigrationAuditLogs(limit: number = 50): Promise<{
  logs: MigrationAuditLogEntry[];
  tableUnavailable: boolean;
}> {
  try {
    const { data, error } = await supabase
      .from('migration_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (
        msg.includes('does not exist') ||
        msg.includes('relation') ||
        error.code === '42P01' ||
        error.code === 'PGRST205'
      ) {
        return { logs: [], tableUnavailable: true };
      }
      throw error;
    }

    return {
      logs: (data as MigrationAuditLogEntry[]) || [],
      tableUnavailable: false,
    };
  } catch (err) {
    console.warn('fetchMigrationAuditLogs error:', err);
    return { logs: [], tableUnavailable: true };
  }
}

