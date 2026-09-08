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
console.log(`⚙️  Release Publisher [${mode.toUpperCase()}]`);
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

// 6. Check existing row in Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const { data: existingRow } = await supabase
  .from('app_releases')
  .select('download_url')
  .eq('platform', 'android')
  .eq('environment', mode)
  .maybeSingle();

let downloadUrl = existingRow?.download_url || 'https://paste-your-download-link-here.com';
let storageHost = 'Catbox CDN';
let isPlanB = false;

// 7. Auto-upload attempt (5 retries) or Plan B
const MAX_RETRIES = 5;
let uploadSuccess = false;

if (noUpload) {
  console.log('\n⏭️  Skipping Catbox upload (--no-upload requested).');
  isPlanB = true;
} else {
  console.log(`\n🚀 Uploading APK to Catbox CDN (Max ${MAX_RETRIES} attempts)...`);
  const catbox = new Catbox(CATBOX_USER_HASH);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`⏳ [Attempt ${attempt}/${MAX_RETRIES}] Connecting & uploading...`);
      downloadUrl = await catbox.uploadFile({ path: rawApkPath });
      storageHost = 'Catbox CDN';
      uploadSuccess = true;
      console.log(`✅ Uploaded to Catbox: ${downloadUrl}`);
      break;
    } catch (err) {
      console.warn(`⚠️  Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        console.log(`🔄 Waiting 2 seconds before retry...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  if (!uploadSuccess) {
    console.warn(`\n⚠️  All 5 upload attempts failed (ISP/Catbox connection error).`);
    console.log(`🛡️  Proceeding to PLAN B: Renaming file for manual upload...`);
    isPlanB = true;
  }
}

// ─── PLAN B: RENAME FILE & SHOW DIRECTORY ───
const outputDir = path.dirname(rawApkPath);
const renamedApkPath = path.resolve(outputDir, customFileName);

// Copy/rename file to match the desired package name (e.g. palomar-gym-v0.24.3.apk)
if (rawApkPath !== renamedApkPath) {
  fs.copyFileSync(rawApkPath, renamedApkPath);
}

if (isPlanB) {
  storageHost = 'Manual / Catbox CDN';
}

// 8. Upsert release row into Supabase
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

// 9. Final Output & Instructions
console.log(`\n======================================================`);
if (isPlanB) {
  // Parse project ID to generate a direct link to the Supabase Table Editor
  const projectRef = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
  const supabaseTableUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/editor`
    : 'https://supabase.com/dashboard';

  console.log(`📁 PLAN B ACTIVATED: MANUAL UPLOAD READY`);
  console.log(`======================================================`);
  console.log(`📦 File:          ${customFileName} (${fileSizeMB} MB)`);
  console.log(`📂 Folder:        ${outputDir}`);
  console.log(`📍 Full Filepath: ${renamedApkPath}`);
  console.log(`\n👉 INSTRUCTIONS:`);
  console.log(`1. Upload APK here:     👉 https://catbox.moe/`);
  console.log(`2. Open Supabase Table: 👉 ${supabaseTableUrl}`);
  console.log(`3. Paste the Catbox URL into 'download_url' for [${mode}].\n`);
} else {
  console.log(`🎉 RELEASE COMPLETE [${mode.toUpperCase()}]`);
  console.log(`======================================================`);
  console.log(`📦 File:        ${customFileName} (${fileSizeMB} MB)`);
  console.log(`🔗 Catbox URL:  ${downloadUrl}\n`);
}