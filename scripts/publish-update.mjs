// scripts/publish-update.mjs
import { Catbox } from 'node-catbox';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const rootDir = process.cwd();

// 1. Determine environment mode & flags
const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : (process.env.NODE_ENV || 'production');
const noUpload = args.includes('--no-upload') || args.includes('--manual');

console.log(`\n======================================================`);
console.log(`⚙️  Release Publisher [${mode.toUpperCase()}] | Upload: ${noUpload ? 'MANUAL' : 'AUTO (Catbox)'}`);
console.log(`======================================================`);

// 2. Load environment variables
dotenv.config({ path: path.resolve(rootDir, '.env') });
dotenv.config({ path: path.resolve(rootDir, `.env.${mode}`), override: true });
dotenv.config({ path: path.resolve(rootDir, `.env.${mode}.local`), override: true });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CATBOX_USER_HASH = process.env.CATBOX_USER_HASH || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(`❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.${mode}`);
  process.exit(1);
}

// 3. Version and file naming from package.json
const pkg = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf-8'));
const version = pkg.version;
const isDev = mode === 'development';
const customFileName = `${pkg.name}-v${version}${isDev ? '-dev' : ''}.apk`;

// 4. Locate APK
const apkPaths = [
  path.resolve(rootDir, 'android/app/build/outputs/apk/release/app-release.apk'),
  path.resolve(rootDir, 'android/app/build/outputs/apk/release/app-release-unsigned.apk'),
];
const apkPath = apkPaths.find((p) => fs.existsSync(p));

if (!apkPath) {
  console.error(`❌ No release APK found in android/app/build/outputs/apk/release/`);
  process.exit(1);
}

const stats = fs.statSync(apkPath);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

// 5. Extract release notes from CHANGELOG.md
let releaseNotes = '';
const changelogPath = path.resolve(rootDir, 'CHANGELOG.md');
if (fs.existsSync(changelogPath)) {
  const changelog = fs.readFileSync(changelogPath, 'utf-8');
  const cleanVer = version.replace(/^v/, '');
  const pattern = new RegExp(`##\\s*\\[?v?${cleanVer}\\]?[^\\n]*\\n([\\s\\S]*?)(?=(?:\\n##\\s*\\[?v?\\d)|\\Z)`, 'i');
  const match = changelog.match(pattern);
  if (match && match[1].trim()) {
    releaseNotes = match[1].trim();
  }
}

if (!releaseNotes) {
  releaseNotes = `${pkg.name} v${version} (${mode}) update.`;
}

console.log(`📦 File: ${customFileName} (${fileSizeMB} MB)`);
console.log(`📍 Path: ${apkPath}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 6. Check existing row to preserve existing download_url if in manual mode
const { data: existingRow } = await supabase
  .from('app_releases')
  .select('download_url')
  .eq('platform', 'android')
  .eq('environment', mode)
  .maybeSingle();

let downloadUrl = existingRow?.download_url || 'https://paste-your-download-link-here.com';
let storageHost = 'Catbox CDN';

// 7. Auto-upload to Catbox (or fallback to manual if flagged/blocked)
if (noUpload) {
  console.log('⏭️  Skipping Catbox upload (--no-upload flag enabled).');
  storageHost = 'Manual / Catbox CDN';
} else {
  console.log('\n🚀 Uploading APK to Catbox CDN...');
  try {
    const catbox = new Catbox(CATBOX_USER_HASH);
    downloadUrl = await catbox.uploadFile({ path: apkPath });
    storageHost = 'Catbox CDN';
    console.log(`✅ Uploaded to Catbox: ${downloadUrl}`);
  } catch (err) {
    console.warn(`\n⚠️  Catbox upload failed (${err.message}).`);
    console.warn(`👉 ISP is likely blocking Catbox. Switching to manual mode.`);
    storageHost = 'Manual / Catbox CDN';
  }
}

// 8. Upsert: Only ONE row exists for dev and ONE for prod
console.log(`\n📝 Upserting release in Supabase for [${mode}]...`);
const { error: dbError } = await supabase.from('app_releases').upsert(
  {
    platform: 'android',
    environment: mode,
    version,
    file_name: customFileName,
    file_size_bytes: stats.size,
    release_notes: releaseNotes,
    download_url: downloadUrl,
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
console.log(`🎉 RELEASE UPSERT SUCCESSFUL [${mode.toUpperCase()}]`);
console.log(`======================================================`);
console.log(`📦 File:        ${customFileName} (${fileSizeMB} MB)`);
console.log(`🔗 URL in DB:   ${downloadUrl}`);

if (downloadUrl.includes('paste-your-download-link') || noUpload) {
  console.log(`\n👉 MANUAL ACTION:`);
  console.log(`1. Upload: ${apkPath}`);
  console.log(`2. Paste link into Supabase 'download_url' for [${mode}].\n`);
}