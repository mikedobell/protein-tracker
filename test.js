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

// ── #11: Pumpkin Seeds in food database ─────────────────────────
describe('#11 — Pumpkin Seeds', () => {
    test('proteinDB contains Pumpkin Seeds', () => {
        const found = app.proteinDB.find(f => /pumpkin seeds/i.test(f.name));
        assert.ok(found, 'proteinDB must include Pumpkin Seeds');
    });

    test('Pumpkin Seeds has a reasonable ratio', () => {
        const found = app.proteinDB.find(f => /pumpkin seeds/i.test(f.name));
        assert.ok(found.ratio >= 0.2 && found.ratio <= 0.4, `ratio ${found.ratio} should be between 0.2 and 0.4`);
    });
});

// ── #12: Food names include ratio in display ────────────────────
describe('#12 — Display ratio in food names', () => {
    test('getDisplayName function exists and appends ratio', () => {
        assert.strictEqual(typeof app.getDisplayName, 'function');
        const item = { name: 'Chicken Breast (cooked)', ratio: 0.31 };
        const display = app.getDisplayName(item);
        assert.ok(display.includes('(0.31)'), `display name "${display}" must include "(0.31)"`);
    });

    test('index.html uses getDisplayName or appends ratio when populating select', () => {
        const html = readHTML();
        assert.ok(
            html.includes('getDisplayName') || html.includes('item.ratio') || html.includes('.ratio'),
            'must use ratio when populating the food select dropdown'
        );
    });
});

// ── #14: Missed day detection and backfill ──────────────────────
describe('#14 — Missed days', () => {
    test('getMissedDays function exists', () => {
        assert.strictEqual(typeof app.getMissedDays, 'function');
    });

    test('getMissedDays returns empty array when no logs exist', () => {
        const missed = app.getMissedDays([], 7);
        assert.deepStrictEqual(missed, [], 'no logs means no missed days');
    });

    test('getMissedDays returns empty when all recent days have data', () => {
        const testLogs = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            testLogs.push({ date: d.toDateString(), protein: 100 });
        }
        const missed = app.getMissedDays(testLogs, 7);
        assert.deepStrictEqual(missed, [], 'consecutive days with data means no missed days');
    });

    test('getMissedDays detects a gap between logged days', () => {
        const today = new Date();
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(today.getDate() - 2);
        const testLogs = [
            { date: today.toDateString(), protein: 100 },
            { date: twoDaysAgo.toDateString(), protein: 150 },
        ];
        // Yesterday has no data but is between two logged days
        const missed = app.getMissedDays(testLogs, 7);
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        assert.ok(missed.length >= 1, 'should detect at least one missed day');
        assert.ok(
            missed.some(d => d.dateStr === yesterday.toDateString()),
            'yesterday should be flagged as missed'
        );
    });

    test('getMissedDays does not flag days before first-ever log', () => {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const today = new Date();
        const testLogs = [
            { date: threeDaysAgo.toDateString(), protein: 100 },
            { date: today.toDateString(), protein: 100 },
        ];
        const missed = app.getMissedDays(testLogs, 7);
        // Should only flag days BETWEEN threeDaysAgo and today, not before threeDaysAgo
        const fourDaysAgo = new Date();
        fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
        assert.ok(
            !missed.some(d => d.dateStr === fourDaysAgo.toDateString()),
            'days before first log should not be flagged'
        );
    });

    test('createBackfillEntry function exists and creates a valid entry', () => {
        assert.strictEqual(typeof app.createBackfillEntry, 'function');
        const dateStr = new Date(Date.now() - 86400000).toDateString();
        const entry = app.createBackfillEntry(dateStr, 120);
        assert.strictEqual(entry.date, dateStr);
        assert.strictEqual(entry.protein, 120);
        assert.strictEqual(entry.name, 'Backfill Estimate');
        assert.ok(entry.id, 'must have an id');
        assert.ok(entry.backfill === true, 'must be flagged as backfill');
    });

    test('index.html has missed-day UI elements', () => {
        const html = readHTML();
        assert.ok(
            html.includes('missed') || html.includes('Missed') || html.includes('backfill') || html.includes('getMissedDays'),
            'must reference missed days or backfill in the UI'
        );
    });
});

// ── #13: Version number in footer ───────────────────────────────
describe('#13 — Version number in footer', () => {
    test('index.html has a footer element', () => {
        const html = readHTML();
        assert.ok(html.includes('<footer') || html.includes('id="footer"'),
            'must have a footer element');
    });

    test('footer contains a version number', () => {
        const html = readHTML();
        assert.ok(/v\d+\.\d+/i.test(html), 'must contain a version number like v1.0 or v2.0');
    });
});
