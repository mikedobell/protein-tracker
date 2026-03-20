// Protein Tracker - Application Logic
// Extracted for testability; loaded by index.html via <script src="app.js">

const GOAL_MIN = 160;
const GOAL_MAX = 200;

const proteinDB = [
    { name: "Manual Protein", ratio: 1.00 },
    { name: "Chicken Breast (cooked)", ratio: 0.31 },
    { name: "Ground Turkey (93/7)", ratio: 0.19 },
    { name: "Ground Beef (93/7)", ratio: 0.21 },
    { name: "Steak (Sirloin)", ratio: 0.22 },
    { name: "Tuna (canned)", ratio: 0.26 },
    { name: "Salmon (raw)", ratio: 0.20 },
    { name: "Whole Egg", ratio: 0.13 },
    { name: "Egg Whites (liquid)", ratio: 0.11 },
    { name: "Greek Yogurt (Nonfat)", ratio: 0.10 },
    { name: "Cottage Cheese (Low fat)", ratio: 0.11 },
    { name: "Whey Protein Powder", ratio: 0.75 },
    { name: "Whey Protein Isolate", ratio: 0.85 },
    { name: "Tofu (Firm)", ratio: 0.17 },
    { name: "Tempeh", ratio: 0.19 },
    { name: "Lentils (cooked)", ratio: 0.09 },
    { name: "Chickpeas (cooked)", ratio: 0.09 },
    { name: "Quinoa (cooked)", ratio: 0.04 },
    { name: "Peanut Butter", ratio: 0.25 },
    { name: "Almonds", ratio: 0.21 },
    { name: "Hemp Seeds", ratio: 0.32 },
    { name: "Oats (Dry)", ratio: 0.13 },
    { name: "Cheddar Cheese", ratio: 0.25 },
    { name: "Beef Jerky", ratio: 0.33 },
    { name: "Pumpkin Seeds", ratio: 0.30 }
].sort((a, b) => a.name.localeCompare(b.name));

let logs = JSON.parse(localStorage.getItem('protein_logs')) || [];

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function calcProtein(weight, ratio) {
    return Math.round(weight * ratio);
}

function getTodayStr() {
    return new Date().toDateString();
}

function getTodayEntries(logs) {
    const todayStr = getTodayStr();
    return logs.filter(l => l.date === todayStr).sort((a, b) => b.timestamp - a.timestamp);
}

function getTodayTotal(logs) {
    return getTodayEntries(logs).reduce((sum, l) => sum + l.protein, 0);
}

function calcAverage(logs, numDays) {
    let sum = 0;
    let daysWithData = 0;
    for (let i = 0; i < numDays; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const ds = d.toDateString();
        const total = logs.filter(l => l.date === ds).reduce((sum, l) => sum + l.protein, 0);
        if (total > 0) {
            sum += total;
            daysWithData++;
        }
    }
    return daysWithData === 0 ? 0 : Math.round(sum / daysWithData);
}

function getLast7Days(logs) {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const ds = d.toDateString();
        const total = logs.filter(l => l.date === ds).reduce((sum, l) => sum + l.protein, 0);
        days.push({ date: d, total: total, isToday: i === 0 });
    }
    return days;
}

function getGoals() {
    const stored = localStorage.getItem('protein_goals');
    if (stored) {
        try { return JSON.parse(stored); } catch (e) { /* fall through */ }
    }
    return { min: GOAL_MIN, max: GOAL_MAX };
}

function saveGoals(min, max) {
    localStorage.setItem('protein_goals', JSON.stringify({ min, max }));
}

function exportData() {
    return JSON.stringify({ logs, goals: getGoals() }, null, 2);
}

function importData(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!Array.isArray(data.logs)) throw new Error('Invalid data: missing logs array');
    return data;
}

function saveLogs() {
    localStorage.setItem('protein_logs', JSON.stringify(logs));
}

function getMissedDays(logs, numDays) {
    if (logs.length === 0) return [];
    // Find the earliest log date
    const allDates = logs.map(l => new Date(l.date).getTime());
    const earliest = Math.min(...allDates);
    const missed = [];
    for (let i = 0; i < numDays; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const ds = d.toDateString();
        // Skip days before the first-ever log
        if (d.getTime() < earliest) continue;
        const total = logs.filter(l => l.date === ds).reduce((sum, l) => sum + l.protein, 0);
        if (total === 0) {
            missed.push({ dateStr: ds, date: d });
        }
    }
    return missed;
}

function createBackfillEntry(dateStr, protein) {
    return {
        id: Date.now() + Math.random(),
        name: 'Backfill Estimate',
        weight: protein,
        protein: protein,
        date: dateStr,
        timestamp: new Date(dateStr).getTime(),
        backfill: true
    };
}

function getDisplayName(item) {
    return `${item.name} (${item.ratio.toFixed(2)})`;
}

// Make functions available for Node.js tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GOAL_MIN, GOAL_MAX, proteinDB,
        calcProtein, calcAverage, getLast7Days,
        getGoals, saveGoals, exportData, importData, escapeHTML,
        getDisplayName, getMissedDays, createBackfillEntry
    };
}
