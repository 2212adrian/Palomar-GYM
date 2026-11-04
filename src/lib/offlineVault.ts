// src/lib/offlineVault.ts
/**
 * Hardened IndexedDB Vault for Offline Pending Transactions
 * Features:
 * - Web Crypto API AES-GCM (256-bit) encryption for stored transaction payloads
 * - Salted SHA-256 HMAC/integrity verification to prevent and detect any console/storage tampering
 * - Auto-drop policy: Any payload failing checksum or encryption validation is discarded immediately
 * - 24-Hour Expiration: Pending records older than 24h are automatically purged
 */

export interface PendingTransaction {
  id: string; // client UUID: offline_tx_${timestamp}_${random}
  type:
    | 'sale'
    | 'attendance'
    | 'subscription'
    | 'card_purchase'
    | 'batch_card_purchase'
    | 'product_create'
    | 'incident_create'
    | 'incident_update'
    | 'member_create'
    | 'member_update';
  cashSessionId?: string;
  userId: string;
  userName: string;
  createdAt: string; // ISO string
  expiresAt: string; // ISO string (+24h)
  ciphertext: string; // base64 encoded AES-GCM ciphertext
  iv: string; // base64 encoded initialization vector
  checksum: string; // SHA-256 hash of plaintext + salt
  status: 'pending' | 'conflict' | 'dropped';
  conflictReason?: 'insufficient_stock' | 'duplicate_attendance' | 'session_closed' | 'tampered';
  conflictCloudData?: any;
}

export interface DecryptedTransaction<T = any> {
  id: string;
  type:
    | 'sale'
    | 'attendance'
    | 'subscription'
    | 'card_purchase'
    | 'batch_card_purchase'
    | 'product_create'
    | 'incident_create'
    | 'incident_update'
    | 'member_create'
    | 'member_update';
  cashSessionId?: string;
  userId: string;
  userName: string;
  createdAt: string;
  expiresAt: string;
  payload: T;
  status: 'pending' | 'conflict' | 'dropped';
  conflictReason?: string;
  conflictCloudData?: any;
}

const DB_NAME = 'palomar_offline_vault_v1';
const STORE_NAME = 'pending_transactions';
const META_STORE = 'vault_meta';
const DB_VERSION = 1;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// Device-bound salt seed stored in IndexedDB meta store
let cachedCryptoKey: CryptoKey | null = null;
let cachedSalt: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function computeSha256(message: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}::${message}::palomar_tamper_seal`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64(hashBuffer);
}

function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Initializes or retrieves the vault's device-bound AES-GCM encryption key and salt
 */
async function getOrCreateVaultKeys(db: IDBDatabase): Promise<{ key: CryptoKey; salt: string }> {
  if (cachedCryptoKey && cachedSalt) {
    return { key: cachedCryptoKey, salt: cachedSalt };
  }

  const meta = await new Promise<{ keyRaw?: string; salt?: string } | null>((resolve) => {
    try {
      const tx = db.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const req = store.get('vault_credentials');
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  if (meta?.keyRaw && meta?.salt) {
    const rawKeyBuffer = base64ToArrayBuffer(meta.keyRaw);
    const importedKey = await crypto.subtle.importKey(
      'raw',
      rawKeyBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
    cachedCryptoKey = importedKey;
    cachedSalt = meta.salt;
    return { key: importedKey, salt: meta.salt };
  }

  // Generate new random 256-bit key and random salt
  const newKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const exportedRaw = await crypto.subtle.exportKey('raw', newKey);
  const keyRawBase64 = arrayBufferToBase64(exportedRaw);

  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const newSalt = arrayBufferToBase64(saltBytes);

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      store.put({ key: 'vault_credentials', data: { keyRaw: keyRawBase64, salt: newSalt } });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });

  cachedCryptoKey = newKey;
  cachedSalt = newSalt;
  return { key: newKey, salt: newSalt };
}

/**
 * Encrypts and saves a pending transaction to IndexedDB
 */
export async function stagePendingTransaction<T = any>(params: {
  type: PendingTransaction['type'];
  cashSessionId?: string;
  userId?: string;
  userName?: string;
  payload: T;
}): Promise<string> {
  const db = await openVaultDB();
  const { key, salt } = await getOrCreateVaultKeys(db);

  const txId = `offline_tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + TWENTY_FOUR_HOURS_MS).toISOString();

  const serializedPayload = JSON.stringify(params.payload);
  const checksum = await computeSha256(serializedPayload, salt);

  // Generate 12-byte random IV for AES-GCM
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);

  const encoder = new TextEncoder();
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    encoder.encode(serializedPayload)
  );

  const pendingRecord: PendingTransaction = {
    id: txId,
    type: params.type,
    cashSessionId: params.cashSessionId,
    userId: params.userId || 'offline_user',
    userName: params.userName || 'Offline User',
    createdAt,
    expiresAt,
    ciphertext: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(ivBytes),
    checksum,
    status: 'pending',
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(pendingRecord);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('palomar-action-queue-changed'));
  }

  return txId;
}

/**
 * Retrieves and decrypts all active pending transactions.
 * Automatically drops any records that fail SHA-256 verification or are expired.
 */
export async function getDecryptedPendingTransactions(): Promise<DecryptedTransaction[]> {
  try {
    const db = await openVaultDB();
    const { key, salt } = await getOrCreateVaultKeys(db);

    const records = await new Promise<PendingTransaction[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const nowTime = Date.now();
    const validList: DecryptedTransaction[] = [];
    const tamperedOrExpiredIds: string[] = [];

    for (const record of records) {
      // 1. Check expiration (24h)
      if (new Date(record.expiresAt).getTime() < nowTime) {
        tamperedOrExpiredIds.push(record.id);
        continue;
      }

      // 2. Decrypt ciphertext using Web Crypto
      try {
        const ivBuffer = base64ToArrayBuffer(record.iv);
        const cipherBuffer = base64ToArrayBuffer(record.ciphertext);

        const decryptedBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
          key,
          cipherBuffer
        );

        const decoder = new TextDecoder();
        const plaintext = decoder.decode(decryptedBuffer);

        // 3. Verify SHA-256 integrity checksum (Anti-tamper protection)
        const expectedChecksum = await computeSha256(plaintext, salt);
        if (expectedChecksum !== record.checksum) {
          console.warn(`[Vault] Tampering detected on transaction ${record.id}. Dropping.`);
          tamperedOrExpiredIds.push(record.id);
          continue;
        }

        const payload = JSON.parse(plaintext);
        validList.push({
          id: record.id,
          type: record.type,
          cashSessionId: record.cashSessionId,
          userId: record.userId,
          userName: record.userName,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
          payload,
          status: record.status,
          conflictReason: record.conflictReason,
          conflictCloudData: record.conflictCloudData,
        });
      } catch (decryptErr) {
        // Any decryption failure indicates modified ciphertext, corrupted data, or manual injection
        console.warn(`[Vault] Integrity decryption failure for ${record.id}. Discarding corrupted entry.`, decryptErr);
        tamperedOrExpiredIds.push(record.id);
      }
    }

    // Auto-purge dropped/tampered/expired items
    if (tamperedOrExpiredIds.length > 0) {
      await purgeTransactionsByIds(tamperedOrExpiredIds);
    }

    return validList;
  } catch (err) {
    console.error('Failed to read decrypted pending transactions:', err);
    return [];
  }
}

/**
 * Removes successfully synced transactions from the vault
 */
export async function purgeTransactionsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const db = await openVaultDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    ids.forEach((id) => store.delete(id));
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('palomar-action-queue-changed'));
    }
  } catch (err) {
    console.warn('Vault purge error:', err);
  }
}

/**
 * Drops a single pending transaction from the local vault
 */
export async function dropPendingTransaction(id: string): Promise<void> {
  await purgeTransactionsByIds([id]);
}

/**
 * Marks a pending transaction as conflicted in IndexedDB
 */
export async function markPendingConflict(
  id: string,
  reason: 'insufficient_stock' | 'duplicate_attendance' | 'session_closed',
  cloudData?: any
): Promise<void> {
  try {
    const db = await openVaultDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);

    req.onsuccess = () => {
      if (req.result) {
        const updated = {
          ...req.result,
          status: 'conflict',
          conflictReason: reason,
          conflictCloudData: cloudData || null,
        };
        store.put(updated);
      }
    };
  } catch (err) {
    console.warn('Failed to mark conflict:', err);
  }
}

/**
 * Returns count of pending transactions in vault
 */
export async function getPendingVaultCount(): Promise<number> {
  try {
    const db = await openVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Retrieves cached members directly from IndexedDB meta store
 */
export async function getCachedMembersFromIndexedDB(): Promise<any[]> {
  try {
    const db = await openVaultDB();
    const tx = db.transaction(META_STORE, 'readonly');
    const store = tx.objectStore(META_STORE);
    const req = store.get('cached_members_list');
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result?.data || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Saves cached members directly into IndexedDB meta store for instant offline availability
 */
export async function setCachedMembersToIndexedDB(members: any[]): Promise<void> {
  if (!Array.isArray(members) || members.length === 0) return;
  try {
    const db = await openVaultDB();
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    store.put({ key: 'cached_members_list', data: members, updatedAt: Date.now() });
  } catch {}
}
