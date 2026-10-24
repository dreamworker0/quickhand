// Builds the Chrome Web Store upload: ../dist/quickhand-<version>.zip with only
// what the extension needs at run time (no tests, tools or notes).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const INCLUDE = ['manifest.json', '_locales', 'assets', 'src'];

const dist = path.resolve(root, '../dist');
fs.mkdirSync(dist, { recursive: true });
const out = path.join(dist, `quickhand-${version}.zip`);
// Not fs.rmSync: on Windows, Node 24's version quits silently on paths with
// Korean letters, such as this project's folder.
if (fs.existsSync(out)) fs.unlinkSync(out);

// Windows' own tar.exe (bsdtar) writes zip files with "/" paths, as the store
// expects; elsewhere the usual zip command does.
const [cmd, args] = process.platform === 'win32'
  ? [path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-a', '-c', '-f', out, ...INCLUDE]]
  : ['zip', ['-r', '-q', out, ...INCLUDE]];
const run = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
if (run.error || run.status !== 0) {
  console.error(`packing failed: ${run.error ? run.error.message : run.stderr || `exit ${run.status}`}`);
  process.exit(1);
}
console.log(`${path.relative(process.cwd(), out)}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
