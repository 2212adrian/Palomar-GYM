// src/pages/system/utils/csvDataMigration.ts
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';
import { isSuperAdmin } from '../../../constants/auth';
import { cardService } from '../../members/memberService';

export const MAX_CSV_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_CSV_DATA_ROWS = 5000;
export const MIGRATION_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const LOCAL_ROLLBACK_CACHE_KEY = 'wp_csv_migration_rollbacks_v1';

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

export type DuplicateAction = 'ignore' | 'overwrite';

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

export interface ExistingDbProduct {
  id: string;
  product_name: string;
  selling_price: number;
  has_stock_limit: boolean;
  stock_quantity: number;
  low_stock_alert: number | null;
  manufacturer_barcode: string | null;
  status: string;
}

export interface ExistingDbMember {
  member_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  gender: string;
  birthday: string | null;
  address: string | null;
  status: string;
  notes: string | null;
}

export interface DuplicateConflict {
  conflictKey: string;
  scope: 'database' | 'csv';
  group: 'PRODUCTS' | 'MEMBERS';
  line: number;
  matchedBy: 'product_name' | 'manufacturer_barcode' | 'full_name' | 'email';
  identifier: string;
  targetDbId?: string;
  earlierCsvLine?: number;
  existingSnapshot?: ExistingDbProduct | ExistingDbMember;
  existingSummary: string;
  incomingSummary: string;
  defaultResolution: DuplicateAction;
}

export interface ExistingDbSnapshot {
  activeProductCount: number;
  activeMemberCount: number;
  activeProductNames: Set<string>;
  activeBarcodes: Set<string>;
  recycleBinBarcodes: Set<string>;
  activeMemberNames: Set<string>;
  activeMemberEmails: Set<string>;
  activeProductsByName: Map<string, ExistingDbProduct>;
  activeProductsByBarcode: Map<string, ExistingDbProduct>;
  activeMembersByName: Map<string, ExistingDbMember>;
  activeMembersByEmail: Map<string, ExistingDbMember>;
  fetchedAt: string;
}

export interface ParsedMigrationResult {
  products: CsvProductRow[];
  members: CsvMemberRow[];
  conflicts: DuplicateConflict[];
  defaultResolutions: Record<string, DuplicateAction>;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  subscriptionCount: number;
  cardCount: number;
  rawCsvSha256: string;
  canonicalSha256: string;
  isValid: boolean;
}

export interface ProductOverwriteAction {
  targetId: string;
  incoming: CsvProductRow;
  previous: ExistingDbProduct;
}

export interface MemberOverwriteAction {
  targetMemberId: string;
  incoming: CsvMemberRow;
  previous: ExistingDbMember;
}

export interface ResolvedMigrationPlan {
  productsToInsert: CsvProductRow[];
  productsToOverwrite: ProductOverwriteAction[];
  membersToInsert: CsvMemberRow[];
  membersToOverwrite: MemberOverwriteAction[];
  ignoredProductsCount: number;
  ignoredMembersCount: number;
  ignoredCount: number;
  overwrittenCount: number;
  insertedCount: number;
  subscriptionCount: number;
  cardCount: number;
  canonicalSha256: string;
}

export interface SealedMigrationBatch {
  sealId: string;
  ciphertext: string;
  iv: string;
  rawCsvSha256: string;
  canonicalSha256: string;
  integrityHmac: string;
  sealedAt: string;
  productInsertCount: number;
  productOverwriteCount: number;
  memberInsertCount: number;
  memberOverwriteCount: number;
  ignoredCount: number;
  subscriptionCount: number;
  cardCount: number;
}

export interface OverwrittenProductSnapshot {
  id: string;
  previous: {
    product_name: string;
    selling_price: number;
    has_stock_limit: boolean;
    stock_quantity: number;
    low_stock_alert: number | null;
    manufacturer_barcode: string | null;
    status: string;
  };
}

export interface OverwrittenMemberSnapshot {
  member_id: string;
  previous: {
    full_name: string;
    phone: string;
    email: string | null;
    gender: string;
    birthday: string | null;
    address: string | null;
    status: string;
    notes: string | null;
  };
}

export interface PreviousCardSnapshot {
  id: string;
  member_id: string;
  card_number: string;
  card_type: string;
  status: string;
  version: number;
  payment_status: string;
  claim_status: string;
  card_fee_paid: number;
  claimed_at: string | null;
  claimed_by: string | null;
  claim_notes: string | null;
  receipt_number: string | null;
  issued_at: string;
  expires_at: string;
}

export interface MigrationRollbackManifest {
  version: 1;
  insertedProductIds: string[];
  insertedMemberIds: string[];
  insertedSubscriptionIds: string[];
  insertedCardIds: string[];
  overwrittenProducts: OverwrittenProductSnapshot[];
  overwrittenMembers: OverwrittenMemberSnapshot[];
  overwrittenCards: PreviousCardSnapshot[];
}

export interface MigrationExecutionSummary {
  batchId: string;
  productsInserted: number;
  productsOverwritten: number;
  membersInserted: number;
  membersOverwritten: number;
  ignoredCount: number;
  subscriptionsInserted: number;
  cardsIssued: number;
  canonicalSha256: string;
  rawCsvSha256: string;
  executedAt: string;
  rollbackExpiresAt: string;
  rollbackManifest: MigrationRollbackManifest;
}

export interface MigrationAuditLogEntry {
  id: string;
  created_at: string;
  batch_id?: string | null;
  superadmin_id: string | null;
  superadmin_email: string;
  file_name: string | null;
  file_size_bytes: number | null;
  file_hash: string;
  payload_hash: string | null;
  status: 'success' | 'failure' | 'blocked' | 'reverted' | 'REVERTED';
  products_count: number;
  members_count: number;
  subscriptions_count: number;
  cards_count: number;
  overwritten_count?: number;
  ignored_count?: number;
  error_count: number;
  warning_count: number;
  validation_errors: ValidationIssue[];
  error_message: string | null;
  non_empty_override: boolean;
  notes: string | null;
  rollback_manifest?: MigrationRollbackManifest | null;
  rollback_expires_at?: string | null;
  reverted_at?: string | null;
  reverted_by?: string | null;
  reverted_by_email?: string | null;
}

export interface UndoMigrationSummary {
  batchId?: string | null;
  deletedProducts: number;
  restoredProducts: number;
  deletedMembers: number;
  restoredMembers: number;
  deletedSubscriptions: number;
  deletedCards: number;
  restoredCards: number;
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

/**
 * Resolves valid CSV rows + SuperAdmin duplicate choices (Ignore vs Overwrite)
 * into a concrete, deterministic execution plan.
 */
export async function resolveMigrationBatch(
  parsed: ParsedMigrationResult,
  resolutions?: Record<string, DuplicateAction>
): Promise<ResolvedMigrationPlan> {
  const effectiveRes = resolutions ?? parsed.defaultResolutions;
  const conflictMap = new Map<string, DuplicateConflict>();
  parsed.conflicts.forEach((c) => {
    conflictMap.set(`${c.group}:${c.line}`, c);
  });

  // 1. Resolve [PRODUCTS]
  const productsToInsert: CsvProductRow[] = [];
  const overwritesByProductId = new Map<string, ProductOverwriteAction>();
  const productKeyOrigin = new Map<
    string,
    | { kind: 'insert'; idx: number }
    | { kind: 'overwrite'; targetId: string; previous: ExistingDbProduct }
    | { kind: 'ignored_db'; targetId: string; previous: ExistingDbProduct }
  >();
  let ignoredProductsCount = 0;

  for (const p of parsed.products) {
    const conflict = conflictMap.get(`PRODUCTS:${p.lineNumber}`);
    const nameKey = `name:${normalizeKey(p.product_name)}`;
    const barcodeKey = p.manufacturer_barcode
      ? `barcode:${p.manufacturer_barcode.toLowerCase()}`
      : null;

    if (!conflict) {
      const idx = productsToInsert.length;
      productsToInsert.push(p);
      productKeyOrigin.set(nameKey, { kind: 'insert', idx });
      if (barcodeKey) productKeyOrigin.set(barcodeKey, { kind: 'insert', idx });
      continue;
    }

    const action = effectiveRes[conflict.conflictKey] ?? conflict.defaultResolution;

    if (conflict.scope === 'database' && conflict.targetDbId) {
      const prev = conflict.existingSnapshot as ExistingDbProduct;
      if (action === 'ignore') {
        ignoredProductsCount++;
        productKeyOrigin.set(nameKey, {
          kind: 'ignored_db',
          targetId: conflict.targetDbId,
          previous: prev,
        });
        if (barcodeKey) {
          productKeyOrigin.set(barcodeKey, {
            kind: 'ignored_db',
            targetId: conflict.targetDbId,
            previous: prev,
          });
        }
      } else {
        overwritesByProductId.set(conflict.targetDbId, {
          targetId: conflict.targetDbId,
          incoming: p,
          previous: prev,
        });
        productKeyOrigin.set(nameKey, {
          kind: 'overwrite',
          targetId: conflict.targetDbId,
          previous: prev,
        });
        if (barcodeKey) {
          productKeyOrigin.set(barcodeKey, {
            kind: 'overwrite',
            targetId: conflict.targetDbId,
            previous: prev,
          });
        }
      }
    } else {
      // Intra-CSV duplicate
      if (action === 'ignore') {
        ignoredProductsCount++;
      } else {
        const origin =
          productKeyOrigin.get(nameKey) ||
          (barcodeKey ? productKeyOrigin.get(barcodeKey) : undefined);

        if (origin?.kind === 'insert') {
          productsToInsert[origin.idx] = p;
          productKeyOrigin.set(nameKey, { kind: 'insert', idx: origin.idx });
          if (barcodeKey) {
            productKeyOrigin.set(barcodeKey, { kind: 'insert', idx: origin.idx });
          }
        } else if (
          origin?.kind === 'overwrite' ||
          origin?.kind === 'ignored_db'
        ) {
          overwritesByProductId.set(origin.targetId, {
            targetId: origin.targetId,
            incoming: p,
            previous: origin.previous,
          });
          productKeyOrigin.set(nameKey, {
            kind: 'overwrite',
            targetId: origin.targetId,
            previous: origin.previous,
          });
          if (barcodeKey) {
            productKeyOrigin.set(barcodeKey, {
              kind: 'overwrite',
              targetId: origin.targetId,
              previous: origin.previous,
            });
          }
        } else {
          const idx = productsToInsert.length;
          productsToInsert.push(p);
          productKeyOrigin.set(nameKey, { kind: 'insert', idx });
          if (barcodeKey) {
            productKeyOrigin.set(barcodeKey, { kind: 'insert', idx });
          }
        }
      }
    }
  }

  // 2. Resolve [MEMBERS]
  const membersToInsert: CsvMemberRow[] = [];
  const overwritesByMemberId = new Map<string, MemberOverwriteAction>();
  const memberKeyOrigin = new Map<
    string,
    | { kind: 'insert'; idx: number }
    | { kind: 'overwrite'; targetMemberId: string; previous: ExistingDbMember }
    | { kind: 'ignored_db'; targetMemberId: string; previous: ExistingDbMember }
  >();
  let ignoredMembersCount = 0;

  for (const m of parsed.members) {
    const conflict = conflictMap.get(`MEMBERS:${m.lineNumber}`);
    const nameKey = `name:${normalizeKey(m.full_name)}`;
    const emailKey = m.email ? `email:${m.email.toLowerCase()}` : null;

    if (!conflict) {
      const idx = membersToInsert.length;
      membersToInsert.push(m);
      memberKeyOrigin.set(nameKey, { kind: 'insert', idx });
      if (emailKey) memberKeyOrigin.set(emailKey, { kind: 'insert', idx });
      continue;
    }

    const action = effectiveRes[conflict.conflictKey] ?? conflict.defaultResolution;

    if (conflict.scope === 'database' && conflict.targetDbId) {
      const prev = conflict.existingSnapshot as ExistingDbMember;
      if (action === 'ignore') {
        ignoredMembersCount++;
        memberKeyOrigin.set(nameKey, {
          kind: 'ignored_db',
          targetMemberId: conflict.targetDbId,
          previous: prev,
        });
        if (emailKey) {
          memberKeyOrigin.set(emailKey, {
            kind: 'ignored_db',
            targetMemberId: conflict.targetDbId,
            previous: prev,
          });
        }
      } else {
        overwritesByMemberId.set(conflict.targetDbId, {
          targetMemberId: conflict.targetDbId,
          incoming: m,
          previous: prev,
        });
        memberKeyOrigin.set(nameKey, {
          kind: 'overwrite',
          targetMemberId: conflict.targetDbId,
          previous: prev,
        });
        if (emailKey) {
          memberKeyOrigin.set(emailKey, {
            kind: 'overwrite',
            targetMemberId: conflict.targetDbId,
            previous: prev,
          });
        }
      }
    } else {
      // Intra-CSV duplicate
      if (action === 'ignore') {
        ignoredMembersCount++;
      } else {
        const origin =
          memberKeyOrigin.get(nameKey) ||
          (emailKey ? memberKeyOrigin.get(emailKey) : undefined);

        if (origin?.kind === 'insert') {
          membersToInsert[origin.idx] = m;
          memberKeyOrigin.set(nameKey, { kind: 'insert', idx: origin.idx });
          if (emailKey) {
            memberKeyOrigin.set(emailKey, { kind: 'insert', idx: origin.idx });
          }
        } else if (
          origin?.kind === 'overwrite' ||
          origin?.kind === 'ignored_db'
        ) {
          overwritesByMemberId.set(origin.targetMemberId, {
            targetMemberId: origin.targetMemberId,
            incoming: m,
            previous: origin.previous,
          });
          memberKeyOrigin.set(nameKey, {
            kind: 'overwrite',
            targetMemberId: origin.targetMemberId,
            previous: origin.previous,
          });
          if (emailKey) {
            memberKeyOrigin.set(emailKey, {
              kind: 'overwrite',
              targetMemberId: origin.targetMemberId,
              previous: origin.previous,
            });
          }
        } else {
          const idx = membersToInsert.length;
          membersToInsert.push(m);
          memberKeyOrigin.set(nameKey, { kind: 'insert', idx });
          if (emailKey) {
            memberKeyOrigin.set(emailKey, { kind: 'insert', idx });
          }
        }
      }
    }
  }

  const productsToOverwrite = Array.from(overwritesByProductId.values());
  const membersToOverwrite = Array.from(overwritesByMemberId.values());

  const activeMembersList = [
    ...membersToInsert,
    ...membersToOverwrite.map((o) => o.incoming),
  ];

  const subscriptionCount = activeMembersList.filter(
    (m) => m.plan_type !== 'none'
  ).length;
  const cardCount = activeMembersList.filter((m) => m.issue_card).length;
  const ignoredCount = ignoredProductsCount + ignoredMembersCount;
  const overwrittenCount = productsToOverwrite.length + membersToOverwrite.length;
  const insertedCount = productsToInsert.length + membersToInsert.length;

  const canonicalSha256 = await computeSha256Hex(
    JSON.stringify({
      productsToInsert,
      productsToOverwrite,
      membersToInsert,
      membersToOverwrite,
      ignoredProductsCount,
      ignoredMembersCount,
    })
  );

  return {
    productsToInsert,
    productsToOverwrite,
    membersToInsert,
    membersToOverwrite,
    ignoredProductsCount,
    ignoredMembersCount,
    ignoredCount,
    overwrittenCount,
    insertedCount,
    subscriptionCount,
    cardCount,
    canonicalSha256,
  };
}

export async function sealMigrationBatch(
  parsed: ParsedMigrationResult,
  resolutions?: Record<string, DuplicateAction>
): Promise<SealedMigrationBatch> {
  if (!parsed.isValid || parsed.errorCount > 0) {
    throw new Error('Cannot seal a migration batch that still has validation errors.');
  }

  const resolvedPlan = await resolveMigrationBatch(parsed, resolutions);

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
    schemaVersion: 3,
    rawCsvSha256: parsed.rawCsvSha256,
    canonicalSha256: resolvedPlan.canonicalSha256,
    plan: resolvedPlan,
  };

  const plaintext = JSON.stringify(canonicalObject);
  const integrityHmac = await computeSha256Hex(
    `${salt}::${parsed.rawCsvSha256}::${resolvedPlan.canonicalSha256}::${plaintext}`
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
    canonicalSha256: resolvedPlan.canonicalSha256,
    integrityHmac,
    sealedAt: new Date().toISOString(),
    productInsertCount: resolvedPlan.productsToInsert.length,
    productOverwriteCount: resolvedPlan.productsToOverwrite.length,
    memberInsertCount: resolvedPlan.membersToInsert.length,
    memberOverwriteCount: resolvedPlan.membersToOverwrite.length,
    ignoredCount: resolvedPlan.ignoredCount,
    subscriptionCount: resolvedPlan.subscriptionCount,
    cardCount: resolvedPlan.cardCount,
  };
}

export async function unsealAndVerifyMigrationBatch(
  sealed: SealedMigrationBatch
): Promise<ResolvedMigrationPlan> {
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
    const plan = decoded.plan as ResolvedMigrationPlan;
    const recomputedCanonical = await computeSha256Hex(
      JSON.stringify({
        productsToInsert: plan.productsToInsert,
        productsToOverwrite: plan.productsToOverwrite,
        membersToInsert: plan.membersToInsert,
        membersToOverwrite: plan.membersToOverwrite,
        ignoredProductsCount: plan.ignoredProductsCount,
        ignoredMembersCount: plan.ignoredMembersCount,
      })
    );

    if (
      !constantTimeEqual(recomputedCanonical, sealed.canonicalSha256) ||
      !constantTimeEqual(decoded.rawCsvSha256 || '', sealed.rawCsvSha256)
    ) {
      throw new Error('Canonical payload SHA-256 checksum mismatch detected.');
    }

    return plan;
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
    '#   3. Dates accept YYYY-MM-DD, DD/MM/YYYY, or Excel MM/DD/YYYY (e.g., 2026-11-01, 01/11/2026, or 11/1/2026). Boolean fields accept true or false.',
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

/**
 * Strips invisible zero-width Unicode chars, normalizes NBSP and curly quotes,
 * and collapses consecutive whitespace cleanly.
 */
function sanitizeCellText(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeaderKey(raw: string): string {
  return sanitizeCellText(raw)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeKey(raw: string): string {
  return sanitizeCellText(raw).toLowerCase();
}

function parseStrictBoolean(
  raw: string,
  defaultValue?: boolean
): { valid: boolean; value: boolean } {
  const clean = sanitizeCellText(raw).toLowerCase();
  if (!clean && defaultValue !== undefined) {
    return { valid: true, value: defaultValue };
  }
  if (['true', 'yes', 'y', '1', 'on', 'checked'].includes(clean)) {
    return { valid: true, value: true };
  }
  if (['false', 'no', 'n', '0', 'off', 'unchecked'].includes(clean)) {
    return { valid: true, value: false };
  }
  return { valid: false, value: false };
}

const MONTH_ABBR_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export interface FlexibleDateParseResult {
  date: Date | null;
  iso: string | null;
  detectedFormat: string | null;
  reason?:
    | 'excel_serial'
    | 'two_digit_year'
    | 'invalid_calendar'
    | 'bad_format';
}

/**
 * Flexible regex date normalizer that converts varied date formats
 * (YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, DD.MM.YYYY, YYYYMMDD, named months,
 * and Excel timestamps) into validated UTC JavaScript Date objects and canonical ISO YYYY-MM-DD
 * BEFORE schema validation runs.
 */
export function normalizeDateWithFlexibleRegex(
  rawInput: string | Date
): FlexibleDateParseResult {
  if (rawInput instanceof Date) {
    if (Number.isNaN(rawInput.getTime())) {
      return { date: null, iso: null, detectedFormat: null, reason: 'invalid_calendar' };
    }
    const y = rawInput.getUTCFullYear();
    const m = rawInput.getUTCMonth() + 1;
    const d = rawInput.getUTCDate();
    if (y < 1900 || y > 2100) {
      return { date: null, iso: null, detectedFormat: 'JS_DATE', reason: 'invalid_calendar' };
    }
    const utcDate = new Date(Date.UTC(y, m - 1, d));
    return {
      date: utcDate,
      iso: `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      detectedFormat: 'JS_DATE',
    };
  }

  let cleaned = sanitizeCellText(String(rawInput ?? ''));
  if (!cleaned) {
    return { date: null, iso: null, detectedFormat: null, reason: 'bad_format' };
  }

  // Strip trailing Excel timestamps / ISO time offsets (e.g. "2026-11-01T00:00:00Z", "14/05/1995 12:00:00 AM")
  cleaned = cleaned
    .replace(
      /(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?|\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)$/i,
      ''
    )
    .trim();

  let year: number | null = null;
  let month: number | null = null;
  let day: number | null = null;
  let detectedFormat: string | null = null;

  // Compact 8-digit ISO: YYYYMMDD (e.g. 20261114)
  const compactMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(cleaned);
  if (
    compactMatch &&
    Number(compactMatch[1]) >= 1900 &&
    Number(compactMatch[1]) <= 2100
  ) {
    year = Number(compactMatch[1]);
    month = Number(compactMatch[2]);
    day = Number(compactMatch[3]);
    detectedFormat = 'YYYYMMDD';
  } else if (/^\d{4,6}(\.\d+)?$/.test(cleaned)) {
    // Raw unformatted Excel serial number (e.g., 46327)
    return { date: null, iso: null, detectedFormat: null, reason: 'excel_serial' };
  }

  // Pattern 1: Year-first YYYY-MM-DD / YYYY/M/D / YYYY.M.D
  if (year === null) {
    const ymdMatch = /^(\d{4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,2})$/.exec(
      cleaned
    );
    if (ymdMatch) {
      year = Number(ymdMatch[1]);
      month = Number(ymdMatch[2]);
      day = Number(ymdMatch[3]);
      detectedFormat = 'YYYY-MM-DD';
    }
  }

  // Pattern 2: Day/Month-first DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD.MM.YYYY
  if (year === null) {
    const dmyOrMdyMatch =
      /^(\d{1,2})\s*([-/.])\s*(\d{1,2})\s*[-/.]\s*(\d{4})$/.exec(cleaned);
    if (dmyOrMdyMatch) {
      const p1 = Number(dmyOrMdyMatch[1]);
      const sep = dmyOrMdyMatch[2];
      const p2 = Number(dmyOrMdyMatch[3]);
      const y = Number(dmyOrMdyMatch[4]);

      if (p1 > 12 && p2 >= 1 && p2 <= 12) {
        day = p1;
        month = p2;
        year = y;
        detectedFormat = `DD${sep}MM${sep}YYYY`;
      } else if (p2 > 12 && p1 >= 1 && p1 <= 12) {
        month = p1;
        day = p2;
        year = y;
        detectedFormat = `MM${sep}DD${sep}YYYY`;
      } else if (sep === '.') {
        day = p1;
        month = p2;
        year = y;
        detectedFormat = 'DD.MM.YYYY';
      } else {
        // Default to US Excel M/D/YYYY when both segments <= 12
        month = p1;
        day = p2;
        year = y;
        detectedFormat = `MM${sep}DD${sep}YYYY`;
      }
    }
  }

  // Pattern 3: 2-digit year ambiguity (5/14/95 or 14/05/95)
  if (year === null && /^\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2}$/.test(cleaned)) {
    return {
      date: null,
      iso: null,
      detectedFormat: null,
      reason: 'two_digit_year',
    };
  }

  // Pattern 4: YYYY-May-14 or 14-May-1995 / 14 May 1995 / May 14, 1995
  if (year === null) {
    const ymdNamed = /^(\d{4})[\s-]+([A-Za-z]+)[\s-]+(\d{1,2})$/.exec(cleaned);
    if (ymdNamed && MONTH_ABBR_MAP[ymdNamed[2].toLowerCase()]) {
      year = Number(ymdNamed[1]);
      month = MONTH_ABBR_MAP[ymdNamed[2].toLowerCase()];
      day = Number(ymdNamed[3]);
      detectedFormat = 'YYYY-MMM-DD';
    }
  }

  if (year === null) {
    const dmyNamed = /^(\d{1,2})[\s-]+([A-Za-z]+)[\s,-]+(\d{4})$/.exec(
      cleaned
    );
    if (dmyNamed && MONTH_ABBR_MAP[dmyNamed[2].toLowerCase()]) {
      day = Number(dmyNamed[1]);
      month = MONTH_ABBR_MAP[dmyNamed[2].toLowerCase()];
      year = Number(dmyNamed[3]);
      detectedFormat = 'DD-MMM-YYYY';
    }
  }

  if (year === null) {
    const mdyNamed = /^([A-Za-z]+)[\s-]+(\d{1,2}),?[\s-]+(\d{4})$/.exec(
      cleaned
    );
    if (mdyNamed && MONTH_ABBR_MAP[mdyNamed[1].toLowerCase()]) {
      month = MONTH_ABBR_MAP[mdyNamed[1].toLowerCase()];
      day = Number(mdyNamed[2]);
      year = Number(mdyNamed[3]);
      detectedFormat = 'MMM DD, YYYY';
    }
  }

  if (year === null || month === null || day === null) {
    return { date: null, iso: null, detectedFormat: null, reason: 'bad_format' };
  }

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return {
      date: null,
      iso: null,
      detectedFormat,
      reason: 'invalid_calendar',
    };
  }

  // Construct standard JS Date object in UTC and verify exact calendar round-trip
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return {
      date: null,
      iso: null,
      detectedFormat,
      reason: 'invalid_calendar',
    };
  }

  return {
    date: dt,
    iso: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    detectedFormat,
  };
}

function normalizeCsvDateSmart(rawDate: string): FlexibleDateParseResult {
  return normalizeDateWithFlexibleRegex(rawDate);
}

function formatDateErrorReason(
  fieldLabel: string,
  rawVal: string,
  reason?: FlexibleDateParseResult['reason']
): string {
  switch (reason) {
    case 'excel_serial':
      return `Invalid ${fieldLabel} "${rawVal}" (raw Excel serial number). Format the column as Short Date or YYYY-MM-DD in Excel.`;
    case 'two_digit_year':
      return `Invalid ${fieldLabel} "${rawVal}". Use a 4-digit year (YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY).`;
    case 'invalid_calendar':
      return `Invalid calendar date "${rawVal}" for ${fieldLabel}. Check day/month/leap year.`;
    default:
      return `Invalid ${fieldLabel} "${rawVal}". Supported formats: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, or DD-MMM-YYYY.`;
  }
}

function parseSmartPrice(raw: string): {
  valid: boolean;
  value: number;
  error?: string;
} {
  const cleaned = sanitizeCellText(raw)
    .replace(/^(?:PHP|₱|\$|P)\s*/i, '')
    .replace(/,/g, '')
    .trim();

  if (!cleaned) {
    return { valid: false, value: 0, error: 'Selling Price is required.' };
  }
  if (/^-/.test(cleaned)) {
    return {
      valid: false,
      value: 0,
      error: `Selling Price "${raw}" cannot be negative.`,
    };
  }
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return {
      valid: false,
      value: 0,
      error: `Invalid Selling Price "${raw}". Use a clean positive number (e.g., 65.00).`,
    };
  }
  const decimals = cleaned.split('.')[1];
  if (decimals && decimals.length > 2 && /[1-9]/.test(decimals.slice(2))) {
    return {
      valid: false,
      value: 0,
      error: `Selling Price "${raw}" has more than 2 decimal places.`,
    };
  }
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num <= 0 || num > 999999.99) {
    return {
      valid: false,
      value: 0,
      error: 'Selling Price must be between 0.01 and 999,999.99.',
    };
  }
  return { valid: true, value: Number(num.toFixed(2)) };
}

function parseSmartInteger(raw: string): { valid: boolean; value: number } {
  const cleaned = sanitizeCellText(raw).replace(/,/g, '').trim();
  if (!cleaned || !/^\d+$/.test(cleaned)) {
    return { valid: false, value: 0 };
  }
  const parsed = parseInt(cleaned, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { valid: false, value: 0 };
  }
  return { valid: true, value: parsed };
}

function hasControlChars(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) return true;
  }
  return false;
}

function hasDangerousFormulaPrefix(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  return /^[=@+]/.test(trimmed);
}

function isExcelScientificNotation(str: string): boolean {
  return /^\d+(\.\d+)?[eE][+-]?\d+$/.test(str.trim());
}

/**
 * Verifies live cash session status from Supabase directly
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
 * Fetches live database snapshot with full existing product/member rows
 * to power Duplicate Detection, Overwrite/Ignore comparison, and Pre-Overwrite Undo snapshots.
 */
export async function fetchMigrationDbSnapshot(): Promise<ExistingDbSnapshot> {
  const [prodRes, binProdRes, memRes] = await Promise.all([
    supabase
      .from('products')
      .select(
        'id, product_name, selling_price, has_stock_limit, stock_quantity, low_stock_alert, manufacturer_barcode, status'
      )
      .is('deleted_at', null),
    supabase
      .from('products')
      .select('manufacturer_barcode')
      .not('deleted_at', 'is', null),
    supabase
      .from('members')
      .select(
        'member_id, full_name, phone, email, gender, birthday, address, status, notes'
      )
      .is('deleted_at', null),
  ]);

  if (prodRes.error) throw prodRes.error;
  if (memRes.error) throw memRes.error;

  const activeProductNames = new Set<string>();
  const activeBarcodes = new Set<string>();
  const recycleBinBarcodes = new Set<string>();
  const activeMemberNames = new Set<string>();
  const activeMemberEmails = new Set<string>();

  const activeProductsByName = new Map<string, ExistingDbProduct>();
  const activeProductsByBarcode = new Map<string, ExistingDbProduct>();
  const activeMembersByName = new Map<string, ExistingDbMember>();
  const activeMembersByEmail = new Map<string, ExistingDbMember>();

  (prodRes.data || []).forEach((p: any) => {
    const prodRecord: ExistingDbProduct = {
      id: p.id,
      product_name: p.product_name,
      selling_price: Number(p.selling_price ?? 0),
      has_stock_limit: Boolean(p.has_stock_limit),
      stock_quantity: Number(p.stock_quantity ?? 0),
      low_stock_alert:
        p.low_stock_alert !== null && p.low_stock_alert !== undefined
          ? Number(p.low_stock_alert)
          : null,
      manufacturer_barcode: p.manufacturer_barcode || null,
      status: p.status || 'Active',
    };

    if (p.product_name) {
      const k = normalizeKey(String(p.product_name));
      activeProductNames.add(k);
      activeProductsByName.set(k, prodRecord);
    }
    if (p.manufacturer_barcode) {
      const bk = String(p.manufacturer_barcode).trim().toLowerCase();
      activeBarcodes.add(bk);
      activeProductsByBarcode.set(bk, prodRecord);
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
    const memRecord: ExistingDbMember = {
      member_id: m.member_id,
      full_name: m.full_name,
      phone: m.phone || 'No Phone',
      email: m.email || null,
      gender: m.gender || 'Male',
      birthday: m.birthday || null,
      address: m.address || null,
      status: m.status || 'Active',
      notes: m.notes || null,
    };

    if (m.full_name) {
      const nk = normalizeKey(String(m.full_name));
      activeMemberNames.add(nk);
      activeMembersByName.set(nk, memRecord);
    }
    if (m.email) {
      const ek = String(m.email).trim().toLowerCase();
      activeMemberEmails.add(ek);
      activeMembersByEmail.set(ek, memRecord);
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
    activeProductsByName,
    activeProductsByBarcode,
    activeMembersByName,
    activeMembersByEmail,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Parses and deeply validates the Unified Two-Group CSV ([PRODUCTS] + [MEMBERS]),
 * applying smart normalization to reduce false log noise while detecting subtle
 * mistakes and surfacing CSV / Database duplicates for Overwrite or Ignore control.
 */
export async function parseAndValidateMigrationCsv(
  rawCsvText: string,
  dbSnapshot: ExistingDbSnapshot
): Promise<ParsedMigrationResult> {
  const issues: ValidationIssue[] = [];
  const conflicts: DuplicateConflict[] = [];
  const defaultResolutions: Record<string, DuplicateAction> = {};
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
      conflicts,
      defaultResolutions,
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
  fatalErrors.slice(0, 25).forEach((msg) => {
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
    if (trimmedCells.length === 0) continue;

    const firstCell = sanitizeCellText(trimmedCells[0]);

    if (firstCell.startsWith('#')) continue;

    // Group Marker detection (tolerates minor whitespace or singular typo [PRODUCT] / [MEMBER])
    if (/^\[.+\]$/.test(firstCell) && trimmedCells.length === 1) {
      const markerUpper = firstCell.replace(/\s+/g, '').toUpperCase();
      if (markerUpper === '[PRODUCTS]' || markerUpper === '[PRODUCT]') {
        if (seenProductsSection) {
          issues.push({
            severity: 'error',
            group: 'FILE',
            line: row.lineNumber,
            message:
              'Duplicate [PRODUCTS] group section found. Only one [PRODUCTS] section is allowed.',
          });
        }
        seenProductsSection = true;
        currentSection = 'PRODUCTS';
        productHeaderMap = null;
        continue;
      }

      if (markerUpper === '[MEMBERS]' || markerUpper === '[MEMBER]') {
        if (seenMembersSection) {
          issues.push({
            severity: 'error',
            group: 'FILE',
            line: row.lineNumber,
            message:
              'Duplicate [MEMBERS] group section found. Only one [MEMBERS] section is allowed.',
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
          const clean = normalizeHeaderKey(h);
          if (clean && !map.has(clean)) map.set(clean, idx);
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
          const clean = normalizeHeaderKey(h);
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
          const clean = normalizeHeaderKey(h);
          if (clean && !map.has(clean)) map.set(clean, idx);
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
          const clean = normalizeHeaderKey(h);
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

  // Validate [PRODUCTS]
  const parsedProducts: CsvProductRow[] = [];
  const csvProductNames = new Map<string, { line: number; row: CsvProductRow }>();
  const csvBarcodes = new Map<string, { line: number; row: CsvProductRow }>();
  let sampleProductRowsCount = 0;

  const getProdCell = (cells: string[], col: string): string => {
    const idx = productHeaderMap?.get(col);
    return idx !== undefined && idx < cells.length
      ? sanitizeCellText(cells[idx])
      : '';
  };

  for (const row of productRawRows) {
    const line = row.lineNumber;
    const expectedWidth = PRODUCT_HEADERS.length;
    const extraNonEmpty = row.cells
      .slice(expectedWidth)
      .some((c) => sanitizeCellText(c) !== '');
    if (extraNonEmpty) {
      issues.push({
        severity: 'error',
        group: 'PRODUCTS',
        line,
        message: `Row has unexpected extra column values past the ${expectedWidth} [PRODUCTS] columns. Wrap text with commas in double quotes.`,
      });
    }

    const rawName = getProdCell(row.cells, 'product_name');
    const rawPrice = getProdCell(row.cells, 'selling_price');
    const rawHasLimit = getProdCell(row.cells, 'has_stock_limit');
    const rawStockQty = getProdCell(row.cells, 'stock_quantity');
    const rawLowAlert = getProdCell(row.cells, 'low_stock_alert');
    const rawBarcode = getProdCell(row.cells, 'manufacturer_barcode');
    const rawStatus = getProdCell(row.cells, 'status');

    let rowValid = !extraNonEmpty;
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
      if (/^\d+$/.test(rawName)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'product_name',
          identifier: rawName,
          message:
            'Product Name cannot be purely numeric (did a barcode get shifted into product_name?).',
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
          message:
            'Product Name contains forbidden control characters or spreadsheet formula prefix (=, +, @).',
        });
        rowValid = false;
      }
      if (rawName.toUpperCase().startsWith('SAMPLE -')) {
        sampleProductRowsCount++;
      }
    }

    // Price validation (auto-normalizes ₱, $, commas)
    const priceRes = parseSmartPrice(rawPrice);
    if (!priceRes.valid) {
      issues.push({
        severity: 'error',
        group: 'PRODUCTS',
        line,
        field: 'selling_price',
        identifier: idLabel,
        message: priceRes.error || 'Invalid Selling Price.',
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
      const stockRes = parseSmartInteger(rawStockQty);
      if (!stockRes.valid) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'stock_quantity',
          identifier: idLabel,
          message:
            'stock_quantity must be a whole non-negative integer when has_stock_limit=true.',
        });
        rowValid = false;
      } else {
        stockQty = stockRes.value;
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
        const alertRes = parseSmartInteger(rawLowAlert);
        if (!alertRes.valid) {
          issues.push({
            severity: 'error',
            group: 'PRODUCTS',
            line,
            field: 'low_stock_alert',
            identifier: idLabel,
            message:
              'low_stock_alert must be a non-negative integer or blank.',
          });
          rowValid = false;
        } else {
          lowStockAlert = alertRes.value;
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
              message: `low_stock_alert (${lowStockAlert}) >= stock_quantity (${stockQty}); item will immediately flag Low Stock.`,
            });
          }
        }
      }
    }

    // Barcode validation (catches Excel scientific notation & spaces cleanly)
    let cleanBarcode: string | null = rawBarcode || null;
    if (cleanBarcode) {
      if (isExcelScientificNotation(cleanBarcode)) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'manufacturer_barcode',
          identifier: idLabel,
          message: `Barcode "${cleanBarcode}" was converted to scientific notation by Excel. Format this column as Text in Excel to keep all digits.`,
        });
        rowValid = false;
      } else {
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
            message:
              'manufacturer_barcode contains invalid characters or spaces (only letters, numbers, hyphens, underscores, periods allowed).',
          });
          rowValid = false;
        }
      }
    }

    // Status validation (smart aliases normalized silently)
    let productStatus: 'Active' | 'Inactive' = 'Active';
    if (rawStatus) {
      const lowerSt = rawStatus.toLowerCase();
      if (['active', 'enabled', 'available', '1'].includes(lowerSt)) {
        productStatus = 'Active';
      } else if (['inactive', 'disabled', 'archived', '0'].includes(lowerSt)) {
        productStatus = 'Inactive';
      } else {
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
      const productRow: CsvProductRow = {
        lineNumber: line,
        product_name: rawName,
        selling_price: priceRes.value,
        has_stock_limit: limitParsed.value,
        stock_quantity: limitParsed.value ? stockQty : 0,
        low_stock_alert: limitParsed.value ? lowStockAlert : null,
        manufacturer_barcode: cleanBarcode,
        status: productStatus,
      };

      const nameKey = normalizeKey(rawName);
      const barcodeKey = cleanBarcode ? cleanBarcode.toLowerCase() : null;

      // Cross-check DB collision by name & barcode
      const dbByName = dbSnapshot.activeProductsByName.get(nameKey);
      const dbByBarcode = barcodeKey
        ? dbSnapshot.activeProductsByBarcode.get(barcodeKey)
        : undefined;

      if (dbByName && dbByBarcode && dbByName.id !== dbByBarcode.id) {
        issues.push({
          severity: 'error',
          group: 'PRODUCTS',
          line,
          field: 'manufacturer_barcode',
          identifier: rawName,
          message: `Conflict mismatch: Name matches DB product "${dbByName.product_name}" while barcode "${cleanBarcode}" belongs to a different product ("${dbByBarcode.product_name}").`,
        });
        continue;
      }

      const dbMatch = dbByName || dbByBarcode;
      const incomingSummary = `₱${productRow.selling_price.toFixed(2)} • ${
        productRow.has_stock_limit
          ? `Stock: ${productRow.stock_quantity}`
          : 'Unlimited'
      }${productRow.manufacturer_barcode ? ` • Barcode: ${productRow.manufacturer_barcode}` : ''} • ${productRow.status}`;

      if (dbMatch) {
        const conflictKey = `PRODUCTS:DB:${line}`;
        const existingSummary = `₱${dbMatch.selling_price.toFixed(2)} • ${
          dbMatch.has_stock_limit
            ? `Stock: ${dbMatch.stock_quantity}`
            : 'Unlimited'
        }${dbMatch.manufacturer_barcode ? ` • Barcode: ${dbMatch.manufacturer_barcode}` : ''} • ${dbMatch.status}`;

        conflicts.push({
          conflictKey,
          scope: 'database',
          group: 'PRODUCTS',
          line,
          matchedBy: dbByName ? 'product_name' : 'manufacturer_barcode',
          identifier: rawName,
          targetDbId: dbMatch.id,
          existingSnapshot: dbMatch,
          existingSummary,
          incomingSummary,
          defaultResolution: 'ignore',
        });
        defaultResolutions[conflictKey] = 'ignore';
      } else {
        // Check Intra-CSV duplicate
        const csvNameMatch = csvProductNames.get(nameKey);
        const csvBarcodeMatch = barcodeKey
          ? csvBarcodes.get(barcodeKey)
          : undefined;
        const csvMatch = csvNameMatch || csvBarcodeMatch;

        if (csvMatch) {
          const conflictKey = `PRODUCTS:CSV:${line}`;
          const prev = csvMatch.row;
          conflicts.push({
            conflictKey,
            scope: 'csv',
            group: 'PRODUCTS',
            line,
            matchedBy: csvNameMatch ? 'product_name' : 'manufacturer_barcode',
            identifier: rawName,
            earlierCsvLine: csvMatch.line,
            existingSummary: `Line ${csvMatch.line}: ₱${prev.selling_price.toFixed(2)} • ${
              prev.has_stock_limit ? `Stock: ${prev.stock_quantity}` : 'Unlimited'
            }${prev.manufacturer_barcode ? ` • ${prev.manufacturer_barcode}` : ''}`,
            incomingSummary,
            defaultResolution: 'ignore',
          });
          defaultResolutions[conflictKey] = 'ignore';
        }
      }

      if (!csvProductNames.has(nameKey)) {
        csvProductNames.set(nameKey, { line, row: productRow });
      }
      if (barcodeKey && !csvBarcodes.has(barcodeKey)) {
        csvBarcodes.set(barcodeKey, { line, row: productRow });
      }

      if (barcodeKey && dbSnapshot.recycleBinBarcodes.has(barcodeKey)) {
        issues.push({
          severity: 'warning',
          group: 'PRODUCTS',
          line,
          field: 'manufacturer_barcode',
          identifier: idLabel,
          message: `Barcode "${cleanBarcode}" also exists inside the Product Recycle Bin (active index allows reuse, or purge bin if needed).`,
        });
      }

      parsedProducts.push(productRow);
    }
  }

  if (sampleProductRowsCount > 0) {
    issues.push({
      severity: 'warning',
      group: 'PRODUCTS',
      line: productRawRows[0]?.lineNumber || 1,
      field: 'product_name',
      message: `${sampleProductRowsCount} product row(s) carry the "SAMPLE -" template prefix. Confirm before committing.`,
    });
  }

  // Validate [MEMBERS]
  const parsedMembers: CsvMemberRow[] = [];
  const csvMemberNames = new Map<string, { line: number; row: CsvMemberRow }>();
  const csvMemberEmails = new Map<string, { line: number; row: CsvMemberRow }>();
  let sampleMemberRowsCount = 0;

  const getMemCell = (cells: string[], col: string): string => {
    const idx = memberHeaderMap?.get(col);
    return idx !== undefined && idx < cells.length
      ? sanitizeCellText(cells[idx])
      : '';
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const minReasonableBirthYear = new Date().getUTCFullYear() - 3;

  for (const row of memberRawRows) {
    const line = row.lineNumber;
    const expectedWidth = MEMBER_HEADERS.length;
    const extraNonEmpty = row.cells
      .slice(expectedWidth)
      .some((c) => sanitizeCellText(c) !== '');
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

    let rowValid = !extraNonEmpty;
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
          message:
            'full_name cannot be purely numeric (check column alignment).',
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
          message:
            'full_name contains forbidden control characters or formula prefix (=, +, @).',
        });
        rowValid = false;
      }
      if (normalizedName.startsWith('SAMPLE -')) {
        sampleMemberRowsCount++;
      }
    }

    // Smart Phone validation (handles Excel leading-0 drop on PH 9xxxxxxxxx & scientific notation)
    let cleanPhone = 'No Phone';
    const phoneLower = rawPhone.toLowerCase();
    if (
      rawPhone &&
      !['no phone', 'none', 'n/a', 'na', '-', '0'].includes(phoneLower)
    ) {
      if (isExcelScientificNotation(rawPhone)) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'phone',
          identifier: idLabel,
          message: `Phone "${rawPhone}" was converted to scientific notation by Excel. Format Phone column as Text in Excel.`,
        });
        rowValid = false;
      } else {
        let candidatePhone = rawPhone;
        if (/^9\d{9}$/.test(candidatePhone)) {
          candidatePhone = `0${candidatePhone}`;
        }
        const digitCount = candidatePhone.replace(/\D/g, '').length;
        if (
          candidatePhone.length < 7 ||
          candidatePhone.length > 20 ||
          digitCount < 7
        ) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line,
            field: 'phone',
            identifier: idLabel,
            message: `Invalid phone "${rawPhone}". Must contain 7–20 characters (at least 7 digits), or leave blank / "No Phone".`,
          });
          rowValid = false;
        } else if (!/^[0-9+\-\s()]+$/.test(candidatePhone)) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line,
            field: 'phone',
            identifier: idLabel,
            message:
              'phone contains invalid characters (only digits, +, -, spaces, parentheses allowed).',
          });
          rowValid = false;
        } else {
          cleanPhone = candidatePhone;
        }
      }
    }

    // Email validation
    let cleanEmail: string | null = rawEmail ? rawEmail.toLowerCase() : null;
    if (cleanEmail) {
      if (
        cleanEmail.length > 120 ||
        /\s/.test(cleanEmail) ||
        cleanEmail.includes('..') ||
        !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(cleanEmail)
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
      }
    }

    // Gender validation (silently normalizes M/F/Male/Female/Other)
    let genderVal: 'Male' | 'Female' | 'Other' = 'Male';
    if (rawGender) {
      const gLower = rawGender.toLowerCase();
      if (['male', 'm', 'boy', 'man'].includes(gLower)) genderVal = 'Male';
      else if (['female', 'f', 'girl', 'woman'].includes(gLower))
        genderVal = 'Female';
      else if (['other', 'nb', 'non-binary', 'nonbinary'].includes(gLower))
        genderVal = 'Other';
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

    // Birthday validation (normalized into JS Date object prior to range checks)
    let birthdayVal: string | null = null;
    if (rawBirthday) {
      const bdayRes = normalizeCsvDateSmart(rawBirthday);
      if (!bdayRes.date || !bdayRes.iso) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'birthday',
          identifier: idLabel,
          message: formatDateErrorReason('birthday', rawBirthday, bdayRes.reason),
        });
        rowValid = false;
      } else {
        const minBirthDate = new Date(Date.UTC(1920, 0, 1));
        const maxBirthDate = new Date(`${todayIso}T23:59:59Z`);
        if (bdayRes.date < minBirthDate || bdayRes.date > maxBirthDate) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line,
            field: 'birthday',
            identifier: idLabel,
            message: `Birthday "${rawBirthday}" (${bdayRes.iso}) is out of valid range (1920-01-01 to today).`,
          });
          rowValid = false;
        } else if (bdayRes.date.getUTCFullYear() > minReasonableBirthYear) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line,
            field: 'birthday',
            identifier: idLabel,
            message: `Birthday "${rawBirthday}" (${bdayRes.iso}) makes member under 3 years old — did you place a subscription date in birthday?`,
          });
          rowValid = false;
        } else {
          birthdayVal = bdayRes.iso;
        }
      }
    }

    // Address validation
    const cleanAddress = rawAddress || null;
    if (
      cleanAddress &&
      (cleanAddress.length > 300 || hasDangerousFormulaPrefix(cleanAddress))
    ) {
      issues.push({
        severity: 'error',
        group: 'MEMBERS',
        line,
        field: 'address',
        identifier: idLabel,
        message:
          'Address exceeds 300 characters or begins with restricted formula character.',
      });
      rowValid = false;
    }

    // Plan type & dates (silently normalizes smart aliases)
    let planType: 'none' | 'monthly' | 'yearly' = 'none';
    if (rawPlanType) {
      const pLower = rawPlanType.toLowerCase();
      if (['none', 'profile', 'profile only', 'no plan', '-'].includes(pLower)) {
        planType = 'none';
      } else if (['monthly', 'month', '1m', '30d'].includes(pLower)) {
        planType = 'monthly';
      } else if (
        ['yearly', 'annual', 'year', '1y', '12m', '365d'].includes(pLower)
      ) {
        planType = 'yearly';
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

    let startDateVal: string | null = null;
    let endDateVal: string | null = null;

    if (planType !== 'none') {
      const startRes = rawStartDate
        ? normalizeCsvDateSmart(rawStartDate)
        : { date: null, iso: null, detectedFormat: null, reason: 'bad_format' as const };
      const endRes = rawEndDate
        ? normalizeCsvDateSmart(rawEndDate)
        : { date: null, iso: null, detectedFormat: null, reason: 'bad_format' as const };

      if (!startRes.date || !startRes.iso) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'start_date',
          identifier: idLabel,
          message: rawStartDate
            ? formatDateErrorReason('start_date', rawStartDate, startRes.reason)
            : `Valid start_date (YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY) is required for "${planType}" plan.`,
        });
        rowValid = false;
      } else {
        startDateVal = startRes.iso;
      }

      if (!endRes.date || !endRes.iso) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'end_date',
          identifier: idLabel,
          message: rawEndDate
            ? formatDateErrorReason('end_date', rawEndDate, endRes.reason)
            : `Valid end_date (YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY) is required for "${planType}" plan.`,
        });
        rowValid = false;
      } else {
        endDateVal = endRes.iso;
      }

      if (startRes.date && endRes.date && startDateVal && endDateVal) {
        const diffDays = Math.round(
          (endRes.date.getTime() - startRes.date.getTime()) /
            (1000 * 60 * 60 * 24)
        );

        if (diffDays <= 0) {
          issues.push({
            severity: 'error',
            group: 'MEMBERS',
            line,
            field: 'end_date',
            identifier: idLabel,
            message: `end_date (${endDateVal}) must be strictly after start_date (${startDateVal}).`,
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
      if (['qr', 'qr code', 'qrcode'].includes(cLower)) cardTypeVal = 'QR';
      else if (['manual', 'manual id', 'id card'].includes(cLower))
        cardTypeVal = 'Manual';
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
    }

    // Member status
    let memberStatus: 'Active' | 'Suspended' = 'Active';
    if (rawStatus) {
      const stLower = rawStatus.toLowerCase();
      if (['active', 'enabled'].includes(stLower)) memberStatus = 'Active';
      else if (['suspended', 'inactive', 'blocked', 'banned'].includes(stLower))
        memberStatus = 'Suspended';
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
        message:
          'Notes exceed 500 characters or begin with restricted formula character.',
      });
      rowValid = false;
    }

    if (rowValid) {
      const memberRow: CsvMemberRow = {
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
      };

      const nameKey = normalizeKey(normalizedName);
      const emailKey = cleanEmail ? cleanEmail.toLowerCase() : null;

      const dbByName = dbSnapshot.activeMembersByName.get(nameKey);
      const dbByEmail = emailKey
        ? dbSnapshot.activeMembersByEmail.get(emailKey)
        : undefined;

      if (dbByName && dbByEmail && dbByName.member_id !== dbByEmail.member_id) {
        issues.push({
          severity: 'error',
          group: 'MEMBERS',
          line,
          field: 'email',
          identifier: normalizedName,
          message: `Conflict mismatch: Name matches DB member "${dbByName.full_name}" while email "${cleanEmail}" belongs to "${dbByEmail.full_name}".`,
        });
        continue;
      }

      const dbMatch = dbByName || dbByEmail;
      const incomingSummary = `${memberRow.phone}${
        memberRow.email ? ` • ${memberRow.email}` : ''
      } • ${
        memberRow.plan_type !== 'none'
          ? `${memberRow.plan_type.toUpperCase()} (${memberRow.start_date} → ${memberRow.end_date})`
          : 'Profile Only'
      }`;

      if (dbMatch) {
        const conflictKey = `MEMBERS:DB:${line}`;
        const existingSummary = `${dbMatch.phone}${
          dbMatch.email ? ` • ${dbMatch.email}` : ''
        } • ${dbMatch.status}`;

        conflicts.push({
          conflictKey,
          scope: 'database',
          group: 'MEMBERS',
          line,
          matchedBy: dbByName ? 'full_name' : 'email',
          identifier: normalizedName,
          targetDbId: dbMatch.member_id,
          existingSnapshot: dbMatch,
          existingSummary,
          incomingSummary,
          defaultResolution: 'ignore',
        });
        defaultResolutions[conflictKey] = 'ignore';
      } else {
        const csvNameMatch = csvMemberNames.get(nameKey);
        const csvEmailMatch = emailKey
          ? csvMemberEmails.get(emailKey)
          : undefined;
        const csvMatch = csvNameMatch || csvEmailMatch;

        if (csvMatch) {
          const conflictKey = `MEMBERS:CSV:${line}`;
          const prev = csvMatch.row;
          conflicts.push({
            conflictKey,
            scope: 'csv',
            group: 'MEMBERS',
            line,
            matchedBy: csvNameMatch ? 'full_name' : 'email',
            identifier: normalizedName,
            earlierCsvLine: csvMatch.line,
            existingSummary: `Line ${csvMatch.line}: ${prev.phone}${
              prev.email ? ` • ${prev.email}` : ''
            } • ${prev.plan_type.toUpperCase()}`,
            incomingSummary,
            defaultResolution: 'ignore',
          });
          defaultResolutions[conflictKey] = 'ignore';
        }
      }

      if (!csvMemberNames.has(nameKey)) {
        csvMemberNames.set(nameKey, { line, row: memberRow });
      }
      if (emailKey && !csvMemberEmails.has(emailKey)) {
        csvMemberEmails.set(emailKey, { line, row: memberRow });
      }

      parsedMembers.push(memberRow);
    }
  }

  if (sampleMemberRowsCount > 0) {
    issues.push({
      severity: 'warning',
      group: 'MEMBERS',
      line: memberRawRows[0]?.lineNumber || 1,
      field: 'full_name',
      message: `${sampleMemberRowsCount} member row(s) carry the "SAMPLE -" template prefix. Confirm before committing.`,
    });
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
    conflicts,
    defaultResolutions,
    issues,
    errorCount,
    warningCount,
    subscriptionCount,
    cardCount,
    rawCsvSha256,
    canonicalSha256,
    isValid:
      errorCount === 0 &&
      (parsedProducts.length > 0 || parsedMembers.length > 0),
  };
}

export function generateMigrationBatchId(canonicalSha256: string): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const hashPart = (canonicalSha256 || '00000000').slice(0, 8).toUpperCase();
  const randPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MIG-${datePart}-${hashPart}-${randPart}`;
}

async function detectMigrationBatchIdColumns(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('products')
      .select('migration_batch_id')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Executes the sealed & verified migration batch (supporting Inserts, Overwrites,
 * and Ignores) and builds a complete 24-hour Rollback Manifest tagged with a unique `batchId`.
 */
export async function executeSecuredCsvMigration(params: {
  sealedBatch: SealedMigrationBatch;
  actorEmail?: string | null;
  actorId?: string | null;
  nonEmptyOverride: boolean;
  onProgress?: (percent: number, stageLabel: string) => void;
}): Promise<MigrationExecutionSummary> {
  const { sealedBatch, actorEmail, actorId, nonEmptyOverride, onProgress } =
    params;

  if (!isSuperAdmin(actorEmail)) {
    await logAudit(
      'LEGACY_CSV_MIGRATION_BLOCKED',
      `Blocked unauthorized CSV migration execution attempt by non-SuperAdmin (${actorEmail || 'unknown'}).`,
      actorId || undefined
    );
    throw new Error(
      'Access denied. Exclusively restricted to assigned SuperAdmin.'
    );
  }

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

  const liveSnapshot = await fetchMigrationDbSnapshot();
  const hasExistingData =
    liveSnapshot.activeProductCount > 0 || liveSnapshot.activeMemberCount > 0;
  if (hasExistingData && !nonEmptyOverride) {
    throw new Error(
      'Database is not empty. Explicit SuperAdmin acknowledgement is required to proceed.'
    );
  }

  onProgress?.(5, 'Verifying AES-GCM & SHA-256 payload integrity...');
  let plan: ResolvedMigrationPlan;
  try {
    plan = await unsealAndVerifyMigrationBatch(sealedBatch);
  } catch (tamperErr: any) {
    await logAudit(
      'LEGACY_CSV_MIGRATION_TAMPER_ALERT',
      `Migration aborted due to payload integrity failure: ${tamperErr.message}`,
      actorId || undefined
    );
    throw tamperErr;
  }

  if (
    plan.productsToInsert.length === 0 &&
    plan.productsToOverwrite.length === 0 &&
    plan.membersToInsert.length === 0 &&
    plan.membersToOverwrite.length === 0
  ) {
    throw new Error(
      'All duplicate rows were set to Ignore, leaving 0 records to insert or overwrite.'
    );
  }

  // Re-verify pre-commit collisions for NEW inserts only
  for (const p of plan.productsToInsert) {
    if (liveSnapshot.activeProductsByName.has(normalizeKey(p.product_name))) {
      throw new Error(
        `Pre-commit collision: Product "${p.product_name}" was added to DB during review. Re-import CSV to update duplicate choices.`
      );
    }
    if (
      p.manufacturer_barcode &&
      liveSnapshot.activeBarcodes.has(p.manufacturer_barcode.toLowerCase())
    ) {
      throw new Error(
        `Pre-commit collision: Barcode "${p.manufacturer_barcode}" now exists in DB. Re-import CSV to update duplicate choices.`
      );
    }
  }
  for (const m of plan.membersToInsert) {
    if (liveSnapshot.activeMembersByName.has(normalizeKey(m.full_name))) {
      throw new Error(
        `Pre-commit collision: Member "${m.full_name}" was added to DB during review. Re-import CSV to update duplicate choices.`
      );
    }
  }

  const batchId = generateMigrationBatchId(sealedBatch.canonicalSha256);
  const supportsBatchIdColumn = await detectMigrationBatchIdColumns();

  const rollbackManifest: MigrationRollbackManifest = {
    version: 1,
    insertedProductIds: [],
    insertedMemberIds: [],
    insertedSubscriptionIds: [],
    insertedCardIds: [],
    overwrittenProducts: [],
    overwrittenMembers: [],
    overwrittenCards: [],
  };

  const totalOperations =
    plan.productsToInsert.length +
    plan.productsToOverwrite.length +
    plan.membersToInsert.length +
    plan.membersToOverwrite.length;
  let completedOps = 0;
  let productsInserted = 0;
  let productsOverwritten = 0;
  let membersInserted = 0;
  let membersOverwritten = 0;
  let subscriptionsInserted = 0;
  let cardsIssued = 0;

  const updateProg = (label: string) => {
    const pct =
      totalOperations > 0
        ? Math.min(
            98,
            Math.max(10, Math.round((completedOps / totalOperations) * 90) + 8)
          )
        : 95;
    onProgress?.(pct, label);
  };

  // 1. Insert NEW Products in chunks of 50
  if (plan.productsToInsert.length > 0) {
    const chunkSize = 50;
    for (let i = 0; i < plan.productsToInsert.length; i += chunkSize) {
      const chunk = plan.productsToInsert.slice(i, i + chunkSize);
      updateProg(
        `Inserting new products (${Math.min(i + chunk.length, plan.productsToInsert.length)}/${plan.productsToInsert.length})...`
      );

      const insertRows = chunk.map((p) => {
        const base: Record<string, any> = {
          product_name: p.product_name,
          selling_price: p.selling_price,
          has_stock_limit: p.has_stock_limit,
          stock_quantity: p.has_stock_limit ? p.stock_quantity : 0,
          low_stock_alert: p.has_stock_limit ? p.low_stock_alert : null,
          manufacturer_barcode: p.manufacturer_barcode,
          manufacturer_source: 'manual',
          status: p.status,
        };
        if (supportsBatchIdColumn) {
          base.migration_batch_id = batchId;
        }
        return base;
      });

      const { data: insertedProds, error: prodErr } = await supabase
        .from('products')
        .insert(insertRows)
        .select('id');

      if (prodErr) {
        throw new Error(`Products batch insert error: ${prodErr.message}`);
      }

      (insertedProds || []).forEach((row: any) => {
        if (row?.id) rollbackManifest.insertedProductIds.push(row.id);
      });
      productsInserted += insertedProds?.length || chunk.length;
      completedOps += chunk.length;
    }
  }

  // 2. Overwrite EXISTING Products (recording exact pre-overwrite snapshot first)
  for (let i = 0; i < plan.productsToOverwrite.length; i++) {
    const item = plan.productsToOverwrite[i];
    updateProg(
      `Overwriting existing product (${i + 1}/${plan.productsToOverwrite.length}): ${item.incoming.product_name}...`
    );

    rollbackManifest.overwrittenProducts.push({
      id: item.targetId,
      previous: {
        product_name: item.previous.product_name,
        selling_price: item.previous.selling_price,
        has_stock_limit: item.previous.has_stock_limit,
        stock_quantity: item.previous.stock_quantity,
        low_stock_alert: item.previous.low_stock_alert,
        manufacturer_barcode: item.previous.manufacturer_barcode,
        status: item.previous.status,
      },
    });

    const { error: updErr } = await supabase
      .from('products')
      .update({
        product_name: item.incoming.product_name,
        selling_price: item.incoming.selling_price,
        has_stock_limit: item.incoming.has_stock_limit,
        stock_quantity: item.incoming.has_stock_limit
          ? item.incoming.stock_quantity
          : 0,
        low_stock_alert: item.incoming.has_stock_limit
          ? item.incoming.low_stock_alert
          : null,
        manufacturer_barcode: item.incoming.manufacturer_barcode,
        status: item.incoming.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.targetId);

    if (updErr) {
      throw new Error(
        `Product overwrite failed for "${item.incoming.product_name}": ${updErr.message}`
      );
    }

    productsOverwritten++;
    completedOps++;
  }

  const batchToken = Date.now().toString().slice(-6);
  let subSeq = 0;

  const insertSubscriptionForMember = async (
    memberId: string,
    m: CsvMemberRow
  ) => {
    if (m.plan_type === 'none' || !m.start_date || !m.end_date) return;
    subSeq++;
    const startIso = new Date(`${m.start_date}T00:00:00+08:00`).toISOString();
    const endIso = new Date(`${m.end_date}T23:59:59+08:00`).toISOString();
    const isExpired = new Date(endIso).getTime() < Date.now();
    const receiptNo = `MIG-CSV-${batchToken}-${String(subSeq).padStart(4, '0')}`;

    const subPayload: Record<string, any> = {
      member_id: memberId,
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
    };
    if (supportsBatchIdColumn) {
      subPayload.migration_batch_id = batchId;
    }

    const { data: createdSub, error: subErr } = await supabase
      .from('subscriptions')
      .insert([subPayload])
      .select('id')
      .single();

    if (subErr) {
      throw new Error(
        `Subscription insert failed for "${m.full_name}" (CSV line ${m.lineNumber}): ${subErr.message}`
      );
    }
    if (createdSub?.id) {
      rollbackManifest.insertedSubscriptionIds.push(createdSub.id);
    }
    subscriptionsInserted++;
  };

  // 3. Insert NEW Members + Subscriptions + Cards
  for (let i = 0; i < plan.membersToInsert.length; i++) {
    const m = plan.membersToInsert[i];
    updateProg(
      `Inserting new members (${i + 1}/${plan.membersToInsert.length})...`
    );

    const memberPayload: Record<string, any> = {
      full_name: m.full_name,
      phone: m.phone,
      email: m.email,
      gender: m.gender,
      birthday: m.birthday,
      address: m.address,
      status: m.status,
      notes: m.notes,
    };
    if (supportsBatchIdColumn) {
      memberPayload.migration_batch_id = batchId;
    }

    const { data: createdMember, error: memErr } = await supabase
      .from('members')
      .insert([memberPayload])
      .select('member_id')
      .single();

    if (memErr || !createdMember?.member_id) {
      throw new Error(
        `Member insert failed at "${m.full_name}" (CSV line ${m.lineNumber}): ${memErr?.message || 'No ID returned'}`
      );
    }

    rollbackManifest.insertedMemberIds.push(createdMember.member_id);
    membersInserted++;

    await insertSubscriptionForMember(createdMember.member_id, m);

    if (m.issue_card && m.card_type !== 'None') {
      const issuedCard = await cardService.issue(
        createdMember.member_id,
        m.card_type,
        actorEmail || 'SuperAdmin CSV Migration',
        undefined,
        'PAID',
        'CLAIMED',
        0
      );
      if (issuedCard?.id && !issuedCard.id.startsWith('card_off_')) {
        rollbackManifest.insertedCardIds.push(issuedCard.id);
        if (supportsBatchIdColumn) {
          try {
            await supabase
              .from('cards')
              .update({ migration_batch_id: batchId })
              .eq('id', issuedCard.id);
          } catch {}
        }
      }
      cardsIssued++;
    }

    completedOps++;
  }

  // 4. Overwrite EXISTING Members + optional Subscriptions + Card snapshot
  for (let i = 0; i < plan.membersToOverwrite.length; i++) {
    const item = plan.membersToOverwrite[i];
    const m = item.incoming;
    updateProg(
      `Overwriting existing members (${i + 1}/${plan.membersToOverwrite.length}): ${m.full_name}...`
    );

    rollbackManifest.overwrittenMembers.push({
      member_id: item.targetMemberId,
      previous: {
        full_name: item.previous.full_name,
        phone: item.previous.phone,
        email: item.previous.email,
        gender: item.previous.gender,
        birthday: item.previous.birthday,
        address: item.previous.address,
        status: item.previous.status,
        notes: item.previous.notes,
      },
    });

    const { error: updMemErr } = await supabase
      .from('members')
      .update({
        full_name: m.full_name,
        phone: m.phone,
        email: m.email,
        gender: m.gender,
        birthday: m.birthday,
        address: m.address,
        status: m.status,
        notes: m.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('member_id', item.targetMemberId);

    if (updMemErr) {
      throw new Error(
        `Member overwrite failed for "${m.full_name}": ${updMemErr.message}`
      );
    }

    membersOverwritten++;

    await insertSubscriptionForMember(item.targetMemberId, m);

    if (m.issue_card && m.card_type !== 'None') {
      const { data: existingCard } = await supabase
        .from('cards')
        .select('*')
        .eq('member_id', item.targetMemberId)
        .maybeSingle();

      if (existingCard?.id) {
        rollbackManifest.overwrittenCards.push({
          id: existingCard.id,
          member_id: existingCard.member_id,
          card_number: existingCard.card_number,
          card_type: existingCard.card_type,
          status: existingCard.status,
          version: Number(existingCard.version ?? 1),
          payment_status: existingCard.payment_status || 'NONE',
          claim_status: existingCard.claim_status || 'NOT_APPLICABLE',
          card_fee_paid: Number(existingCard.card_fee_paid ?? 0),
          claimed_at: existingCard.claimed_at || null,
          claimed_by: existingCard.claimed_by || null,
          claim_notes: existingCard.claim_notes || null,
          receipt_number: existingCard.receipt_number || null,
          issued_at: existingCard.issued_at,
          expires_at: existingCard.expires_at,
        });
      }

      const issuedCard = await cardService.issue(
        item.targetMemberId,
        m.card_type,
        actorEmail || 'SuperAdmin CSV Migration',
        undefined,
        'PAID',
        'CLAIMED',
        0
      );
      if (
        !existingCard?.id &&
        issuedCard?.id &&
        !issuedCard.id.startsWith('card_off_')
      ) {
        rollbackManifest.insertedCardIds.push(issuedCard.id);
        if (supportsBatchIdColumn) {
          try {
            await supabase
              .from('cards')
              .update({ migration_batch_id: batchId })
              .eq('id', issuedCard.id);
          } catch {}
        }
      }
      cardsIssued++;
    }

    completedOps++;
  }

  clearClientMigrationCaches();
  clearEphemeralSeal(sealedBatch.sealId);

  const executedAt = new Date().toISOString();
  const rollbackExpiresAt = new Date(
    Date.now() + MIGRATION_UNDO_WINDOW_MS
  ).toISOString();

  const hashPrefix = sealedBatch.canonicalSha256.slice(0, 16).toUpperCase();
  const csvHashPrefix = sealedBatch.rawCsvSha256.slice(0, 12).toUpperCase();

  await logAudit(
    'LEGACY_CSV_MIGRATION_EXECUTED',
    `SuperAdmin executed secure CSV migration [Batch ${batchId}]: ${productsInserted} inserted / ${productsOverwritten} overwritten product(s), ${membersInserted} inserted / ${membersOverwritten} overwritten member(s), ${plan.ignoredCount} ignored duplicate(s), ${subscriptionsInserted} subscription(s), ${cardsIssued} card(s). Payload SHA-256: ${hashPrefix}... | CSV SHA-256: ${csvHashPrefix}...`,
    actorId || undefined
  );

  onProgress?.(100, 'Migration completed & 24h undo checkpoint saved.');

  return {
    batchId,
    productsInserted,
    productsOverwritten,
    membersInserted,
    membersOverwritten,
    ignoredCount: plan.ignoredCount,
    subscriptionsInserted,
    cardsIssued,
    canonicalSha256: sealedBatch.canonicalSha256,
    rawCsvSha256: sealedBatch.rawCsvSha256,
    executedAt,
    rollbackExpiresAt,
    rollbackManifest,
  };
}

function clearClientMigrationCaches(): void {
  try {
    sessionStorage.removeItem('members_sanitized_cache');
    localStorage.removeItem('members_sanitized_cache');
    sessionStorage.removeItem('products_sanitized_list');
    localStorage.removeItem('products_sanitized_list');
    localStorage.removeItem('palomar_cards_cache_v1');
    sessionStorage.removeItem('palomar_cards_cache_v1');
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('member-refresh'));
    window.dispatchEvent(new Event('palomar_logbook_updated'));
    window.dispatchEvent(new Event('products-refresh'));
  }
}

// Local fallback cache for rollback manifests in case DB rollback columns haven't been pushed yet
interface LocalRollbackCacheItem {
  key: string;
  auditLogId?: string;
  batchId?: string | null;
  fileHash: string;
  payloadHash?: string | null;
  expiresAt: string;
  revertedAt?: string | null;
  revertedByEmail?: string | null;
  manifest: MigrationRollbackManifest;
}

function readLocalRollbackCache(): LocalRollbackCacheItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_ROLLBACK_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    // Retain entries within 24h + 2h grace for reverted badges
    return parsed.filter(
      (item: LocalRollbackCacheItem) =>
        Date.parse(item.expiresAt) + 2 * 60 * 60 * 1000 > now
    );
  } catch {
    return [];
  }
}

function writeLocalRollbackCache(items: LocalRollbackCacheItem[]): void {
  try {
    localStorage.setItem(LOCAL_ROLLBACK_CACHE_KEY, JSON.stringify(items));
  } catch {}
}

export function saveLocalRollbackManifest(
  entry: Omit<LocalRollbackCacheItem, 'key'>
): void {
  const existing = readLocalRollbackCache();
  const key =
    entry.batchId ||
    entry.auditLogId ||
    `${entry.fileHash}::${entry.expiresAt}`;
  const filtered = existing.filter((i) => i.key !== key);
  filtered.unshift({ ...entry, key });
  writeLocalRollbackCache(filtered.slice(0, 20));
}

export function resolveEffectiveRollbackData(entry: MigrationAuditLogEntry): {
  batchId: string | null;
  manifest: MigrationRollbackManifest | null;
  expiresAt: string | null;
  revertedAt: string | null;
  revertedByEmail: string | null;
} {
  const cache = readLocalRollbackCache();
  const cached = cache.find(
    (c) =>
      (entry.batch_id && c.batchId && c.batchId === entry.batch_id) ||
      (c.auditLogId && c.auditLogId === entry.id) ||
      (c.fileHash === entry.file_hash &&
        (!entry.payload_hash || c.payloadHash === entry.payload_hash))
  );

  const batchId = entry.batch_id || cached?.batchId || null;
  const manifest = entry.rollback_manifest || cached?.manifest || null;
  const expiresAt =
    entry.rollback_expires_at ||
    cached?.expiresAt ||
    new Date(
      Date.parse(entry.created_at) + MIGRATION_UNDO_WINDOW_MS
    ).toISOString();
  const revertedAt = entry.reverted_at || cached?.revertedAt || null;
  const revertedByEmail =
    entry.reverted_by_email || cached?.revertedByEmail || null;

  return { batchId, manifest, expiresAt, revertedAt, revertedByEmail };
}

export function getUndoRemainingMs(
  entry: MigrationAuditLogEntry,
  nowMs: number = Date.now()
): number {
  const normalizedStatus = String(entry.status || '').toUpperCase();
  const { batchId, manifest, expiresAt, revertedAt } =
    resolveEffectiveRollbackData(entry);
  if (
    normalizedStatus !== 'SUCCESS' ||
    revertedAt ||
    !expiresAt ||
    (!manifest && !batchId)
  ) {
    return 0;
  }

  if (manifest) {
    const hasMutations =
      manifest.insertedProductIds.length > 0 ||
      manifest.insertedMemberIds.length > 0 ||
      manifest.insertedSubscriptionIds.length > 0 ||
      manifest.insertedCardIds.length > 0 ||
      manifest.overwrittenProducts.length > 0 ||
      manifest.overwrittenMembers.length > 0 ||
      manifest.overwrittenCards.length > 0;
    if (!hasMutations && !batchId) return 0;
  }

  return Math.max(0, Date.parse(expiresAt) - nowMs);
}

export function formatRemainingUndoTime(remainingMs: number): string {
  if (remainingMs <= 0) return 'Closed (24h expired)';
  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  return minutes > 0
    ? `${minutes}m ${seconds}s remaining`
    : `${seconds}s remaining`;
}

/**
 * Queries `migration_audit_logs` specifically for successful migration entries within
 * the last 24 hours so the SuperAdmin can trigger a Revert Migration by batch_id.
 */
export async function fetchRecentRevertibleMigrations(): Promise<
  MigrationAuditLogEntry[]
> {
  const cutoffIso = new Date(
    Date.now() - MIGRATION_UNDO_WINDOW_MS
  ).toISOString();

  try {
    const { data, error } = await supabase
      .from('migration_audit_logs')
      .select('*')
      .eq('status', 'success')
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(25);

    if (error) return [];

    const nowMs = Date.now();
    return ((data as MigrationAuditLogEntry[]) || [])
      .map((entry) => {
        const resolved = resolveEffectiveRollbackData(entry);
        return {
          ...entry,
          batch_id: entry.batch_id || resolved.batchId,
          reverted_at: entry.reverted_at || resolved.revertedAt,
          reverted_by_email:
            entry.reverted_by_email || resolved.revertedByEmail,
          rollback_manifest: entry.rollback_manifest || resolved.manifest,
          rollback_expires_at:
            entry.rollback_expires_at || resolved.expiresAt,
        };
      })
      .filter((entry) => getUndoRemainingMs(entry, nowMs) > 0);
  } catch {
    return [];
  }
}

/**
 * Queries `migration_audit_logs` within the last 24 hours for the given `batch_id`
 * (or logEntry), performs a cascading delete of all inserted records associated with that
 * `batch_id` in strict FK dependency order (cards -> subscriptions -> members -> products),
 * restores any pre-overwrite snapshots, and updates the log status to 'REVERTED'.
 */
export async function revertMigrationByBatchId(params: {
  batchId?: string | null;
  logEntry?: MigrationAuditLogEntry;
  actorEmail?: string | null;
  actorId?: string | null;
  onProgress?: (percent: number, stageLabel: string) => void;
}): Promise<UndoMigrationSummary> {
  const { actorEmail, actorId, onProgress } = params;

  if (!isSuperAdmin(actorEmail)) {
    throw new Error(
      'Access denied. Revert Migration is strictly restricted to assigned SuperAdmin.'
    );
  }

  const sessionCheck = await verifyLiveCashSessionClosed();
  if (!sessionCheck.isClosed) {
    throw new Error(
      'Cannot revert migration while a cash drawer session is open. Close the cash session first.'
    );
  }

  // Query migration_audit_logs within the last 24 hours to verify eligibility authoritatively
  const cutoffIso = new Date(
    Date.now() - MIGRATION_UNDO_WINDOW_MS
  ).toISOString();

  let targetEntry: MigrationAuditLogEntry | undefined = params.logEntry;
  const requestedBatchId = params.batchId || params.logEntry?.batch_id || null;

  if (requestedBatchId) {
    const { data: batchRows } = await supabase
      .from('migration_audit_logs')
      .select('*')
      .eq('batch_id', requestedBatchId)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(1);

    if (batchRows && batchRows.length > 0) {
      targetEntry = batchRows[0] as MigrationAuditLogEntry;
    }
  } else if (params.logEntry?.id && !params.logEntry.id.startsWith('local_')) {
    const { data: logRows } = await supabase
      .from('migration_audit_logs')
      .select('*')
      .eq('id', params.logEntry.id)
      .gte('created_at', cutoffIso)
      .limit(1);

    if (logRows && logRows.length > 0) {
      targetEntry = logRows[0] as MigrationAuditLogEntry;
    }
  }

  if (!targetEntry) {
    throw new Error(
      'No migration audit log entry found within the last 24 hours for this batch.'
    );
  }

  const resolved = resolveEffectiveRollbackData(targetEntry);
  const effectiveBatchId = requestedBatchId || resolved.batchId;
  const manifest = resolved.manifest;

  const statusUpper = String(targetEntry.status || '').toUpperCase();
  if (statusUpper === 'REVERTED' || resolved.revertedAt) {
    throw new Error('This migration batch has already been REVERTED.');
  }
  if (statusUpper !== 'SUCCESS') {
    throw new Error('Only completed successful migrations can be reverted.');
  }

  const expiresAtMs = resolved.expiresAt
    ? Date.parse(resolved.expiresAt)
    : Date.parse(targetEntry.created_at) + MIGRATION_UNDO_WINDOW_MS;

  if (Date.now() >= expiresAtMs) {
    throw new Error(
      '24-hour revert window has expired. This migration batch is permanently closed.'
    );
  }

  if (!manifest && !effectiveBatchId) {
    throw new Error(
      'Neither rollback manifest nor batch_id is available for this historical entry.'
    );
  }

  const supportsBatchIdColumn = await detectMigrationBatchIdColumns();

  let deletedCards = 0;
  let restoredCards = 0;
  let deletedSubscriptions = 0;
  let deletedMembers = 0;
  let restoredMembers = 0;
  let deletedProducts = 0;
  let restoredProducts = 0;

  onProgress?.(10, 'Cascading delete: member cards...');
  // 1. Delete newly inserted cards by batch_id & manifest IDs
  if (supportsBatchIdColumn && effectiveBatchId) {
    const { data: batchCards, error } = await supabase
      .from('cards')
      .delete()
      .eq('migration_batch_id', effectiveBatchId)
      .select('id');
    if (error) throw new Error(`Card batch revert failed: ${error.message}`);
    deletedCards += batchCards?.length || 0;
  }
  if (manifest && manifest.insertedCardIds.length > 0) {
    const { data: idCards, error } = await supabase
      .from('cards')
      .delete()
      .in('id', manifest.insertedCardIds)
      .select('id');
    if (error) throw new Error(`Card revert failed: ${error.message}`);
    if (!supportsBatchIdColumn || !effectiveBatchId) {
      deletedCards += idCards?.length ?? manifest.insertedCardIds.length;
    } else if (idCards) {
      deletedCards += idCards.length;
    }
  }

  // Restore overwritten cards
  if (manifest) {
    for (const card of manifest.overwrittenCards) {
      const { error } = await supabase
        .from('cards')
        .update({
          card_number: card.card_number,
          card_type: card.card_type,
          status: card.status,
          version: card.version,
          payment_status: card.payment_status,
          claim_status: card.claim_status,
          card_fee_paid: card.card_fee_paid,
          claimed_at: card.claimed_at,
          claimed_by: card.claimed_by,
          claim_notes: card.claim_notes,
          receipt_number: card.receipt_number,
          issued_at: card.issued_at,
          expires_at: card.expires_at,
          updated_at: new Date().toISOString(),
        })
        .eq('id', card.id);
      if (error) throw new Error(`Card snapshot restore failed: ${error.message}`);
      restoredCards++;
    }
  }

  onProgress?.(30, 'Cascading delete: migrated subscriptions...');
  // 2. Delete newly inserted subscriptions by batch_id & manifest IDs
  if (supportsBatchIdColumn && effectiveBatchId) {
    const { data: batchSubs, error } = await supabase
      .from('subscriptions')
      .delete()
      .eq('migration_batch_id', effectiveBatchId)
      .select('id');
    if (error)
      throw new Error(`Subscription batch revert failed: ${error.message}`);
    deletedSubscriptions += batchSubs?.length || 0;
  }
  if (manifest && manifest.insertedSubscriptionIds.length > 0) {
    for (let i = 0; i < manifest.insertedSubscriptionIds.length; i += 50) {
      const chunk = manifest.insertedSubscriptionIds.slice(i, i + 50);
      const { data: idSubs, error } = await supabase
        .from('subscriptions')
        .delete()
        .in('id', chunk)
        .select('id');
      if (error) throw new Error(`Subscription revert failed: ${error.message}`);
      if (!supportsBatchIdColumn || !effectiveBatchId) {
        deletedSubscriptions += idSubs?.length ?? chunk.length;
      } else if (idSubs) {
        deletedSubscriptions += idSubs.length;
      }
    }
  }

  onProgress?.(50, 'Cascading delete: inserted members...');
  // 3. Delete newly inserted members by batch_id & manifest IDs
  if (supportsBatchIdColumn && effectiveBatchId) {
    const { data: batchMems, error } = await supabase
      .from('members')
      .delete()
      .eq('migration_batch_id', effectiveBatchId)
      .select('member_id');
    if (error) {
      throw new Error(
        `Cannot remove inserted member(s) for batch ${effectiveBatchId} (possible linked activity): ${error.message}`
      );
    }
    deletedMembers += batchMems?.length || 0;
  }
  if (manifest && manifest.insertedMemberIds.length > 0) {
    for (let i = 0; i < manifest.insertedMemberIds.length; i += 50) {
      const chunk = manifest.insertedMemberIds.slice(i, i + 50);
      const { data: idMems, error } = await supabase
        .from('members')
        .delete()
        .in('member_id', chunk)
        .select('member_id');
      if (error) {
        throw new Error(
          `Cannot remove inserted member(s) (possible linked activity): ${error.message}`
        );
      }
      if (!supportsBatchIdColumn || !effectiveBatchId) {
        deletedMembers += idMems?.length ?? chunk.length;
      } else if (idMems) {
        deletedMembers += idMems.length;
      }
    }
  }

  onProgress?.(65, 'Restoring overwritten member profiles...');
  // 4. Restore overwritten members to exact pre-migration state
  if (manifest) {
    for (const snap of manifest.overwrittenMembers) {
      const { error } = await supabase
        .from('members')
        .update({
          full_name: snap.previous.full_name,
          phone: snap.previous.phone,
          email: snap.previous.email,
          gender: snap.previous.gender,
          birthday: snap.previous.birthday,
          address: snap.previous.address,
          status: snap.previous.status,
          notes: snap.previous.notes,
          updated_at: new Date().toISOString(),
        })
        .eq('member_id', snap.member_id);
      if (error) {
        throw new Error(`Member restore failed: ${error.message}`);
      }
      restoredMembers++;
    }
  }

  onProgress?.(80, 'Cascading delete: inserted products...');
  // 5. Delete newly inserted products by batch_id & manifest IDs
  if (supportsBatchIdColumn && effectiveBatchId) {
    const { data: batchProds, error } = await supabase
      .from('products')
      .delete()
      .eq('migration_batch_id', effectiveBatchId)
      .select('id');
    if (error) {
      throw new Error(
        `Cannot remove inserted product(s) for batch ${effectiveBatchId} (possible linked sales): ${error.message}`
      );
    }
    deletedProducts += batchProds?.length || 0;
  }
  if (manifest && manifest.insertedProductIds.length > 0) {
    for (let i = 0; i < manifest.insertedProductIds.length; i += 50) {
      const chunk = manifest.insertedProductIds.slice(i, i + 50);
      const { data: idProds, error } = await supabase
        .from('products')
        .delete()
        .in('id', chunk)
        .select('id');
      if (error) {
        throw new Error(
          `Cannot remove inserted product(s) (possible linked sales): ${error.message}`
        );
      }
      if (!supportsBatchIdColumn || !effectiveBatchId) {
        deletedProducts += idProds?.length ?? chunk.length;
      } else if (idProds) {
        deletedProducts += idProds.length;
      }
    }
  }

  onProgress?.(90, 'Restoring overwritten products...');
  // 6. Restore overwritten products to exact pre-migration state
  if (manifest) {
    for (const snap of manifest.overwrittenProducts) {
      const { error } = await supabase
        .from('products')
        .update({
          product_name: snap.previous.product_name,
          selling_price: snap.previous.selling_price,
          has_stock_limit: snap.previous.has_stock_limit,
          stock_quantity: snap.previous.stock_quantity,
          low_stock_alert: snap.previous.low_stock_alert,
          manufacturer_barcode: snap.previous.manufacturer_barcode,
          status: snap.previous.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', snap.id);
      if (error) {
        throw new Error(`Product restore failed: ${error.message}`);
      }
      restoredProducts++;
    }
  }

  const nowIso = new Date().toISOString();
  const updatedNote = `${targetEntry.notes ? `${targetEntry.notes} | ` : ''}REVERTED cleanly within 24h window${effectiveBatchId ? ` [Batch ${effectiveBatchId}]` : ''} by ${actorEmail || 'SuperAdmin'}.`;

  // Update log status to 'REVERTED' (graceful fallback to lowercase 'reverted' if legacy check constraint applies)
  if (targetEntry.id && !targetEntry.id.startsWith('local_')) {
    try {
      const { error: updAuditErr } = await supabase
        .from('migration_audit_logs')
        .update({
          status: 'REVERTED',
          reverted_at: nowIso,
          reverted_by: actorId || null,
          reverted_by_email: actorEmail || 'SuperAdmin',
          notes: updatedNote,
        })
        .eq('id', targetEntry.id);

      if (updAuditErr) {
        const { error: lowerErr } = await supabase
          .from('migration_audit_logs')
          .update({
            status: 'reverted',
            reverted_at: nowIso,
            reverted_by: actorId || null,
            reverted_by_email: actorEmail || 'SuperAdmin',
            notes: updatedNote,
          })
          .eq('id', targetEntry.id);

        if (lowerErr) {
          await supabase
            .from('migration_audit_logs')
            .update({
              notes: `${targetEntry.notes ? `${targetEntry.notes} | ` : ''}REVERTED at ${nowIso} by ${actorEmail || 'SuperAdmin'}.`,
            })
            .eq('id', targetEntry.id);
        }
      }
    } catch {}
  }

  // Update local fallback cache if present
  const localCache = readLocalRollbackCache();
  const updatedCache = localCache.map((item) =>
    (effectiveBatchId && item.batchId === effectiveBatchId) ||
    (item.auditLogId && item.auditLogId === targetEntry?.id) ||
    item.fileHash === targetEntry?.file_hash
      ? {
          ...item,
          revertedAt: nowIso,
          revertedByEmail: actorEmail || 'SuperAdmin',
        }
      : item
  );
  writeLocalRollbackCache(updatedCache);

  clearClientMigrationCaches();

  await logAudit(
    'LEGACY_CSV_MIGRATION_REVERTED',
    `SuperAdmin reverted CSV migration${effectiveBatchId ? ` [Batch ${effectiveBatchId}]` : ''} (${targetEntry.file_name || targetEntry.file_hash.slice(0, 12)}) within 24h window: -${deletedProducts} / restored ${restoredProducts} product(s), -${deletedMembers} / restored ${restoredMembers} member(s), -${deletedSubscriptions} subscription(s), -${deletedCards} / restored ${restoredCards} card(s). Status set to REVERTED.`,
    actorId || undefined
  );

  onProgress?.(100, 'Migration batch REVERTED & audited.');

  return {
    batchId: effectiveBatchId,
    deletedProducts,
    restoredProducts,
    deletedMembers,
    restoredMembers,
    deletedSubscriptions,
    deletedCards,
    restoredCards,
  };
}

/**
 * Reverts an executed CSV migration strictly within the 24-hour rollback window.
 */
export async function undoExecutedMigration(params: {
  logEntry: MigrationAuditLogEntry;
  actorEmail?: string | null;
  actorId?: string | null;
  onProgress?: (percent: number, stageLabel: string) => void;
}): Promise<UndoMigrationSummary> {
  return revertMigrationByBatchId({
    batchId: params.logEntry.batch_id || null,
    logEntry: params.logEntry,
    actorEmail: params.actorEmail,
    actorId: params.actorId,
    onProgress: params.onProgress,
  });
}

/**
 * Records every CSV migration attempt (success, failure, blocked) into the dedicated
 * `migration_audit_logs` Supabase table, including batch_id & 24-hour rollback manifest.
 */
export async function recordMigrationAttempt(params: {
  batchId?: string | null;
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
  overwrittenCount?: number;
  ignoredCount?: number;
  errorCount?: number;
  warningCount?: number;
  validationErrors?: ValidationIssue[];
  errorMessage?: string | null;
  nonEmptyOverride?: boolean;
  notes?: string | null;
  rollbackManifest?: MigrationRollbackManifest | null;
  rollbackExpiresAt?: string | null;
}): Promise<{
  savedToDedicatedTable: boolean;
  auditLogId?: string;
  error?: string;
}> {
  const email = params.superadminEmail || 'unknown';
  const errorsTrimmed = (params.validationErrors || []).slice(0, 100);

  const extendedPayload: Record<string, any> = {
    batch_id: params.batchId || null,
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
    overwritten_count: params.overwrittenCount ?? 0,
    ignored_count: params.ignoredCount ?? 0,
    error_count: params.errorCount ?? 0,
    warning_count: params.warningCount ?? 0,
    validation_errors: errorsTrimmed,
    error_message: params.errorMessage || null,
    non_empty_override: Boolean(params.nonEmptyOverride),
    notes: params.notes || null,
    rollback_manifest: params.rollbackManifest || null,
    rollback_expires_at: params.rollbackExpiresAt || null,
  };

  let savedToDedicatedTable = false;
  let auditLogId: string | undefined;
  let tableErrorMsg: string | undefined;

  try {
    const { data, error } = await supabase
      .from('migration_audit_logs')
      .insert([extendedPayload])
      .select('id')
      .single();

    if (!error) {
      savedToDedicatedTable = true;
      auditLogId = data?.id;
    } else {
      // Fallback 1: without batch_id if incremental SQL migration hasn't been pushed yet
      const { batch_id: _omittedBatchId, ...withoutBatchId } = extendedPayload;
      const retryRes = await supabase
        .from('migration_audit_logs')
        .insert([withoutBatchId])
        .select('id')
        .single();

      if (!retryRes.error) {
        savedToDedicatedTable = true;
        auditLogId = retryRes.data?.id;
      } else {
        // Fallback 2: minimal base schema
        const basePayload = {
          superadmin_id: extendedPayload.superadmin_id,
          superadmin_email: extendedPayload.superadmin_email,
          file_name: extendedPayload.file_name,
          file_size_bytes: extendedPayload.file_size_bytes,
          file_hash: extendedPayload.file_hash,
          payload_hash: extendedPayload.payload_hash,
          status: extendedPayload.status,
          products_count: extendedPayload.products_count,
          members_count: extendedPayload.members_count,
          subscriptions_count: extendedPayload.subscriptions_count,
          cards_count: extendedPayload.cards_count,
          error_count: extendedPayload.error_count,
          warning_count: extendedPayload.warning_count,
          validation_errors: extendedPayload.validation_errors,
          error_message: extendedPayload.error_message,
          non_empty_override: extendedPayload.non_empty_override,
          notes: extendedPayload.notes,
        };
        const fallbackRes = await supabase
          .from('migration_audit_logs')
          .insert([basePayload])
          .select('id')
          .single();

        if (!fallbackRes.error) {
          savedToDedicatedTable = true;
          auditLogId = fallbackRes.data?.id;
        } else {
          tableErrorMsg = fallbackRes.error.message;
          console.warn(
            'migration_audit_logs insert warning:',
            fallbackRes.error.message
          );
        }
      }
    }
  } catch (err: any) {
    tableErrorMsg =
      err?.message || 'Unknown error inserting migration_audit_logs';
  }

  // Persist local 24h fallback manifest if execution succeeded
  if (
    params.status === 'success' &&
    params.rollbackManifest &&
    params.rollbackExpiresAt
  ) {
    saveLocalRollbackManifest({
      auditLogId,
      batchId: params.batchId || null,
      fileHash: params.fileHash,
      payloadHash: params.payloadHash,
      expiresAt: params.rollbackExpiresAt,
      manifest: params.rollbackManifest,
    });
  }

  // Mirror critical summary into general audit_logs for cross-module visibility
  try {
    const hashShort = (params.fileHash || 'none').slice(0, 12).toUpperCase();
    const statusUpper = params.status.toUpperCase();
    await logAudit(
      `LEGACY_CSV_MIGRATION_${statusUpper}`,
      `CSV Migration [${statusUpper}]${params.batchId ? ` Batch ${params.batchId}` : ''} by ${email} — File: ${params.fileName || 'N/A'} | File Hash: ${hashShort}... | Products: ${params.productsCount ?? 0}, Members: ${params.membersCount ?? 0}, Overwritten: ${params.overwrittenCount ?? 0}, Ignored: ${params.ignoredCount ?? 0}, Errors: ${params.errorCount ?? 0}${params.errorMessage ? ` | Note: ${params.errorMessage}` : ''}`,
      params.superadminId || undefined
    );
  } catch {}

  return { savedToDedicatedTable, auditLogId, error: tableErrorMsg };
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

    const mapped = ((data as MigrationAuditLogEntry[]) || []).map((entry) => {
      const resolved = resolveEffectiveRollbackData(entry);
      const isLocallyReverted =
        Boolean(resolved.revertedAt) &&
        String(entry.status || '').toLowerCase() === 'success';
      return {
        ...entry,
        batch_id: entry.batch_id || resolved.batchId,
        status: isLocallyReverted ? ('REVERTED' as const) : entry.status,
        reverted_at: entry.reverted_at || resolved.revertedAt,
        reverted_by_email:
          entry.reverted_by_email || resolved.revertedByEmail,
        rollback_manifest: entry.rollback_manifest || resolved.manifest,
        rollback_expires_at: entry.rollback_expires_at || resolved.expiresAt,
      };
    });

    return {
      logs: mapped,
      tableUnavailable: false,
    };
  } catch (err) {
    console.warn('fetchMigrationAuditLogs error:', err);
    return { logs: [], tableUnavailable: true };
  }
}

