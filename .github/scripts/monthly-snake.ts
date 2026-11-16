import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getBestRoute } from "@snk/solver/getBestRoute";
import { getPathToPose } from "@snk/solver/getPathToPose";
import { createSvg } from "@snk/svg-creator";
import { createEmptyGrid, setColor } from "@snk/types/grid";
import { createSnakeFromCells } from "@snk/types/snake";
import { snake4 } from "@snk/types/__fixtures__/snake";

const levels = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthWindow(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid date");
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from: from.toISOString(), to: now.toISOString() };
}

export function monthlyCells(days, now = new Date()) {
  const { from, to } = monthWindow(now);
  const start = from.slice(0, 10);
  const end = to.slice(0, 10);
  const byDate = new Map();
  for (const day of days) {
    if (day.date < start || day.date > end) continue;
    if (byDate.has(day.date)) throw new Error("Duplicate contribution date");
    if (!Number.isInteger(day.contributionCount) || day.contributionCount < 0 || !(day.contributionLevel in levels)) {
      throw new Error("Invalid contribution data");
    }
    byDate.set(day.date, day);
  }
  const offset = new Date(from).getUTCDay();
  const cells = [];
  for (let day = 1; day <= now.getUTCDate(); day++) {
    const date = start.slice(0, 8) + String(day).padStart(2, "0");
    const entry = byDate.get(date);
    if (!entry) throw new Error(`Missing contribution data for ${date}`);
    cells.push({
      x: (offset + day - 1) % 7,
      y: Math.floor((offset + day - 1) / 7),
      date,
      count: entry.contributionCount,
      level: entry.contributionCount === 0 ? 0 : levels[entry.contributionLevel],
    });
  }
  return cells;
}

export function renderMonth(cells, now, dark) {
  const rows = Math.max(...cells.map(c => c.y)) + 1;
  const grid = createEmptyGrid(7, rows);
  for (const cell of cells) setColor(grid, cell.x, cell.y, cell.level);
  const chain = getBestRoute(grid, snake4);
  // Keep the snake moving even at the start of a month with no contributions.
  if (chain.length === 1) {
    const idlePose = createSnakeFromCells([0, 1, 2, 3].map(x => ({ x, y: rows })));
    chain.push(...getPathToPose(chain[chain.length - 1], idlePose));
  }
  chain.push(...getPathToPose(chain[chain.length - 1], snake4));
  const palette = dark
    ? ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"]
    : ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"];
  const text = dark ? "#e6edf3" : "#1f2328";
  const muted = dark ? "#9198a1" : "#59636e";
  const options = {
    colorDots: Object.fromEntries(palette.map((color, i) => [i, color])),
    colorEmpty: palette[0],
    colorDotBorder: dark ? "#ffffff0a" : "#1b1f230a",
    colorSnake: dark ? "#38bdf8" : "#0ea5e9",
    sizeCell: 32,
    sizeDot: 25,
    sizeDotBorderRadius: 5,
  };
  let animation = createSvg(grid, cells, chain, options, { stepDurationMs: Math.max(130, 7000 / chain.length) });
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name, x) =>
    `<text x="${x * 32 + 16}" y="-43" fill="${muted}" font-size="10" text-anchor="middle">${name}</text>`
  ).join("");
  const dates = cells.map(cell =>
    `<text x="${cell.x * 32 + 16}" y="${cell.y * 32 + 20}" text-anchor="middle" font-size="10" fill="${dark ? "#ffffff" : "#24292f"}" pointer-events="none">${Number(cell.date.slice(8))}</text>`
  ).join("");
  // Put the dates above the grid but below the snake, so the head covers a date as it eats.
  const snakeStart = animation.indexOf('<rect class="s ');
  if (snakeStart < 0) throw new Error("Upstream SVG structure changed");
  animation = animation.slice(0, snakeStart) + weekdays + dates + animation.slice(snakeStart);
  animation = animation.replace("<svg ", '<svg x="16" y="76" ');
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);
  const title = `${months[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
  const height = (rows + 5) * 32 + 76;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="${height}" viewBox="0 0 320 ${height}" role="img" aria-labelledby="title description" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">
<title id="title">${title} contribution snake</title>
<desc id="description">${total} contributions from ${cells[0].date} through ${cells[cells.length - 1].date}. Calendar dates use UTC. Only this month's recorded days are displayed.</desc>
<text x="16" y="29" fill="${text}" font-size="21" font-weight="600">${title}</text>
<text x="16" y="53" fill="${muted}" font-size="12">1–${now.getUTCDate()} ${months[now.getUTCMonth()]} · ${total} contribution${total === 1 ? "" : "s"} · UTC</text>
${animation}
</svg>\n`;
}

async function main() {
  const username = process.env.GITHUB_REPOSITORY_OWNER;
  const token = process.env.GITHUB_TOKEN;
  if (!username || !token) throw new Error("GITHUB_REPOSITORY_OWNER and GITHUB_TOKEN are required");
  const now = new Date();
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "monthly-contribution-snake" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      query: `query ($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } }
          }
        }
      }`,
      variables: { login: username, ...monthWindow(now) },
    }),
  });
  if (!response.ok) throw new Error(`GitHub contribution request failed (${response.status})`);
  const result = await response.json();
  if (result.errors || !result.data?.user) throw new Error("GitHub did not return contribution data");
  const days = result.data.user.contributionsCollection.contributionCalendar.weeks.flatMap(week => week.contributionDays);
  const cells = monthlyCells(days, now);
  await mkdir("dist", { recursive: true });
  for (const dark of [false, true]) {
    const file = `dist/github-snake-monthly${dark ? "-dark" : ""}.svg`;
    await writeFile(file, renderMonth(cells, now, dark));
    console.log(`Generated ${file}: ${cells[0].date} to ${cells[cells.length - 1].date}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
