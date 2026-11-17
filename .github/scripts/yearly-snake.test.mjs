import assert from "node:assert/strict";
import test from "node:test";
import { yearWindow, yearlyCells, renderYear } from "../../dist/yearly-snake.mjs";

function daysThrough(now, activeDay = 0) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 1);
  const count = Math.floor((now.getTime() - start) / 86400000) + 1;
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(start + i * 86400000).toISOString().slice(0, 10),
    contributionCount: i + 1 === activeDay ? 3 : 0,
    contributionLevel: i + 1 === activeDay ? "SECOND_QUARTILE" : "NONE",
  }));
}

test("year selection resets at UTC midnight and excludes other years and future days", () => {
  const now = new Date("2027-01-01T00:05:00Z");
  assert.deepEqual(yearWindow(now), { from: "2027-01-01T00:00:00.000Z", to: "2027-01-01T00:05:00.000Z" });
  const days = [
    { date: "2026-12-31", contributionCount: 90, contributionLevel: "FOURTH_QUARTILE" },
    ...daysThrough(now, 1),
    { date: "2027-01-02", contributionCount: 90, contributionLevel: "FOURTH_QUARTILE" },
  ];
  const cells = yearlyCells(days, now);
  assert.equal(cells.length, 1);
  assert.deepEqual(cells[0], { x: 0, y: 5, date: "2027-01-01", count: 3, level: 2 });
});

test("leap-day data is retained and assigned to Thursday", () => {
  const now = new Date("2024-02-29T20:00:00Z");
  const cells = yearlyCells(daysThrough(now, 60), now);
  assert.equal(cells.length, 60);
  assert.deepEqual(cells.at(-1), { x: 8, y: 4, date: "2024-02-29", count: 3, level: 2 });
  assert.equal(cells.reduce((sum, cell) => sum + cell.count, 0), 3);
});

test("incomplete responses and duplicate days cannot silently become zero contributions", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const days = daysThrough(now);
  assert.throws(() => yearlyCells(days.slice(1), now), /Missing contribution data/);
  assert.throws(() => yearlyCells([...days, days[0]], now), /Duplicate/);
});

test("empty year start and full leap year render in two themes without invalid coordinates", () => {
  for (const date of ["2026-01-01T01:00:00Z", "2024-12-31T23:00:00Z"]) {
    const now = new Date(date);
    const cells = yearlyCells(daysThrough(now), now);
    assert.equal(cells.length, now.getUTCFullYear() === 2024 ? 366 : 1);
    for (const dark of [false, true]) {
      const svg = renderYear(cells, now, dark);
      assert.match(svg, /0 contributions from/);
      assert.match(svg, /@keyframes/);
      assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
      if (cells.length === 366) {
        for (const month of ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]) {
          assert.ok(svg.includes(`>${month}</text>`), `Missing ${month} label`);
        }
      }
    }
  }
});

test("a normal calendar year contains 365 daily cells and 53 week columns", () => {
  const now = new Date("2026-12-31T23:59:00Z");
  const cells = yearlyCells(daysThrough(now, 365), now);
  assert.equal(cells.length, 365);
  assert.equal(Math.max(...cells.map(cell => cell.x)) + 1, 53);
  assert.deepEqual(cells.at(-1), { x: 52, y: 4, date: "2026-12-31", count: 3, level: 2 });
});
