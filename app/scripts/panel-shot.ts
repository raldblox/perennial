/**
 * panel-shot.ts - screenshot a live position's control panel for the cover.
 *
 * The cover shows the app as it is, reading the testnet, so it stays true:
 * regenerate it after the panel changes.
 *
 *   pnpm build && pnpm preview          # in another terminal
 *   pnpm panel-shot demo/1              # vault id / position number
 *   pnpm brand                          # composes the cover around it
 *
 * Uses an installed Chromium (Playwright's cache, or PANEL_SHOT_CHROMIUM).
 * Writes ../docs/assets/panel.png at 1120 x 1000 CSS pixels, scale 2.
 */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../../docs/assets/panel.png");
const target = process.argv[2] ?? "demo/1";
const base = process.env.PANEL_SHOT_BASE ?? "http://localhost:4173/";

const browser = await chromium.launch(process.env.PANEL_SHOT_CHROMIUM ? { executablePath: process.env.PANEL_SHOT_CHROMIUM } : {});
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 1000 }, deviceScaleFactor: 2, colorScheme: "light" });
  await page.goto(`${base}#/position/${target}`);
  // The panel reads the chain: wait until the ledger and the health figures are in.
  await page.getByRole("heading", { name: /Position \d+/ }).waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector(".skeleton"), undefined, { timeout: 60_000 });
  await page.waitForTimeout(1_000);
  mkdirSync(dirname(out), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`wrote ${out} from ${base}#/position/${target}`);
} finally {
  await browser.close();
}
