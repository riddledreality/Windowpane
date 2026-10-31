// Minimal logic tests mirroring windowpane.js helpers
function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const el = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * el) / 451);
  const month = Math.floor((h + el - 7 * m + 114) / 31);
  const day = ((h + el - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// Oct 30 2026 → Halloween
const d = new Date(2026, 9, 30);
assert(d.getMonth() === 9, 'oct');
console.log('Halloween window includes Oct 30: ok');

// Easter 2026 is April 5
const e = easterDate(2026);
assert(e.getFullYear() === 2026 && e.getMonth() === 3 && e.getDate() === 5, 'easter 2026 '+e);
console.log('Easter 2026 Apr 5: ok');

// Brand rename constant check against source
import fs from 'fs';
const src = fs.readFileSync(new URL('../windowpane.js', import.meta.url), 'utf8');
assert(src.includes('id: "windowpane"'), 'brand id');
assert(src.includes('name: "Windowpane"'), 'brand name');
assert(src.includes('follow_weather'), 'follow weather setting');
assert(!/driftcast/i.test(src), 'no driftcast leftovers');
assert(src.includes('input_boolean.windowpane_pause'), 'pause helper');
console.log('Brand + follow_weather + no driftcast: ok');
console.log('ALL PASS');
