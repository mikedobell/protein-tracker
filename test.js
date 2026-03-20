const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML_PATH = path.join(__dirname, 'index.html');
const APP_PATH = path.join(__dirname, 'app.js');

function readHTML() {
    return fs.readFileSync(HTML_PATH, 'utf-8');
}

function readAppJS() {
    return fs.readFileSync(APP_PATH, 'utf-8');
}

// Minimal localStorage mock for app.js
const storage = {};
global.localStorage = {
    getItem: (k) => storage[k] ?? null,
    setItem: (k, v) => { storage[k] = v; },
    removeItem: (k) => { delete storage[k]; },
};
// Minimal document mock for escapeHTML
global.document = {
    createElement: (tag) => {
        let text = '';
        return {
            set textContent(v) { text = v; },
            get innerHTML() {
                return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }
        };
    }
};

const app = require('./app.js');

// ── #1: File should be named index.html ─────────────────────────
describe('#1 — index.html exists', () => {
    test('index.html file exists in project root', () => {
        assert.ok(fs.existsSync(HTML_PATH), 'index.html must exist');
    });

    test('protein.html should NOT exist', () => {
        const old = path.join(__dirname, 'protein.html');
        assert.ok(!fs.existsSync(old), 'protein.html should be removed');
    });
});

// ── #2: XSS — no raw innerHTML with user data ──────────────────
describe('#2 — XSS protection', () => {
    test('escapeHTML function exists in app.js', () => {
        assert.strictEqual(typeof app.escapeHTML, 'function');
    });

    test('escapeHTML escapes angle brackets', () => {
        assert.strictEqual(app.escapeHTML('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    test('index.html uses escapeHTML for entry rendering', () => {
        const html = readHTML();
        // The entry rendering should call escapeHTML on entry.name
        assert.ok(html.includes('escapeHTML('), 'must call escapeHTML when rendering entries');
    });
});

// ── #3: No Tailwind play CDN (JS runtime) ───────────────────────
describe('#3 — No Tailwind CDN play script', () => {
    test('does not load cdn.tailwindcss.com script', () => {
        const html = readHTML();
        assert.ok(!html.includes('cdn.tailwindcss.com'), 'must not use the Tailwind play CDN script');
    });

    test('has a CSS stylesheet link or inline styles', () => {
        const html = readHTML();
        const hasStylesheet = html.includes('<link') && html.includes('stylesheet');
        const hasInlineStyles = html.includes('<style>');
        assert.ok(hasStylesheet || hasInlineStyles, 'must have CSS via link or inline styles');
    });
});

// ── #4: Font loading — no @import, use preconnect ───────────────
describe('#4 — Font loading', () => {
    test('does not use @import for fonts', () => {
        const html = readHTML();
        assert.ok(!html.includes("@import url('https://fonts.googleapis.com"), 'must not use @import for Google Fonts');
    });

    test('uses preconnect link for Google Fonts', () => {
        const html = readHTML();
        assert.ok(html.includes('rel="preconnect"'), 'must have a preconnect link');
        assert.ok(html.includes('fonts.googleapis.com') || html.includes('fonts.gstatic.com'),
            'preconnect must target Google Fonts');
    });
});

// ── #5: Privacy notice accuracy ─────────────────────────────────
describe('#5 — Privacy notice', () => {
    test('does not say "browser cache"', () => {
        const html = readHTML();
        assert.ok(!html.toLowerCase().includes('browser cache'), 'must not say "browser cache"');
    });

    test('says "local storage" or "localStorage"', () => {
        const html = readHTML();
        const lower = html.toLowerCase();
        assert.ok(lower.includes('local storage') || lower.includes('localstorage'),
            'must mention local storage');
    });
});

// ── #6: Export / Import ─────────────────────────────────────────
describe('#6 — Export / Import', () => {
    test('exportData returns valid JSON with logs and goals', () => {
        const json = app.exportData();
        const data = JSON.parse(json);
        assert.ok(Array.isArray(data.logs), 'export must contain logs array');
        assert.ok(data.goals, 'export must contain goals');
    });

    test('importData parses valid JSON', () => {
        const input = JSON.stringify({ logs: [{ id: 1, protein: 30 }], goals: { min: 160, max: 200 } });
        const data = app.importData(input);
        assert.strictEqual(data.logs.length, 1);
    });

    test('importData rejects invalid data', () => {
        assert.throws(() => app.importData('{"logs": "not an array"}'), /Invalid data/);
    });

    test('index.html has export and import buttons', () => {
        const html = readHTML();
        assert.ok(html.includes('exportData') || html.includes('export'), 'must have export button/action');
        assert.ok(html.includes('importData') || html.includes('import'), 'must have import button/action');
    });
});

// ── #7: 7-day average only counts days with data ────────────────
describe('#7 — 7-day average', () => {
    test('calcAverage returns 0 for empty logs', () => {
        assert.strictEqual(app.calcAverage([], 7), 0);
    });

    test('calcAverage averages only days with data, not all 7', () => {
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const testLogs = [
            { date: today, protein: 100 },
            { date: yesterday, protein: 200 },
        ];
        // Only 2 days have data → avg should be (100+200)/2 = 150, NOT (100+200)/7 = 43
        const avg = app.calcAverage(testLogs, 7);
        assert.strictEqual(avg, 150, `expected 150 but got ${avg} — should average over days with data only`);
    });
});

// ── #8: Progress bar has 160g goal marker ───────────────────────
describe('#8 — Goal marker on progress bar', () => {
    test('index.html has a visual marker at the goal position', () => {
        const html = readHTML();
        // Should have some element representing the goal line/marker within the progress bar area
        assert.ok(html.includes('goal-marker') || html.includes('goal-line'),
            'must have a goal marker element (id or class containing "goal-marker" or "goal-line")');
    });
});

// ── #9: Configurable goals ──────────────────────────────────────
describe('#9 — Configurable goals', () => {
    test('getGoals returns defaults when nothing is stored', () => {
        delete storage['protein_goals'];
        const goals = app.getGoals();
        assert.strictEqual(goals.min, 160);
        assert.strictEqual(goals.max, 200);
    });

    test('saveGoals + getGoals round-trips', () => {
        app.saveGoals(140, 180);
        const goals = app.getGoals();
        assert.strictEqual(goals.min, 140);
        assert.strictEqual(goals.max, 180);
        // cleanup
        delete storage['protein_goals'];
    });

    test('index.html has goal settings UI', () => {
        const html = readHTML();
        assert.ok(html.includes('goal-min') || html.includes('goalMin'),
            'must have an input or element for minimum goal');
        assert.ok(html.includes('goal-max') || html.includes('goalMax'),
            'must have an input or element for maximum goal');
    });
});

// ── #10: Enter key submits the form ─────────────────────────────
describe('#10 — Enter key support', () => {
    test('index.html handles keydown or keypress or uses a form', () => {
        const html = readHTML();
        const hasKeyHandler = html.includes('keydown') || html.includes('keypress') || html.includes('keyup');
        const hasForm = html.includes('<form');
        assert.ok(hasKeyHandler || hasForm, 'must handle Enter key via keydown listener or <form> element');
    });
});
