// src/pages/system/utils/encryptedCsvBackup.ts
import { supabase } from '../../../lib/supabase/client';
import { logAudit } from '../../../lib/supabase/audit';
import {
  PRODUCT_HEADERS,
  MEMBER_HEADERS,
  computeSha256Hex,
  fetchMigrationDbSnapshot,
  parseAndValidateMigrationCsv,
  sealMigrationBatch,
  executeSecuredCsvMigration,
  type ParsedMigrationResult,
  type DuplicateAction,
  type MigrationExecutionSummary,
} from './csvDataMigration';

export const ENCRYPTED_BACKUP_PREFIX = 'WPENC_V1:';
const ENCRYPTION_PASSPHRASE_SEED =
  'WOLF_PALOMAR_GYM_AES256_GCM_BACKUP_ENVELOPE_KEY_V1::' +
  '9f4a2e71c80b3d5a624f9e180c3b7a2d';

interface EncryptedEnvelope {
  v: 1;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iter: number;
  salt: string;
  iv: string;
  sha256: string;
  ct: string;
  exportedAt: string;
}

export interface EncryptedExportResult {
  encryptedContent: string;
  filename: string;
  productsCount: number;
  membersCount: number;
  subscriptionsCount: number;
  cardsCount: number;
  sha256: string;
}

export interface DecryptedValidatedBackup {
  rawPlainCsv: string;
  fileSha256: string;
  exportedAt: string;
  parsed: ParsedMigrationResult;
}

function bytesToBase64(bytes: Uint8Array): string {
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

async function deriveAesKey(saltBytes: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(ENCRYPTION_PASSPHRASE_SEED),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 120000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r')
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toIsoDateOnly(iso?: string | null): string {
  if (!iso) return '';
  const str = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.slice(0, 10);
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Fetches live active products, members, subscriptions, and cards from Supabase,
 * builds a unified [PRODUCTS] + [MEMBERS] CSV template payload, and encrypts it
 * with AES-256-GCM so the exported file is completely unreadable if opened directly.
 */
export async function exportEncryptedDatabaseCsv(params: {
  actorId?: string | null;
  actorEmail?: string | null;
}): Promise<EncryptedExportResult> {
  const [prodRes, memRes, subRes, cardRes] = await Promise.all([
    supabase
      .from('products')
      .select(
        'product_name, selling_price, has_stock_limit, stock_quantity, low_stock_alert, manufacturer_barcode, status'
      )
      .is('deleted_at', null)
      .order('product_name', { ascending: true }),
    supabase
      .from('members')
      .select(
        'member_id, full_name, phone, email, gender, birthday, address, status, notes'
      )
      .is('deleted_at', null)
      .order('full_name', { ascending: true }),
    supabase
      .from('subscriptions')
      .select('member_id, plan_type, start_date, end_date, status, created_at')
      .is('deleted_at', null)
      .order('end_date', { ascending: false }),
    supabase
      .from('cards')
      .select('member_id, card_type, status, issued_at')
      .order('issued_at', { ascending: false }),
  ]);

  if (prodRes.error) throw new Error(`Failed to fetch products: ${prodRes.error.message}`);
  if (memRes.error) throw new Error(`Failed to fetch members: ${memRes.error.message}`);

  const latestSubByMember = new Map<
    string,
    { plan_type: string; start_date: string | null; end_date: string | null }
  >();
  (subRes.data || []).forEach((s: any) => {
    if (!s?.member_id) return;
    if (!latestSubByMember.has(s.member_id)) {
      latestSubByMember.set(s.member_id, s);
    }
  });

  const activeCardByMember = new Map<string, string>();
  (cardRes.data || []).forEach((c: any) => {
    if (!c?.member_id) return;
    if (!activeCardByMember.has(c.member_id)) {
      const cardType = String(c.card_type || '').toUpperCase();
      if (cardType === 'QR' || cardType === 'MANUAL') {
        activeCardByMember.set(
          c.member_id,
          cardType === 'QR' ? 'QR' : 'Manual'
        );
      }
    }
  });

  const lines: string[] = [];
  lines.push('[PRODUCTS]');
  lines.push(PRODUCT_HEADERS.join(','));

  const products = prodRes.data || [];
  products.forEach((p: any) => {
    const row = [
      String(p.product_name || '').trim().toUpperCase(),
      Number(p.selling_price ?? 0).toFixed(2),
      p.has_stock_limit ? 'true' : 'false',
      p.has_stock_limit ? String(Number(p.stock_quantity ?? 0)) : '0',
      p.has_stock_limit && p.low_stock_alert !== null && p.low_stock_alert !== undefined
        ? String(Number(p.low_stock_alert))
        : '',
      p.manufacturer_barcode ? String(p.manufacturer_barcode).trim() : '',
      p.status === 'Inactive' ? 'Inactive' : 'Active',
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  });

  lines.push('');
  lines.push('[MEMBERS]');
  lines.push(MEMBER_HEADERS.join(','));

  let exportedSubCount = 0;
  let exportedCardCount = 0;

  const members = memRes.data || [];
  members.forEach((m: any) => {
    const sub = latestSubByMember.get(m.member_id);
    const rawPlan = String(sub?.plan_type || 'none').toLowerCase();
    const planType =
      rawPlan === 'monthly' || rawPlan === 'yearly' ? rawPlan : 'none';
    const startDate = planType !== 'none' ? toIsoDateOnly(sub?.start_date) : '';
    const endDate = planType !== 'none' ? toIsoDateOnly(sub?.end_date) : '';
    if (planType !== 'none' && startDate && endDate) {
      exportedSubCount++;
    }

    const cardType = activeCardByMember.get(m.member_id);
    const issueCard = Boolean(cardType);
    if (issueCard) exportedCardCount++;

    const row = [
      String(m.full_name || '').trim().toUpperCase(),
      String(m.phone || '').trim(),
      m.email ? String(m.email).trim() : '',
      m.gender === 'Female' || m.gender === 'Other' ? m.gender : 'Male',
      toIsoDateOnly(m.birthday),
      m.address ? String(m.address).trim() : '',
      startDate && endDate ? planType : 'none',
      startDate,
      endDate,
      issueCard ? 'true' : 'false',
      issueCard ? cardType : 'None',
      m.status === 'Suspended' ? 'Suspended' : 'Active',
      m.notes ? String(m.notes).trim() : '',
    ];
    lines.push(row.map(escapeCsvCell).join(','));
  });

  const plainCsv = lines.join('\r\n');
  const sha256 = await computeSha256Hex(plainCsv);

  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);

  const aesKey = await deriveAesKey(saltBytes);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    aesKey,
    new TextEncoder().encode(plainCsv)
  );

  const envelope: EncryptedEnvelope = {
    v: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iter: 120000,
    salt: bytesToBase64(saltBytes),
    iv: bytesToBase64(ivBytes),
    sha256,
    ct: bytesToBase64(new Uint8Array(encryptedBuffer)),
    exportedAt: new Date().toISOString(),
  };

  // Second outer obfuscation layer (base64 encoded JSON prefixed with opaque header)
  // so no field names, hashes, or metadata are readable when opened directly.
  const envelopeJsonBytes = new TextEncoder().encode(JSON.stringify(envelope));
  const encryptedContent = `${ENCRYPTED_BACKUP_PREFIX}${bytesToBase64(envelopeJsonBytes)}`;

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;
  const filename = `palomar-encrypted-backup-${stamp}.wpenc`;

  await logAudit(
    'DATABASE_ENCRYPTED_EXPORT',
    `SuperAdmin (${params.actorEmail || 'SuperAdmin'}) exported AES-256-GCM encrypted backup: ${products.length} products, ${members.length} members, ${exportedSubCount} subscriptions, ${exportedCardCount} cards.`,
    params.actorId || undefined
  );

  return {
    encryptedContent,
    filename,
    productsCount: products.length,
    membersCount: members.length,
    subscriptionsCount: exportedSubCount,
    cardsCount: exportedCardCount,
    sha256,
  };
}

/**
 * Decrypts a `.wpenc` exported backup file, verifies its SHA-256 digest & AES-GCM
 * authentication tag, and runs strict CSV validation against the live Supabase snapshot.
 */
export async function decryptAndValidateEncryptedBackup(
  rawFileText: string
): Promise<DecryptedValidatedBackup> {
  const trimmed = (rawFileText || '').trim();
  if (!trimmed.startsWith(ENCRYPTED_BACKUP_PREFIX)) {
    throw new Error(
      'Invalid or unencrypted file format. Only encrypted Wolf Palomar backup (.wpenc) files exported from Database Backup are accepted.'
    );
  }

  let envelope: EncryptedEnvelope;
  try {
    const b64Payload = trimmed.slice(ENCRYPTED_BACKUP_PREFIX.length);
    const jsonBytes = base64ToBytes(b64Payload);
    const decodedJson = new TextDecoder().decode(jsonBytes);
    envelope = JSON.parse(decodedJson) as EncryptedEnvelope;
  } catch {
    throw new Error(
      'Backup envelope is corrupted or malformed and could not be decoded.'
    );
  }

  if (
    !envelope ||
    envelope.v !== 1 ||
    envelope.alg !== 'AES-256-GCM' ||
    !envelope.salt ||
    !envelope.iv ||
    !envelope.ct ||
    !envelope.sha256
  ) {
    throw new Error('Unsupported or tampered encrypted backup structure.');
  }

  let rawPlainCsv = '';
  try {
    const saltBytes = base64ToBytes(envelope.salt);
    const ivBytes = base64ToBytes(envelope.iv);
    const cipherBytes = base64ToBytes(envelope.ct);
    const aesKey = await deriveAesKey(saltBytes);
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
      aesKey,
      cipherBytes.buffer as ArrayBuffer
    );
    rawPlainCsv = new TextDecoder().decode(decryptedBuffer);
  } catch {
    throw new Error(
      'Decryption failed. The backup file is damaged or has been modified.'
    );
  }

  const computedHash = await computeSha256Hex(rawPlainCsv);
  if (computedHash !== envelope.sha256) {
    throw new Error(
      'Integrity verification failed (SHA-256 mismatch). Import aborted.'
    );
  }

  const dbSnapshot = await fetchMigrationDbSnapshot();
  const parsed = await parseAndValidateMigrationCsv(rawPlainCsv, dbSnapshot);

  return {
    rawPlainCsv,
    fileSha256: computedHash,
    exportedAt: envelope.exportedAt || new Date().toISOString(),
    parsed,
  };
}

/**
 * Seals the validated decrypted backup and commits it using the hardened SuperAdmin migration engine.
 */
export async function executeValidatedEncryptedImport(params: {
  parsed: ParsedMigrationResult;
  resolutions: Record<string, DuplicateAction>;
  actorEmail?: string | null;
  actorId?: string | null;
  onProgress?: (percent: number, label: string) => void;
}): Promise<MigrationExecutionSummary> {
  const { parsed, resolutions, actorEmail, actorId, onProgress } = params;

  if (!parsed.isValid || parsed.errorCount > 0) {
    throw new Error(
      `Cannot import backup with ${parsed.errorCount} validation error(s). Resolve data inconsistencies first.`
    );
  }

  const sealedBatch = await sealMigrationBatch(parsed, resolutions);

  return executeSecuredCsvMigration({
    sealedBatch,
    actorEmail,
    actorId,
    nonEmptyOverride: true,
    onProgress,
  });
}
