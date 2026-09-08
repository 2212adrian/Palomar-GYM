// scripts/release-runner.mjs
import { execSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const modeArg = args.find((a) => a.startsWith('--mode='));
const mode = modeArg ? modeArg.split('=')[1] : 'production';
const noUpload = args.includes('--no-upload') || args.includes('--manual');
const isWin = process.platform === 'win32';
const gradlewCmd = isWin ? 'gradlew.bat' : './gradlew';

const run = (cmd, cwd = process.cwd()) => {
  console.log(`\n▶️  ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
};

try {
  run(`npm run build -- --mode ${mode}`);
  run(`npx cap sync android`);
  run(`${gradlewCmd} assembleRelease -x lintVitalRelease`, path.resolve('android'));
  
  // Forward --no-upload flag to publish script
  run(`node scripts/publish-update.mjs --mode=${mode} ${noUpload ? '--no-upload' : ''}`);
} catch (err) {
  console.error('\n❌ Build or release pipeline failed.');
  process.exit(1);
}