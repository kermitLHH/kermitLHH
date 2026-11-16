import assert from "node:assert/strict";
import test from "node:test";
import { monthWindow, monthlyCells, renderMonth } from "../../dist/monthly-snake.mjs";

function daysThrough(now, activeDay = 0) {
  return Array.from({ length: now.getUTCDate() }, (_, i) => ({
    date: now.toISOString().slice(0, 8) + String(i + 1).padStart(2, "0"),
    contributionCount: i + 1 === activeDay ? 3 : 0,
    contributionLevel: i + 1 === activeDay ? "SECOND_QUARTILE" : "NONE",
  }));
}

test("month selection rolls over at UTC midnight, including the year", () => {
  const now = new Date("2027-01-01T00:05:00Z");
  assert.deepEqual(monthWindow(now), { from: "2027-01-01T00:00:00.000Z", to: "2027-01-01T00:05:00.000Z" });
  const days = [
    { date: "2026-12-31", contributionCount: 90, contributionLevel: "FOURTH_QUARTILE" },
    ...daysThrough(now, 1),
    { date: "2027-01-02", contributionCount: 90, contributionLevel: "FOURTH_QUARTILE" },
  ];
  const cells = monthlyCells(days, now);
  assert.equal(cells.length, 1);
  assert.deepEqual(cells[0], { x: 5, y: 0, date: "2027-01-01", count: 3, level: 2 });
});

test("leap-day data is retained and assigned to Thursday", () => {
  const now = new Date("2024-02-29T20:00:00Z");
  const cells = monthlyCells(daysThrough(now, 29), now);
  assert.equal(cells.length, 29);
  assert.deepEqual(cells.at(-1), { x: 4, y: 4, date: "2024-02-29", count: 3, level: 2 });
  assert.equal(cells.reduce((sum, cell) => sum + cell.count, 0), 3);
});

test("incomplete responses and duplicate days cannot silently become zero contributions", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  const days = daysThrough(now);
  assert.throws(() => monthlyCells(days.slice(1), now), /Missing contribution data/);
  assert.throws(() => monthlyCells([...days, days[0]], now), /Duplicate/);
});

test("zero-contribution month start and six-week calendars both render in two themes", () => {
  for (const date of ["2026-11-01T01:00:00Z", "2026-08-31T23:00:00Z"]) {
    const now = new Date(date);
    const cells = monthlyCells(daysThrough(now), now);
    for (const dark of [false, true]) {
      const svg = renderMonth(cells, now, dark);
      assert.match(svg, /0 contributions from/);
      assert.match(svg, /@keyframes/);
      assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
    }
  }
});
