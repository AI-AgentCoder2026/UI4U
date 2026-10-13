import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Repairs UTF-8 that was decoded as Windows-1252 and written back as UTF-8.
 *
 * PowerShell 5.1's `Get-Content` decodes with the system ANSI code page, so
 * `—` (E2 80 94) was read as `â€”` and stayed that way once written out. The
 * same applies to icons like `◈` (E2 97 88 → `â—ˆ`), which is why a fix that
 * only handles Latin-1 punctuation leaves them broken.
 *
 * Two properties matter:
 *
 *  - The map is *derived*, not typed. Every codepoint from U+0080 to U+2FFF is
 *    encoded as UTF-8 and decoded byte-by-byte through cp1252, so the mangled
 *    form is whatever a mis-read actually produces. Hand-written tables drift.
 *  - The repair repeats until stable, because a file mangled by two different
 *    passes needs two passes in reverse.
 */

const BYTE_TO_CHAR = new Map();
for (let byte = 0; byte < 0x100; byte += 1) {
  BYTE_TO_CHAR.set(byte, String.fromCharCode(byte));
}
// 0x80–0x9F are the only codes where Windows-1252 differs from Latin-1.
for (const [code, char] of [
  [0x80, '€'],
  [0x82, '‚'],
  [0x83, 'ƒ'],
  [0x84, '„'],
  [0x85, '…'],
  [0x86, '†'],
  [0x87, '‡'],
  [0x88, 'ˆ'],
  [0x89, '‰'],
  [0x8a, 'Š'],
  [0x8b, '‹'],
  [0x8c, 'Œ'],
  [0x8e, 'Ž'],
  [0x91, '‘'],
  [0x92, '’'],
  [0x93, '“'],
  [0x94, '”'],
  [0x95, '•'],
  [0x96, '–'],
  [0x97, '—'],
  [0x98, '˜'],
  [0x99, '™'],
  [0x9a, 'š'],
  [0x9b, '›'],
  [0x9c, 'œ'],
  [0x9e, 'ž'],
  [0x9f, 'Ÿ'],
]) {
  BYTE_TO_CHAR.set(code, char);
}

/** @type {Array<[string, string]>} mangled → original, longest first */
const REPAIRS = [];
for (let code = 0x80; code <= 0x2fff; code += 1) {
  const character = String.fromCodePoint(code);
  const bytes = [...Buffer.from(character, 'utf8')];
  if (bytes.length < 2) continue;
  const mangled = bytes.map((byte) => BYTE_TO_CHAR.get(byte)).join('');
  REPAIRS.push([mangled, character]);
}
REPAIRS.sort((a, b) => b[0].length - a[0].length);

/** One pass. @param {string} text @returns {[string, number]} */
function repairOnce(text) {
  let after = text;
  let count = 0;
  for (const [mangled, character] of REPAIRS) {
    const parts = after.split(mangled);
    const hits = parts.length - 1;
    if (hits === 0) continue;
    after = parts.join(character);
    count += hits;
  }
  return [after, count];
}

for (const file of process.argv.slice(2)) {
  let text = readFileSync(file, 'utf8');
  const before = text;
  let passes = 0;

  while (passes < 5) {
    const [after, count] = repairOnce(text);
    if (count === 0 || after === text) break;
    text = after;
    passes += 1;
  }

  if (text === before) {
    console.log(`${file}: already clean`);
    continue;
  }

  // Never write a result containing U+FFFD: that means the guess was wrong and
  // would turn mangling into data loss.
  if (text.includes('�')) {
    console.log(`${file}: skipped — repair would introduce replacement characters`);
    continue;
  }

  writeFileSync(file, text, 'utf8');
  console.log(`${file}: repaired in ${passes} pass(es)`);
}
