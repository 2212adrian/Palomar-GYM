// scripts/publish-update.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import dotenv from 'dotenv';

const rootDir = process.cwd();

// 1. Determine environment mode & flags
const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : (process.env.NODE_ENV || 'production');

const urlArg = args.find((a) => a.startsWith('--url='));
const cliProvidedUrl = urlArg ? urlArg.split('=')[1]?.trim() : null;

const isManual = args.includes('--manual');
const noUpload = args.includes('--no-upload');

console.log(`\n======================================================`);
console.log(`⚙️  Release Publisher [${mode.toUpperCase()}]`);
console.log(`======================================================`);

// 2. Load environment variables
dotenv.config({ path: path.resolve(rootDir, '.env') });
dotenv.config({ path: path.resolve(rootDir, `.env.${mode}`), override: true });
dotenv.config({ path: path.resolve(rootDir, `.env.${mode}.local`), override: true });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const FF_ACCOUNT_ID =
  process.env.FUCKINGFAST_ACCOUNT_ID ||
  process.env.FUCKINGFAST_TOKEN ||
  process.env.FUCKINGFAST_API_KEY ||
  '';
const FF_PARENT_ID = process.env.FUCKINGFAST_PARENT_ID || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.${mode}`);
  process.exit(1);
}

// 3. Version and file naming from package.json
const pkg = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf-8'));
const version = pkg.version;
const isDev = mode === 'development';
const customFileName = `${pkg.name}-v${version}${isDev ? '-dev' : ''}.apk`;

// 4. Locate compiled APK
const apkPaths = [
  path.resolve(rootDir, 'android/app/build/outputs/apk/release/app-release.apk'),
  path.resolve(rootDir, 'android/app/build/outputs/apk/release/app-release-unsigned.apk'),
];
const rawApkPath = apkPaths.find((p) => fs.existsSync(p));

if (!rawApkPath) {
  console.error(`❌ No release APK found in android/app/build/outputs/apk/release/`);
  process.exit(1);
}

const stats = fs.statSync(rawApkPath);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

// Prepare renamed file in the output directory
const outputDir = path.dirname(rawApkPath);
const renamedApkPath = path.resolve(outputDir, customFileName);
if (rawApkPath !== renamedApkPath) {
  fs.copyFileSync(rawApkPath, renamedApkPath);
}

// 5. Extract release notes from CHANGELOG.md
let releaseNotes = '';
const changelogPath = path.resolve(rootDir, 'CHANGELOG.md');
if (fs.existsSync(changelogPath)) {
  const changelog = fs.readFileSync(changelogPath, 'utf-8');
  const cleanVer = version.replace(/^v/, '');
  const pattern = new RegExp(
    `##\\s*\\[?v?${cleanVer}\\]?[^\\n]*\\n([\\s\\S]*?)(?=(?:\\n##\\s*\\[?v?\\d)|\\Z)`,
    'i'
  );
  const match = changelog.match(pattern);
  if (match && match[1].trim()) {
    releaseNotes = match[1].trim();
  }
}

if (!releaseNotes) {
  releaseNotes = `${pkg.name} v${version} (${mode}) update.`;
}

// 6. Connect to Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data: existingRow } = await supabase
  .from('app_releases')
  .select('download_url, storage_host')
  .eq('platform', 'android')
  .eq('environment', mode)
  .maybeSingle();

// ─── Helper Functions ───
async function resolveDirectoryId(token) {
  if (FF_PARENT_ID) return FF_PARENT_ID;
  if (!token) return null;

  try {
    const res = await fetch('https://fuckingfast.net/api/fs', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.id || data?.data?.id || null;
  } catch {
    return null;
  }
}

function extractFileId(rawText) {
  const text = rawText.trim();
  try {
    const json = JSON.parse(text);
    const id = json?.id || json?.data?.id || json?.file?.id || json?.fileId;
    if (id) return id;
    if (json?.url) return json.url.split('/').filter(Boolean).pop();
  } catch {}

  const match = text.match(/"id"\s*:\s*"([^"]+)"/);
  if (match?.[1]) return match[1];

  if (/^[a-zA-Z0-9_-]{6,32}$/.test(text)) return text;
  return text.split('/').filter(Boolean).pop();
}

/**
 * Attempts automated resolution of the direct download link.
 * Handles Cloudflare Turnstile blocks gracefully without crashing.
 */
async function attemptAutomatedResolution(fileId) {
  const pageUrl = `https://fuckingfast.net/${fileId}`;
  console.log(`🔍 Checking if direct URL can be resolved automatically...`);

  try {
    const pageRes = await fetch(pageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (pageRes.status === 403) {
      console.log(`   ℹ️ FuckingFast web landing page is guarded by Cloudflare Turnstile (HTTP 403).`);
      return null;
    }

    if (!pageRes.ok) {
      console.log(`   ℹ️ Landing page returned HTTP ${pageRes.status}.`);
      return null;
    }

    const html = await pageRes.text();

    // Check for inline direct streaming links
    const directMatch = html.match(
      /https?:\/\/(?:[a-z0-9.-]+\.)?(?:fafda\.to|fuckingfast\.net)\/(?:d|dl)\/[a-zA-Z0-9_-]+(?:\?[^"'\s<>\\]+)?/i
    );
    if (directMatch) {
      return directMatch[0].replaceAll('&amp;', '&');
    }

    const windowOpenMatch = html.match(/window\.open\(\s*["'](https?:\/\/[^"']+)["']/i);
    if (windowOpenMatch) {
      return windowOpenMatch[1].replaceAll('&amp;', '&');
    }
  } catch (err) {
    console.log(`   ℹ️ Automated check skipped: ${err.message}`);
  }

  return null;
}

// ─── PHASE 1: APK UPLOAD (Decoupled from URL Resolution) ───
let fileId = null;
const MAX_UPLOAD_RETRIES = 3;

if (noUpload) {
  console.log(`\n⏭️  Skipping APK upload (--no-upload requested).`);
} else {
  console.log(`\n🚀 Uploading APK to FuckingFast (Max ${MAX_UPLOAD_RETRIES} attempts)...`);

  const parentId = await resolveDirectoryId(FF_ACCOUNT_ID);
  const encodedName = encodeURIComponent(customFileName);
  const uploadEndpoint = parentId
    ? `https://w.fuckingfast.net/${parentId}/${encodedName}`
    : `https://w.fuckingfast.net/${encodedName}`;

  const fileBuffer = fs.readFileSync(rawApkPath);
  const headers = {
    'Content-Type': 'application/vnd.android.package-archive',
  };
  if (FF_ACCOUNT_ID) {
    headers['Authorization'] = `Bearer ${FF_ACCOUNT_ID}`;
  }

  for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      console.log(`⏳ [Upload Attempt ${attempt}/${MAX_UPLOAD_RETRIES}] Sending file (${fileSizeMB} MB)...`);
      const response = await fetch(uploadEndpoint, {
        method: 'PUT',
        headers,
        body: fileBuffer,
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`Upload HTTP ${response.status}: ${responseText || response.statusText}`);
      }

      fileId = extractFileId(responseText);
      console.log(`\n✅ Upload successful`);
      console.log(`📦 File ID: ${fileId}`);
      break;
    } catch (err) {
      console.warn(`⚠️  Upload attempt ${attempt}/${MAX_UPLOAD_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_UPLOAD_RETRIES) {
        console.log(`🔄 Waiting 2 seconds before retrying upload...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  if (!fileId) {
    console.error(`\n❌ UPLOAD FAILURE: All ${MAX_UPLOAD_RETRIES} upload attempts failed.`);
    process.exit(1);
  }
}

// ─── PHASE 2: DIRECT DOWNLOAD URL RESOLUTION ───
let resolvedDirectUrl = cliProvidedUrl || null;

// Only attempt resolution if URL wasn't provided via CLI flag
if (!resolvedDirectUrl && fileId && !isManual) {
  resolvedDirectUrl = await attemptAutomatedResolution(fileId);
}

// If still unresolved, trigger manual resolution workflow
if (!resolvedDirectUrl) {
  const landingPageUrl = fileId ? `https://fuckingfast.net/${fileId}` : null;

  console.log(`\n------------------------------------------------------`);
  if (fileId) {
    console.log(`⚠️  Direct URL could not be resolved automatically.`);
    console.log(`The APK was uploaded successfully and was NOT uploaded again.`);
    console.log(`Landing Page: ${landingPageUrl}`);
  } else {
    console.log(`⚠️  Manual URL input required.`);
  }
  console.log(`------------------------------------------------------`);

  // If interactive terminal, prompt the developer directly
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output });
    console.log(`👉 Open: ${landingPageUrl || 'https://fuckingfast.net/'}`);
    console.log(`   Click "Copy download link" (direct link, e.g. https://...fafda.to/... or https://ts.fuckingfast.net/d/...)`);

    const answer = await rl.question(`\nPaste direct download URL (or press Enter to skip database update): `);
    rl.close();

    if (answer && answer.trim().startsWith('http')) {
      resolvedDirectUrl = answer.trim();
    }
  }
}

// Validate that we never write the landing page or a placeholder URL to Supabase
if (
  resolvedDirectUrl &&
  (resolvedDirectUrl.includes('fuckingfast.net/') && !resolvedDirectUrl.includes('/d/'))
) {
  console.warn(`\n⚠️  The provided URL appears to be a landing page, not a direct download link.`);
  console.warn(`Refusing to save landing page as direct download URL.`);
  resolvedDirectUrl = null;
}

if (!resolvedDirectUrl) {
  console.log(`\n======================================================`);
  console.log(`⚠️  RELEASE INCOMPLETE: Supabase was NOT updated`);
  console.log(`======================================================`);
  console.log(`📦 File:          ${customFileName} (${fileSizeMB} MB)`);
  if (fileId) {
    console.log(`🔗 File ID:       ${fileId}`);
    console.log(`🌐 Landing Page:  https://fuckingfast.net/${fileId}`);
  }
  console.log(`\n👉 NEXT STEPS:`);
  console.log(`1. Open the landing page in your browser.`);
  console.log(`2. Click "Copy download link" to copy the fafda.to URL.`);
  console.log(`3. Run this command to update Supabase without re-uploading:`);
  console.log(`   npm run upload:${mode === 'development' ? 'dev' : 'prod'} -- --no-upload --url="<PASTE_FAFDA_URL_HERE>"\n`);
  process.exit(1);
}

// ─── PHASE 3: DATABASE UPDATE ───
const storageHost = new URL(resolvedDirectUrl).hostname;

console.log(`\nUpdating Supabase...`);
const { error: dbError } = await supabase.from('app_releases').upsert(
  {
    platform: 'android',
    environment: mode,
    version,
    file_name: customFileName,
    file_size_bytes: stats.size,
    release_notes: releaseNotes,
    download_url: resolvedDirectUrl,
    storage_host: storageHost,
    is_active: true,
    updated_at: new Date().toISOString(),
  },
  { onConflict: 'platform,environment' }
);

if (dbError) {
  console.error('❌ Supabase upsert failed:', dbError.message);
  process.exit(1);
}

console.log(`\n======================================================`);
console.log(`🎉 RELEASE COMPLETE [${mode.toUpperCase()}]`);
console.log(`======================================================`);
console.log(`📦 File:                     ${customFileName} (${fileSizeMB} MB)`);
if (fileId) {
  console.log(`🆔 File ID:                  ${fileId}`);
}
console.log(`⚡ Instant Download URL:     ${resolvedDirectUrl}\n`);