/**
 * brand.ts - render Perennial's cover image, social preview and icons from the
 * app's own design tokens (src/styles/tokens.css) and bundled fonts.
 *
 * Deterministic: the same tokens, fonts and text give the same files.
 *
 *   pnpm brand
 *
 * Writes:
 *   ../docs/assets/cover.png      1920 x 1080, the repository's cover
 *   public/social.png             1200 x 630, the page's link preview
 *   public/favicon.svg            the mark, following the colour scheme
 *   public/favicon.png            64 x 64
 *   public/apple-touch-icon.png   180 x 180
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
const fontDir = (pkg: string) => resolve(app, "node_modules/@fontsource", pkg, "files");

/** Light-theme tokens, read from the stylesheet the app uses. */
function tokens(): Record<string, string> {
  const css = readFileSync(resolve(app, "src/styles/tokens.css"), "utf8");
  const root = /:root\s*{([^}]*)}/.exec(css)?.[1] ?? "";
  const out: Record<string, string> = {};
  for (const m of root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1] ?? ""] = m[2] ?? "";
  return out;
}

const t = tokens();
const color = (name: string): string => {
  const value = t[name];
  if (!value) throw new Error(`missing token --${name}`);
  return value;
};

const fonts = [
  { name: "Serif", weight: 500 as const, file: resolve(fontDir("source-serif-4"), "source-serif-4-latin-500-normal.woff") },
  { name: "Serif", weight: 600 as const, file: resolve(fontDir("source-serif-4"), "source-serif-4-latin-600-normal.woff") },
  { name: "Sans", weight: 400 as const, file: resolve(fontDir("ibm-plex-sans"), "ibm-plex-sans-latin-400-normal.woff") },
  { name: "Sans", weight: 600 as const, file: resolve(fontDir("ibm-plex-sans"), "ibm-plex-sans-latin-600-normal.woff") },
].map((f) => ({ name: f.name, weight: f.weight, style: "normal" as const, data: readFileSync(f.file) }));

type Style = Record<string, string | number>;
interface Node {
  type: string;
  props: { style?: Style; children?: Child | Child[]; [key: string]: unknown };
}
type Child = Node | string;

function h(type: string, style: Style, ...children: Child[]): Node {
  return { type, props: { style, children: children.length === 1 ? children[0] : children } };
}

/** The mark: a fixed core and the cycle of income around it (same geometry as the app's). */
function markSvg(fill: string, size: number): Node {
  return {
    type: "svg",
    props: {
      width: size,
      height: size,
      viewBox: "0 0 32 32",
      children: [
        { type: "circle", props: { cx: 16, cy: 16, r: 5.5, fill } },
        {
          type: "path",
          props: { d: "M16 4.5a11.5 11.5 0 1 1-11.5 11.5", fill: "none", stroke: fill, strokeWidth: 2.5, strokeLinecap: "round" },
        },
      ],
    },
  };
}

function label(text: string, size: number): Node {
  return h("div", { fontFamily: "Sans", fontWeight: 600, fontSize: size, letterSpacing: size * 0.14, color: color("ink-3") }, text.toUpperCase());
}

/** A downward arrow, drawn, so it does not depend on a font's glyphs. */
function arrow(stroke: string, height: number, scale: number): Node {
  const w = 22 * scale;
  return {
    type: "svg",
    props: {
      width: w,
      height,
      viewBox: `0 0 22 ${(height / scale).toString()}`,
      children: [
        { type: "line", props: { x1: 11, y1: 0, x2: 11, y2: height / scale - 9, stroke, strokeWidth: 2.5 } },
        { type: "path", props: { d: `M3 ${(height / scale - 12).toString()} L11 ${(height / scale).toString()} L19 ${(height / scale - 12).toString()} Z`, fill: stroke } },
      ],
    },
  };
}

/** One stage of the mechanism: a box with a label, a figure and a note. */
function stage(name: string, value: string, note: string, scale: number, filled = false): Node {
  const ink = filled ? color("accent-ink") : color("ink");
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      gap: 6 * scale,
      padding: `${20 * scale}px ${26 * scale}px`,
      backgroundColor: filled ? color("accent") : color("field"),
      border: `${Math.max(1, 2 * scale)}px solid ${filled ? color("accent") : color("rule-strong")}`,
    },
    h("div", { fontFamily: "Sans", fontWeight: 600, fontSize: 16 * scale, letterSpacing: 16 * scale * 0.14, color: filled ? color("accent-wash") : color("ink-3") }, name.toUpperCase()),
    h("div", { fontFamily: "Serif", fontWeight: 600, fontSize: 44 * scale, color: ink, letterSpacing: -0.5 }, value),
    h("div", { fontFamily: "Sans", fontSize: 20 * scale, color: filled ? color("accent-wash") : color("ink-2") }, note),
  );
}

/** The link between two stages: an arrow and what travels along it. */
function flow(text: string, scale: number): Node {
  return h(
    "div",
    { display: "flex", alignItems: "center", gap: 16 * scale, paddingLeft: 30 * scale, height: 70 * scale },
    arrow(color("accent"), 62 * scale, scale),
    h("div", { fontFamily: "Sans", fontWeight: 600, fontSize: 20 * scale, color: color("accent") }, text),
  );
}

function aside(text: string, scale: number): Node {
  return h(
    "div",
    { display: "flex", flex: 1, fontFamily: "Sans", fontSize: 18 * scale, lineHeight: 1.35, color: color("ink-2"), borderTop: `${Math.max(1, 2 * scale)}px solid ${color("rule")}`, paddingTop: 12 * scale },
    text,
  );
}

/** The cover and the social preview share one composition, scaled: the promise on the left, the mechanism on the right. */
function composition(width: number, height: number): Node {
  const s = width / 1920;
  const pad = 100 * s;
  return h(
    "div",
    { width, height, display: "flex", padding: pad, gap: 88 * s, backgroundColor: color("paper"), fontFamily: "Sans" },
    h(
      "div",
      { display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 },
      h(
        "div",
        { display: "flex", alignItems: "center", gap: 16 * s },
        markSvg(color("accent"), 46 * s),
        h("div", { fontFamily: "Serif", fontWeight: 600, fontSize: 46 * s, color: color("ink"), letterSpacing: -0.5 }, "Perennial"),
      ),
      h(
        "div",
        { display: "flex", flexDirection: "column", gap: 30 * s },
        h(
          "div",
          { display: "flex", flexDirection: "column", fontFamily: "Serif", fontWeight: 500, fontSize: 96 * s, lineHeight: 1.04, color: color("ink"), letterSpacing: -2 * s },
          h("div", {}, "Deposit once."),
          h("div", { color: color("accent") }, "The yield pays"),
          h("div", { color: color("accent") }, "your agent's calls."),
        ),
        h(
          "div",
          { fontSize: 29 * s, lineHeight: 1.45, color: color("ink-2") },
          "The agent spends call by call with its own ML-DSA-87 key, checked in the contract. A stolen or quantum-recovered classical key moves nothing.",
        ),
      ),
      h(
        "div",
        { display: "flex", flexDirection: "column", gap: 8 * s },
        label("On-chain endowment · QoreChain testnet", 17 * s),
        h("div", { fontFamily: "Sans", fontSize: 19 * s, color: color("ink-3") }, "Yield simulated at the Aave v3 USDC rate of 16 Nov 2026 (4.29%)."),
      ),
    ),
    h(
      "div",
      { display: "flex", flexDirection: "column", justifyContent: "center", width: 700 * s },
      stage("Principal", "500 fUSD", "Deposited once. Never spent.", s),
      flow("yield, 4.29% a year", s),
      stage("Buffer", "0.048 fUSD cap", "A day of calls. Above it, yield joins the principal.", s),
      flow("spend, signed with ML-DSA-87", s),
      stage("Agent's calls", "1.06 an hour", "0.002 fUSD each, paid to any recipient", s, true),
      h(
        "div",
        { display: "flex", gap: 24 * s, marginTop: 34 * s },
        aside("Agent goes silent: the income passes to its heirs.", s),
        aside("Owner kept the right: one signature closes and returns the capital.", s),
      ),
    ),
  );
}

async function png(node: Node, width: number, height: number): Promise<Buffer> {
  const svg = await satori(node as never, { width, height, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

function iconNode(size: number): Node {
  return h(
    "div",
    { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: color("paper"), borderRadius: size * 0.18 },
    markSvg(color("accent"), size * 0.78),
  );
}

function faviconSvg(): string {
  const dark = /prefers-color-scheme: dark\)\s*{\s*:root\s*{([^}]*)}/.exec(readFileSync(resolve(app, "src/styles/tokens.css"), "utf8"))?.[1] ?? "";
  const darkAccent = /--accent:\s*(#[0-9a-f]{6})/i.exec(dark)?.[1] ?? color("accent");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <style>path,circle{color:${color("accent")}}@media (prefers-color-scheme: dark){path,circle{color:${darkAccent}}}</style>
  <circle cx="16" cy="16" r="5.5" fill="currentColor"/>
  <path d="M16 4.5a11.5 11.5 0 1 1-11.5 11.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
</svg>
`;
}

async function main(): Promise<void> {
  const write = (path: string, data: Buffer | string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    console.log(`wrote ${path} (${Buffer.byteLength(data).toLocaleString("en")} bytes)`);
  };
  write(resolve(app, "../docs/assets/cover.png"), await png(composition(1920, 1080), 1920, 1080));
  write(resolve(app, "public/social.png"), await png(composition(1200, 675), 1200, 675));
  write(resolve(app, "public/favicon.svg"), faviconSvg());
  write(resolve(app, "public/favicon.png"), await png(iconNode(64), 64, 64));
  write(resolve(app, "public/apple-touch-icon.png"), await png(iconNode(180), 180, 180));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
