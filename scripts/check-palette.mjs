/**
 * Works out the accent palettes and proves they clear WCAG AA.
 *
 * Every accent is checked against every surface it can land on, in both
 * themes, because "it looked fine" is how the last four colours got in.
 * Run with `node scripts/check-palette.mjs`; it exits non-zero on a failure so
 * it can gate a build.
 */

const AA_TEXT = 4.5;

/** @param {string} hex */
function lum(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** @param {string} a @param {string} b */
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Grounds the text tier can land on. */
const GROUNDS = {
  dark: { bg: '#0b0d12', surface: '#12151c', two: '#181c25', three: '#212734' },
  light: { bg: '#f2f4f7', surface: '#ffffff', two: '#f7f9fb', three: '#edf0f4' },
};

/**
 * primary is the structural accent; companion is the second brand voice.
 * `on` is the text colour used on a fill of `primary`.
 */
const ACCENTS = {
  ice: {
    dark: { primary: '#7fc4e8', companion: '#9b8cf5', on: '#04121c' },
    light: { primary: '#17688f', companion: '#5747c4', on: '#ffffff' },
  },
  mint: {
    dark: { primary: '#6fd3b4', companion: '#8fb6f0', on: '#03231b' },
    light: { primary: '#0f6b57', companion: '#3d5aa8', on: '#ffffff' },
  },
  violet: {
    dark: { primary: '#a99bf7', companion: '#f2a0b5', on: '#100c28' },
    light: { primary: '#5b49c4', companion: '#b3305a', on: '#ffffff' },
  },
  rose: {
    dark: { primary: '#f2a0b5', companion: '#9b8cf5', on: '#2a0713' },
    light: { primary: '#b3305a', companion: '#5747c4', on: '#ffffff' },
  },
  graphite: {
    dark: { primary: '#b8c0ce', companion: '#9aa6ba', on: '#0b0d12' },
    light: { primary: '#4a5468', companion: '#3a4252', on: '#ffffff' },
  },
};

/** Text tiers that must clear AA against every surface. */
const TEXT = {
  dark: { text: '#e8ecf4', muted: '#9aa4ba', subtle: '#8b95a9' },
  light: { text: '#0a0d14', muted: '#454e63', subtle: '#5d6678' },
};

let failures = 0;

/** @param {string} label @param {string} fg @param {string} bg @param {number} need */
function check(label, fg, bg, need = AA_TEXT) {
  const got = ratio(fg, bg);
  if (got < need) {
    failures += 1;
    console.log(`  FAIL ${label}: ${got.toFixed(2)} < ${need} on ${bg}`);
  }
  return got;
}

for (const [theme, grounds] of Object.entries(GROUNDS)) {
  console.log(`\n=== ${theme} ===`);

  for (const [tier, colour] of Object.entries(TEXT[theme])) {
    const worst = Math.min(...Object.values(grounds).map((g) => ratio(colour, g)));
    console.log(
      `  text/${tier.padEnd(7)} ${colour} worst ${worst.toFixed(2)} ${worst >= AA_TEXT ? 'ok' : 'FAIL'}`
    );
    if (worst < AA_TEXT) failures += 1;
  }

  for (const [name, set] of Object.entries(ACCENTS)) {
    const { primary, companion, on } = set[theme];
    const worstText = Math.min(
      ...Object.values(grounds).map((g) => check(`${name} on ${g}`, primary, g, AA_TEXT))
    );
    const worstCompanion = Math.min(
      ...Object.values(grounds).map((g) => check(`${name}+ on ${g}`, companion, g, AA_TEXT))
    );
    // Text sitting on a fill of the accent is body text — a button label — so
    // it is held to AA, not AA-large.
    const onFill = check(`${name} fill`, on, primary, AA_TEXT);
    console.log(
      `  ${name.padEnd(9)} primary ${primary} worst ${worstText.toFixed(2)} · companion worst ${worstCompanion.toFixed(2)} · on-fill ${onFill.toFixed(2)}`
    );
  }
}

console.log(failures === 0 ? '\nAll palette combinations clear AA.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
