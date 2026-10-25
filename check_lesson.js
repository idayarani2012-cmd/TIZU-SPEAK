#!/usr/bin/env node
/* Tests a lesson JSON against the answer checker that lives in template.html.
   Usage: node check_lesson.js lesson.json
   Exit code 0 = everything passed, 1 = at least one failure. */
const fs = require('fs');
const path = require('path');

const lessonPath = process.argv[2];
if (!lessonPath) { console.error('Usage: node check_lesson.js lesson.json'); process.exit(2); }
const L = JSON.parse(fs.readFileSync(lessonPath, 'utf8'));
const html = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const m = html.match(/\/\* CHECKER-START \*\/([\s\S]*?)\/\* CHECKER-END \*\//);
if (!m) { console.error('Checker block not found in template.html'); process.exit(2); }
const api = new Function(m[1] + '\nreturn {norm, expandList, hasAny, condTrue, resolveTurn, evaluate, evaluateBest, ENGLISH_WORDS};')();

let passes = 0, fails = 0;
function ok(cond, msg) {
  if (cond) { passes++; } else { fails++; console.log('  FAIL: ' + msg); }
}
function section(t) { console.log('\n' + t); }

/* ---------- 1. structure ---------- */
section('1. Lesson structure');
ok(typeof L.title === 'string' && L.title.trim(), 'title is missing');
ok(typeof L.scene_en === 'string' && L.scene_en.trim(), 'scene_en (scene in English) is missing');
ok(/^(A1|A2|B1|B2)/i.test(L.level || ''), 'level must be A1, A2, B1 or B2 (map a class to a level first)');
ok(Number.isInteger(L.students) && L.students >= 1 && L.students <= 60, 'students must be a whole number from 1 to 60');
const turns = L.turns || [];
const lv = (L.level || '').toUpperCase();
const range = lv.startsWith('A1') ? [6, 8] : lv.startsWith('A2') ? [7, 9] : [8, 10];
ok(turns.length >= range[0] && turns.length <= range[1],
  `a ${lv} dialogue needs ${range[0]}-${range[1]} turns (found ${turns.length})`);

const ids = new Set();
const earlier = new Set();
function checkCond(cond, where) {
  (Array.isArray(cond) ? cond : [cond]).forEach(c => {
    ok(c && c.turn && earlier.has(c.turn), `${where}: condition must refer to an EARLIER turn id (got "${c && c.turn}")`);
    ok(c && (c.any || c.none || c.re), `${where}: condition needs any, none or re`);
    if (c && c.re) { try { new RegExp(c.re, 'i'); } catch (e) { ok(false, `${where}: bad regex ${c.re}`); } }
  });
}
function checkRequired(r, where) {
  ok(Array.isArray(r.required) && r.required.length > 0, `${where}: required elements missing`);
  (r.required || []).forEach((q, i) => {
    ok(q.label && q.any, `${where}: required[${i}] needs label and any`);
    ok(api.expandList(q.any, L).length > 0, `${where}: required[${i}] "${q.label}" has an empty word list`);
  });
}
turns.forEach((t, i) => {
  const w = `turn ${t.id || i + 1}`;
  ok(t.id && !ids.has(t.id), `${w}: id missing or duplicated`);
  ids.add(t.id);
  ['bot', 'en', 'model'].forEach(k => ok(typeof t[k] === 'string' && t[k].trim(), `${w}: "${k}" missing`));
  if (!t.hint) console.log(`  note: ${w} has no hint (Indice will fall back to the element list)`);
  checkRequired(t, w);
  if (t.skipIf) checkCond(t.skipIf, w + ' skipIf');
  (t.variants || []).forEach((v, vi) => {
    const vw = `${w} variant ${vi + 1}`;
    checkCond(v.when, vw);
    ['bot', 'en', 'model'].forEach(k => ok(typeof v[k] === 'string' && v[k].trim(), `${vw}: "${k}" missing`));
    checkRequired(v, vw);
  });
  earlier.add(t.id);
});
const allMistakes = [];
function collectMistakes(list, where) {
  (list || []).forEach(mm => {
    ok(mm.id && mm.tip && (mm.any || mm.re), `${where}: mistake needs id, tip and any/re`);
    if (mm.re) { try { new RegExp(mm.re, 'i'); } catch (e) { ok(false, `${where}: bad regex in ${mm.id}`); } }
    allMistakes.push(mm.id);
  });
}
collectMistakes(L.commonMistakes, 'commonMistakes');
turns.forEach(t => {
  collectMistakes(t.mistakes, 'turn ' + t.id);
  (t.variants || []).forEach(v => collectMistakes(v.mistakes, 'turn ' + t.id + ' variant'));
});
ok(new Set(allMistakes).size === allMistakes.length, 'mistake ids must be unique');

/* helper: every turn version (default + each variant), resolved */
function versions() {
  const out = [];
  turns.forEach(t => {
    out.push({ name: t.id + ' (default)', r: api.resolveTurn(Object.assign({}, t, { variants: [], skipIf: null }), {}, L) });
    (t.variants || []).forEach((v, vi) => {
      out.push({ name: `${t.id} variant ${vi + 1}`, r: api.resolveTurn(Object.assign({}, t, { variants: [Object.assign({}, v, { when: [] })], skipIf: null }), {}, L) });
    });
  });
  return out;
}

/* ---------- 2. model answers ---------- */
section('2. Model answer gets full marks (every turn and variant)');
versions().forEach(({ name, r }) => {
  const res = api.evaluate(r.model, r, L);
  ok(res.score === 3, `${name}: model answer "${r.model}" scored ${res.score}/3 (missing: ${res.missing.map(x => x.label).join(', ') || '-'}; mistakes: ${res.mistakes.map(x => x.id).join(', ') || '-'})`);
  const bare = r.model.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]/g, '');
  const res2 = api.evaluate(bare.toUpperCase(), r, L);
  ok(res2.score === 3, `${name}: model answer without accents/punctuation, in capitals, scored ${res2.score}/3`);
  const best = api.evaluateBest(['I want it please', r.model, 'blah'], r, L);
  ok(best.text === r.model, `${name}: best of several recognition alternatives was not the model answer`);
});

/* ---------- 3. typical mistakes ---------- */
section('3. Typical mistakes show their tip');
const tested = new Set(['english']);
((L.tests || {}).mistakes || []).forEach(([tid, say, mid, ctx]) => {
  const t = turns.find(x => x.id === tid);
  if (!t) { ok(false, `test refers to unknown turn ${tid}`); return; }
  const r = api.resolveTurn(t, ctx || {}, L);
  if (!r) { ok(false, `test "${say}": turn ${tid} is skipped with that context`); return; }
  const res = api.evaluate(say, r, L);
  const hit = res.mistakes.find(x => x.id === mid);
  ok(!!hit && hit.tip, `"${say}" (${tid}) should show the tip "${mid}" but showed: ${res.mistakes.map(x => x.id).join(', ') || 'nothing'}`);
  ok(res.score < 3, `"${say}" (${tid}) scored ${res.score}/3 but contains a mistake`);
  tested.add(mid);
});
allMistakes.forEach(id => ok(tested.has(id), `mistake "${id}" has no test in tests.mistakes`));

/* ---------- 4. English answers ---------- */
section('4. English answers score low');
const englishAnswers = (L.tests && L.tests.english) || ['I want a coffee please', 'Hello, how are you?', 'Yes thank you very much', 'Goodbye, have a nice day'];
versions().forEach(({ name, r }) => {
  englishAnswers.forEach(a => {
    const res = api.evaluate(a, r, L);
    ok(res.score <= 1, `${name}: English answer "${a}" scored ${res.score}/3`);
  });
});
ok(api.evaluate('', versions()[0].r, L).score === 0, 'empty answer should score 0');

/* ---------- 5. branches ---------- */
section('5. Dialogue branches');
const branchTurns = turns.filter(t => (t.variants && t.variants.length) || t.skipIf);
if (branchTurns.length === 0) console.log('  (no variants or skipIf in this lesson)');
const seen = new Set();
((L.tests || {}).branches || []).forEach(([setTurn, say, askTurn, expect]) => {
  const t = turns.find(x => x.id === askTurn);
  if (!t) { ok(false, `branch test refers to unknown turn ${askTurn}`); return; }
  const r = api.resolveTurn(t, { [setTurn]: say }, L);
  ok(r && r.bot.toLowerCase().includes(String(expect).toLowerCase()),
    `after "${say}" the bot line of ${askTurn} should contain "${expect}" but was ${r ? '"' + r.bot + '"' : 'skipped'}`);
  if (r) {
    seen.add(askTurn + ':' + (r.variant || 'default'));
    const res = api.evaluate(r.model, r, L);
    ok(res.score === 3, `branch ${askTurn} after "${say}": model answer scored ${res.score}/3`);
  }
});
branchTurns.forEach(t => {
  (t.variants || []).forEach((v, vi) => ok(seen.has(t.id + ':' + (v.name || 'variante ' + (vi + 1))), `variant "${v.name || vi + 1}" of ${t.id} is not exercised by tests.branches`));
  ok(seen.has(t.id + ':default') || t.skipIf, `the default version of ${t.id} is not exercised by tests.branches`);
});

console.log(`\n${passes} checks passed, ${fails} failed.`);
process.exit(fails ? 1 : 0);
