#!/usr/bin/env node
// Zip a built target folder into a shareable, Web-Store-ready artifact.
// Dependency-free (Node zlib) so it needs no `zip` binary. Assumes the target
// is already built. Usage: node scripts/package.mjs [--firefox]

import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIREFOX = process.argv.includes('--firefox');
const TARGET = FIREFOX ? 'firefox' : 'chrome';
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const SRC = join(ROOT, 'dist', TARGET);
const OUT = join(ROOT, 'dist', `daddylens-${TARGET}-${version}.zip`);

// --- CRC32 -----------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// --- Minimal ZIP writer (deflate) ------------------------------------------
function listFiles(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else out.push({ rel, data: readFileSync(full) });
  }
  return out;
}

const files = listFiles(SRC);
const locals = [];
const centrals = [];
let offset = 0;

for (const f of files) {
  const nameBuf = Buffer.from(f.rel, 'utf8');
  const crc = crc32(f.data);
  const comp = deflateRawSync(f.data);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);      // version needed
  lh.writeUInt16LE(0, 6);       // flags
  lh.writeUInt16LE(8, 8);       // method: deflate
  lh.writeUInt16LE(0, 10);      // time
  lh.writeUInt16LE(0x21, 12);   // date (arbitrary valid)
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(comp.length, 18);
  lh.writeUInt32LE(f.data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  locals.push(lh, nameBuf, comp);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(20, 4);
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0, 8);
  ch.writeUInt16LE(8, 10);
  ch.writeUInt16LE(0, 12);
  ch.writeUInt16LE(0x21, 14);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(comp.length, 20);
  ch.writeUInt32LE(f.data.length, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt32LE(offset, 42);
  centrals.push(ch, nameBuf);

  offset += lh.length + nameBuf.length + comp.length;
}

const centralBuf = Buffer.concat(centrals);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);

writeFileSync(OUT, Buffer.concat([...locals, centralBuf, eocd]));
console.log(`[package] ${files.length} files → dist/daddylens-${TARGET}-${version}.zip`);
