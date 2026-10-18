const suites = [];
let currentSuite = null;
let beforeEachFn = null;

export function setGlobalBeforeEach(fn) { beforeEachFn = fn; }

export function describe(name, fn) {
  const suite = { name, tests: [] };
  suites.push(suite);
  currentSuite = suite;
  fn();
  currentSuite = null;
}

export function it(name, fn) { currentSuite.tests.push({ name, fn }); }

export class AssertionError extends Error {}

function fmt(v) {
  try { const s = JSON.stringify(v); return s === undefined ? String(v) : s; } catch { return String(v); }
}

export const assert = {
  ok(cond, msg = 'expected a truthy value') {
    if (!cond) throw new AssertionError(msg);
  },
  equal(actual, expected, msg = '') {
    if (actual !== expected) throw new AssertionError(`${msg} expected ${fmt(expected)}, got ${fmt(actual)}`.trim());
  },
  deepEqual(actual, expected, msg = '') {
    if (fmt(actual) !== fmt(expected)) throw new AssertionError(`${msg} expected ${fmt(expected)}, got ${fmt(actual)}`.trim());
  },
  includes(haystack, needle, msg = '') {
    if (!String(haystack).includes(needle)) throw new AssertionError(`${msg} ${fmt(haystack)} does not include ${fmt(needle)}`.trim());
  },
  async rejects(fn, check = null, msg = 'expected a rejection') {
    let error = null;
    try { await fn(); } catch (e) { error = e; }
    if (!error) throw new AssertionError(`${msg} (nothing was thrown)`);
    if (check && !check(error)) throw new AssertionError(`${msg} (unexpected error ${error.name}: ${error.message})`);
    return error;
  },
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 1500, interval = 10, message = 'condition' } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new AssertionError(`waitFor timed out: ${message}`);
    await sleep(interval);
  }
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function h(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

export async function runAll({ container, loadErrors = [], grep = '' }) {
  const summary = h('p', 'summary', 'চলছে…');
  summary.setAttribute('role', 'status');
  container.append(summary);
  for (const le of loadErrors) {
    container.append(h('pre', 'fail', `LOAD ERROR ${le.file}\n${le.error && le.error.stack ? le.error.stack : le.error}`));
  }

  const results = { passed: 0, failed: 0, total: 0, loadErrors: loadErrors.length, failures: [] };
  const needle = grep.toLowerCase();

  for (const suite of suites) {
    const tests = suite.tests.filter((t) => !needle || `${suite.name} ${t.name}`.toLowerCase().includes(needle));
    if (!tests.length) continue;
    const box = h('section');
    box.append(h('h2', '', suite.name));
    container.append(box);
    for (const t of tests) {
      results.total++;
      const row = h('div', 'test', `… ${t.name}`);
      box.append(row);
      try {
        if (beforeEachFn) await withTimeout(Promise.resolve().then(beforeEachFn), 8000);
        await withTimeout(Promise.resolve().then(() => t.fn()), 8000);
        row.className = 'test pass';
        row.textContent = `✓ ${t.name}`;
        results.passed++;
      } catch (e) {
        row.className = 'test fail';
        row.textContent = `✗ ${t.name}`;
        const stack = e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : '';
        box.append(h('pre', '', `${e && e.message ? e.message : e}\n${stack}`));
        results.failed++;
        results.failures.push({ suite: suite.name, test: t.name, message: String(e && e.message ? e.message : e) });
      }
    }
  }

  summary.textContent = `${results.passed}/${results.total} সফল, ${results.failed} ব্যর্থ`
    + (results.loadErrors ? `, ${results.loadErrors}টি test ফাইল লোড হয়নি` : '');
  document.title = `${results.failed || results.loadErrors ? 'FAIL' : 'PASS'} ${results.passed}/${results.total}`;
  window.__TEST_RESULTS__ = results;
  return results;
}
