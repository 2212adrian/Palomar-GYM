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
const noUpload = args.includes('--no-upload') || isManual;

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

// ALWAYS PRINT FILE DETAILS
console.log(`\n======================================================`);
console.log(`📦 COMPILED APK READY`);
console.log(`======================================================`);
console.log(`📁 Directory: ${outputDir}`);
console.log(`📄 File Name: ${customFileName}`);
console.log(`📍 Full Path: ${renamedApkPath}`);
console.log(`📊 File Size: ${fileSizeMB} MB`);
console.log(`======================================================\n`);

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

async function attemptAutomatedResolution(fileId) {
  const pageUrl = `https://fuckingfast.net/${fileId}`;
  try {
    const pageRes = await fetch(pageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (pageRes.status === 403 || !pageRes.ok) return null;

    const html = await pageRes.text();
    const directMatch = html.match(
      /https?:\/\/(?:[a-z0-9.-]+\.)?(?:fafda\.to|fuckingfast\.net)\/(?:d|dl)\/[a-zA-Z0-9_-]+(?:\?[^"'\s<>\\]+)?/i
    );
    if (directMatch) return directMatch[0].replaceAll('&amp;', '&');

    const windowOpenMatch = html.match(/window\.open\(\s*["'](https?:\/\/[^"']+)["']/i);
    if (windowOpenMatch) return windowOpenMatch[1].replaceAll('&amp;', '&');
  } catch {
    return null;
  }
  return null;
}

// ─── PHASE 1: APK UPLOAD ───
let fileId = null;

if (noUpload) {
  console.log(`⏭️  Skipping hosting upload. Manual URL entry mode activated.`);
} else {
  console.log(`🚀 Uploading APK to FuckingFast...`);
  const MAX_UPLOAD_RETRIES = 3;
  const parentId = await resolveDirectoryId(FF_ACCOUNT_ID);
  const encodedName = encodeURIComponent(customFileName);
  const uploadEndpoint = parentId
    ? `https://w.fuckingfast.net/${parentId}/${encodedName}`
    : `https://w.fuckingfast.net/${encodedName}`;

  const fileBuffer = fs.readFileSync(rawApkPath);
  const headers = { 'Content-Type': 'application/vnd.android.package-archive' };
  if (FF_ACCOUNT_ID) headers['Authorization'] = `Bearer ${FF_ACCOUNT_ID}`;

  for (let attempt = 1; attempt <= MAX_UPLOAD_RETRIES; attempt++) {
    try {
      console.log(`⏳ [Upload Attempt ${attempt}/${MAX_UPLOAD_RETRIES}] Sending file (${fileSizeMB} MB)...`);
      const response = await fetch(uploadEndpoint, {
        method: 'PUT',
        headers,
        body: fileBuffer,
      });

      const responseText = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${responseText}`);

      fileId = extractFileId(responseText);
      console.log(`✅ Upload successful! File ID: ${fileId}`);
      break;
    } catch (err) {
      console.warn(`⚠️  Upload attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_UPLOAD_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  if (!fileId) {
    console.error(`\n❌ UPLOAD FAILURE: All attempts failed.`);
    process.exit(1);
  }
}

// ─── PHASE 2: DIRECT DOWNLOAD URL RESOLUTION ───
let resolvedDirectUrl = cliProvidedUrl || null;

if (!resolvedDirectUrl && fileId && !isManual) {
  resolvedDirectUrl = await attemptAutomatedResolution(fileId);
}

// Prompt user for input if URL is not yet determined
if (!resolvedDirectUrl) {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input, output });

    if (noUpload) {
      console.log(`👉 Step 1: Upload the APK from the path shown above to your hosting service.`);
      console.log(`👉 Step 2: Paste the direct download link below.\n`);
    } else if (fileId) {
      console.log(`👉 Open: https://fuckingfast.net/${fileId}`);
      console.log(`   Click "Copy download link"\n`);
    }

    const answer = await rl.question(`Paste direct download URL (or press Enter to cancel): `);
    rl.close();

    if (answer && answer.trim().startsWith('http')) {
      resolvedDirectUrl = answer.trim();
    }
  } else {
    console.error(`❌ Terminal is not interactive. Pass the URL directly using --url="<LINK>"`);
    process.exit(1);
  }
}

// Validate URL format
if (resolvedDirectUrl) {
  try {
    new URL(resolvedDirectUrl);
  } catch {
    console.error(`\n❌ Invalid URL provided: ${resolvedDirectUrl}`);
    resolvedDirectUrl = null;
  }
}

if (!resolvedDirectUrl) {
  console.log(`\n⚠️  Supabase was NOT updated because no download URL was entered.`);
  process.exit(1);
}

// ─── PHASE 3: DATABASE UPDATE ───
const storageHost = new URL(resolvedDirectUrl).hostname;

console.log(`\nUpdating Supabase database...`);
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
console.log(`📦 File:                 ${customFileName} (${fileSizeMB} MB)`);
console.log(`🌐 Host:                 ${storageHost}`);
console.log(`⚡ Direct Download URL:  ${resolvedDirectUrl}\n`);