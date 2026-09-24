// scripts/release-runner.mjs
import { execSync } from 'node:child_process';
import path from 'node:path';

const rootDir = process.cwd();
const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'production';
const isManual = args.includes('--manual');
const noUpload = args.includes('--no-upload') || isManual;
const isWin = process.platform === 'win32';
const gradlewCmd = isWin ? 'gradlew.bat' : './gradlew';

const run = (cmd, cwd = rootDir) => {
  console.log(`\n▶️  ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

try {
  run(`npm run build -- --mode ${mode}`);
  run(`npx cap sync android`);
  run(`${gradlewCmd} assembleRelease -x lintVitalRelease`, path.resolve(rootDir, 'android'));

  // Forward flags
  const forwardFlags = [`--mode=${mode}`];
  if (noUpload) forwardFlags.push('--no-upload');
  if (isManual) forwardFlags.push('--manual');

  run(`node scripts/publish-update.mjs ${forwardFlags.join(' ')}`);
} catch (err) {
  console.error('\n❌ Build or release pipeline failed.');
  process.exit(1);
}