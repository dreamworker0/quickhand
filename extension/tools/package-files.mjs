// What goes into the extension package: what it needs at run time and nothing
// else (no tests, tools or notes). Shared by pack.mjs and pack-testers.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INCLUDE = ['manifest.json', '_locales', 'assets', 'src'];

export function version() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
}

// Every packaged file as a path relative to ROOT with "/" separators, sorted.
export function packageFiles() {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(ROOT, rel);
    if (fs.statSync(abs).isDirectory()) for (const name of fs.readdirSync(abs)) walk(rel + '/' + name);
    else out.push(rel);
  };
  INCLUDE.forEach(walk);
  return out.sort();
}
