// Builds the hand-out for testers: ../dist/손빠르미-테스트판-<version>.zip with
// the guide (../testers/설치 안내.html, opened with a double-click) and the
// extension in a "손빠르미" folder to load unpacked. Names are stored as UTF-8
// (flag 0x800), which Windows' own unzip, 7-Zip and Bandizip read correctly.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, packageFiles, version as readVersion } from './package-files.mjs';

const version = readVersion();
const GUIDE = path.resolve(ROOT, '../testers/설치 안내.html');
const MASCOT = path.join(ROOT, 'assets/mascot/main.png');
const out = path.resolve(ROOT, `../dist/손빠르미-테스트판-${version}.zip`);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A plain deflate-only zip writer: just what this hand-out needs.
function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data, date } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = zlib.deflateRawSync(data);
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const fields = (sig, extra) => {
      const b = Buffer.alloc(extra ? 46 : 30);
      b.writeUInt32LE(sig, 0);
      let i = 4;
      if (extra) { b.writeUInt16LE(20, i); i += 2; } // made by
      b.writeUInt16LE(20, i); // needed
      b.writeUInt16LE(0x0800, i + 2); // UTF-8 names
      b.writeUInt16LE(8, i + 4); // deflate
      b.writeUInt16LE(time, i + 6);
      b.writeUInt16LE(day, i + 8);
      b.writeUInt32LE(crc32(data), i + 10);
      b.writeUInt32LE(packed.length, i + 14);
      b.writeUInt32LE(data.length, i + 18);
      b.writeUInt16LE(nameBuf.length, i + 22);
      if (extra) b.writeUInt32LE(offset, 42); // local header offset (other fields stay 0)
      return b;
    };
    const local = fields(0x04034b50, false);
    parts.push(local, nameBuf, packed);
    central.push(fields(0x02014b50, true), nameBuf);
    offset += local.length + nameBuf.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

const now = new Date();
// The page is one file: the mascot goes in as image data.
const guide = fs.readFileSync(GUIDE, 'utf8')
  .replaceAll('{version}', version)
  .replaceAll('{mascot}', 'data:image/png;base64,' + fs.readFileSync(MASCOT).toString('base64'));
const entries = [{ name: '설치 안내.html', data: Buffer.from(guide, 'utf8'), date: now }];
for (const rel of packageFiles()) {
  const abs = path.join(ROOT, rel);
  entries.push({ name: '손빠르미/' + rel, data: fs.readFileSync(abs), date: fs.statSync(abs).mtime });
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zip(entries));
console.log(`${path.relative(process.cwd(), out)}  ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${entries.length - 1} extension files`);
