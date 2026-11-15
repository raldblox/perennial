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

function figure(name: string, value: string, unit: string, scale: number): Node {
  return h(
    "div",
    { display: "flex", flexDirection: "column", gap: 10 * scale, flex: 1, paddingTop: 22 * scale, paddingRight: 24 * scale },
    label(name, 17 * scale),
    h("div", { fontFamily: "Serif", fontWeight: 500, fontSize: 54 * scale, color: color("ink"), letterSpacing: -0.5, whiteSpace: "nowrap" }, value),
    h("div", { fontFamily: "Sans", fontSize: 21 * scale, color: color("ink-3") }, unit),
  );
}

/** The cover and the social preview share one composition, scaled. */
function composition(width: number, height: number): Node {
  const s = width / 1920;
  const pad = 112 * s;
  return h(
    "div",
    {
      width,
      height,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      padding: pad,
      backgroundColor: color("paper"),
      fontFamily: "Sans",
    },
    h(
      "div",
      { display: "flex", justifyContent: "space-between", alignItems: "center" },
      h(
        "div",
        { display: "flex", alignItems: "center", gap: 16 * s, color: color("ink") },
        markSvg(color("accent"), 46 * s),
        h("div", { fontFamily: "Serif", fontWeight: 600, fontSize: 46 * s, color: color("ink"), letterSpacing: -0.5 }, "Perennial"),
      ),
      label("On-chain endowment · QoreChain testnet", 18 * s),
    ),
    h(
      "div",
      { display: "flex", flexDirection: "column", gap: 34 * s },
      h(
        "div",
        { display: "flex", flexDirection: "column", fontFamily: "Serif", fontWeight: 500, fontSize: 132 * s, lineHeight: 1.04, color: color("ink"), letterSpacing: -2 * s },
        h("div", {}, "Spend the income."),
        h("div", { color: color("accent") }, "Never the capital."),
      ),
      h(
        "div",
        { fontSize: 33 * s, lineHeight: 1.45, color: color("ink-2"), maxWidth: 1240 * s },
        "Capital on chain, income on a schedule, a check-in for proof of life and heirs when it stops. Every instruction carries an ML-DSA-87 signature. Nobody holds the keys.",
      ),
    ),
    h(
      "div",
      { display: "flex", borderTop: `${Math.max(1, 2 * s)}px solid ${color("rule-strong")}` },
      figure("Principal", "110,400", "fUSD, never paid out", s),
      figure("Payout", "400", "fUSD a month", s),
      figure("Margin", "1.15×", "at 5% a year", s),
      figure("Signatures", "ML-DSA-87", "checked in contract", s),
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
