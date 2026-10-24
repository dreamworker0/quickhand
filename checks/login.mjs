// Opens the check profile in a plain browser window (not automated, so Google
// accepts the sign-in). Sign in to Google there, then close the window; the
// checks reuse the same profile and its login.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { BROWSER, PROFILE } from './lib.mjs';

const pf = process.env.ProgramFiles;
const pf86 = process.env['ProgramFiles(x86)'];
const local = process.env.LOCALAPPDATA;
const CANDIDATES = {
  chrome: [`${pf}\\Google\\Chrome\\Application\\chrome.exe`, `${pf86}\\Google\\Chrome\\Application\\chrome.exe`, `${local}\\Google\\Chrome\\Application\\chrome.exe`],
  msedge: [`${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`, `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`],
};
const exe = (CANDIDATES[BROWSER] || []).find((p) => fs.existsSync(p));
if (!exe) throw new Error(`${BROWSER} not found`);

fs.mkdirSync(PROFILE, { recursive: true });
const win = spawn(exe, [`--user-data-dir=${PROFILE}`, '--no-first-run', '--new-window', 'https://accounts.google.com/'], { stdio: 'ignore' });
win.on('exit', () => console.log('login window closed'));
