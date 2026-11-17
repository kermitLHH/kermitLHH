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

export function yearWindow(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid date");
  const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  return { from: from.toISOString(), to: now.toISOString() };
}

export function yearlyCells(days, now = new Date()) {
  const { from, to } = yearWindow(now);
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
  const dayCount = Math.floor((now.getTime() - Date.parse(from)) / 86400000) + 1;
  for (let day = 0; day < dayCount; day++) {
    const date = new Date(Date.parse(from) + day * 86400000).toISOString().slice(0, 10);
    const entry = byDate.get(date);
    if (!entry) throw new Error(`Missing contribution data for ${date}`);
    cells.push({
      x: Math.floor((offset + day) / 7),
      y: (offset + day) % 7,
      date,
      count: entry.contributionCount,
      level: entry.contributionCount === 0 ? 0 : levels[entry.contributionLevel],
    });
  }
  return cells;
}

export function renderYear(cells, now, dark) {
  const columns = Math.max(4, ...cells.map(c => c.x + 1));
  const grid = createEmptyGrid(columns, 7);
  for (const cell of cells) setColor(grid, cell.x, cell.y, cell.level);
  const chain = getBestRoute(grid, snake4);
  // Keep the snake moving at the start of a year with no contributions.
  if (chain.length === 1) {
    const idlePose = createSnakeFromCells([0, 1, 2, 3].map(x => ({ x, y: 7 })));
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
    sizeCell: 16,
    sizeDot: 12,
    sizeDotBorderRadius: 2,
  };
  let animation = createSvg(grid, cells, chain, options, { stepDurationMs: Math.max(100, 7000 / chain.length) });
  animation = animation.replace("<svg ", '<svg x="56" y="68" ');
  const monthLabels = cells.filter(cell => cell.date.endsWith("-01")).map(cell =>
    `<text x="${72 + cell.x * 16}" y="76" fill="${muted}" font-size="12">${months[Number(cell.date.slice(5, 7)) - 1].slice(0, 3)}</text>`
  ).join("");
  const weekdays = [["Mon", 1], ["Wed", 3], ["Fri", 5]].map(([name, y]) =>
    `<text x="16" y="${110 + Number(y) * 16}" fill="${muted}" font-size="12">${name}</text>`
  ).join("");
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);
  const width = Math.max(360, (columns + 2) * 16 + 72);
  const title = `${total} contribution${total === 1 ? "" : "s"} in ${now.getUTCFullYear()}`;
  const legendX = width - 164;
  const legend = palette.map((color, i) => `<rect x="${legendX + 35 + i * 16}" y="265" width="12" height="12" rx="2" fill="${color}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="286" viewBox="0 0 ${width} 286" role="img" aria-labelledby="title description" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">
<title id="title">${title} — contribution snake</title>
<desc id="description">${total} contributions from ${cells[0].date} through ${cells[cells.length - 1].date}. Calendar dates use UTC. Only this calendar year's recorded days are displayed.</desc>
<text x="16" y="28" fill="${text}" font-size="20" font-weight="600">${title}</text>
<text x="16" y="48" fill="${muted}" font-size="11">Jan 1 – ${months[now.getUTCMonth()].slice(0, 3)} ${now.getUTCDate()} · UTC</text>
${monthLabels}${weekdays}
${animation}
<text x="${legendX}" y="275" fill="${muted}" font-size="11">Less</text>${legend}<text x="${legendX + 119}" y="275" fill="${muted}" font-size="11">More</text>
</svg>\n`;
}

async function main() {
  const username = process.env.GITHUB_REPOSITORY_OWNER;
  const token = process.env.GITHUB_TOKEN;
  if (!username || !token) throw new Error("GITHUB_REPOSITORY_OWNER and GITHUB_TOKEN are required");
  const now = new Date();
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": "yearly-contribution-snake" },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      query: `query ($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar { weeks { contributionDays { date contributionCount contributionLevel } } }
          }
        }
      }`,
      variables: { login: username, ...yearWindow(now) },
    }),
  });
  if (!response.ok) throw new Error(`GitHub contribution request failed (${response.status})`);
  const result = await response.json();
  if (result.errors || !result.data?.user) throw new Error("GitHub did not return contribution data");
  const days = result.data.user.contributionsCollection.contributionCalendar.weeks.flatMap(week => week.contributionDays);
  const cells = yearlyCells(days, now);
  await mkdir("dist", { recursive: true });
  for (const dark of [false, true]) {
    const file = `dist/github-snake-yearly${dark ? "-dark" : ""}.svg`;
    await writeFile(file, renderYear(cells, now, dark));
    console.log(`Generated ${file}: ${cells[0].date} to ${cells[cells.length - 1].date}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
