/**
 * brand.ts - render Perennial's cover image, social preview and icons from the
 * app's own design tokens (src/styles/tokens.css) and bundled fonts.
 *
 * Deterministic: the same tokens, fonts and text give the same files.
 *
 *   pnpm brand
 *
 * Writes:
 *   ../docs/assets/cover.png      1600 x 900, the repository's and project page's cover,
 *                                 around ../docs/assets/panel.png (pnpm panel-shot)
 *   public/social.png             1200 x 630, the page's link preview
 *   public/favicon.svg            the mark, following the colour scheme
 *   public/favicon.png            64 x 64
 *   public/apple-touch-icon.png   180 x 180
 *   public/icon-192.png, icon-512.png, icon-maskable-512.png   the installed app's icons
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
  return { type, props: { style, children: children.length === 0 ? undefined : children.length === 1 ? children[0] : children } };
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

/** The live control panel, screenshotted by `pnpm panel-shot` (or PANEL_IMAGE for a trial). */
function panelImage(): { src: string; width: number; height: number } {
  const file = process.env.PANEL_IMAGE ?? resolve(app, "../docs/assets/panel.png");
  const data = readFileSync(file);
  // PNG header: width and height are big-endian at bytes 16 and 20.
  return { src: `data:image/png;base64,${data.toString("base64")}`, width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function dot(scale: number): Node {
  return h("div", { width: 12 * scale, height: 12 * scale, borderRadius: 12 * scale, backgroundColor: color("rule") });
}

function proof(text: string, scale: number): Node {
  return h(
    "div",
    { display: "flex", gap: 14 * scale, alignItems: "flex-start", borderTop: `${Math.max(1, 1.5 * scale)}px solid ${color("rule")}`, paddingTop: 11 * scale, fontSize: 19 * scale, lineHeight: 1.35, color: color("ink-2") },
    h("div", { width: 8 * scale, height: 8 * scale, borderRadius: 8 * scale, backgroundColor: color("accent"), flexShrink: 0, marginTop: 9 * scale }),
    h("div", {}, text),
  );
}

function factRow(name: string, value: string, scale: number): Node {
  return h(
    "div",
    { display: "flex", justifyContent: "space-between", gap: 24 * scale, borderTop: `${Math.max(1, 1.5 * scale)}px solid ${color("rule")}`, paddingTop: 12 * scale, fontSize: 19 * scale },
    h("div", { color: color("ink-3") }, name),
    h("div", { color: color("ink"), fontWeight: 600 }, value),
  );
}

/**
 * The cover and the social preview share one composition, scaled from 1600 x 900: the
 * claim and its proof on the left, the live control panel in a browser frame on the right.
 */
function composition(width: number, height: number): Node {
  const s = width / 1600;
  const panel = panelImage();
  const frameW = 980 * s;
  const shotH = (frameW * panel.height) / panel.width;
  return h(
    "div",
    { width, height, display: "flex", position: "relative", overflow: "hidden", backgroundColor: color("paper"), fontFamily: "Sans" },
    // The browser frame, bleeding off the right and bottom edges.
    h(
      "div",
      {
        position: "absolute",
        left: 760 * s,
        top: 118 * s,
        width: frameW,
        height: 900 * s,
        display: "flex",
        flexDirection: "column",
        backgroundColor: color("field"),
        border: `${Math.max(1, 2 * s)}px solid ${color("rule-strong")}`,
        borderRadius: 14 * s,
        overflow: "hidden",
      },
      h(
        "div",
        { display: "flex", alignItems: "center", gap: 10 * s, height: 46 * s, paddingLeft: 18 * s, borderBottom: `${Math.max(1, 1.5 * s)}px solid ${color("rule")}`, backgroundColor: color("paper") },
        dot(s),
        dot(s),
        dot(s),
        h("div", { marginLeft: 18 * s, fontSize: 17 * s, color: color("ink-3") }, "perennial-flax.vercel.app/#/position/demo/1"),
      ),
      { type: "img", props: { src: panel.src, width: frameW, height: shotH, style: { width: frameW, height: shotH } } },
    ),
    // Facts every spend carries, over the frame.
    h(
      "div",
      {
        position: "absolute",
        left: 690 * s,
        top: 600 * s,
        width: 460 * s,
        display: "flex",
        flexDirection: "column",
        gap: 12 * s,
        padding: `${22 * s}px ${26 * s}px`,
        backgroundColor: color("field"),
        border: `${Math.max(1, 2 * s)}px solid ${color("rule-strong")}`,
        borderRadius: 12 * s,
      },
      h("div", { fontFamily: "Serif", fontWeight: 600, fontSize: 26 * s, color: color("ink") }, "Every spend"),
      factRow("Signature", "ML-DSA-87 · FIPS 204", s),
      factRow("Size", "4,627 bytes", s),
      factRow("Verified", "in the contract, pqcVerify", s),
    ),
    // The claim and its proof.
    h(
      "div",
      { position: "absolute", left: 88 * s, top: 72 * s, width: 600 * s, height: 756 * s, display: "flex", flexDirection: "column", justifyContent: "space-between" },
      h(
        "div",
        { display: "flex", alignItems: "center", gap: 14 * s },
        markSvg(color("accent"), 40 * s),
        h("div", { fontFamily: "Serif", fontWeight: 600, fontSize: 40 * s, color: color("ink"), letterSpacing: -0.5 }, "Perennial"),
      ),
      h(
        "div",
        { display: "flex", flexDirection: "column", gap: 22 * s },
        label("Inference budget for AI agents · QoreChain testnet", 15 * s),
        h(
          "div",
          { display: "flex", flexDirection: "column", fontFamily: "Serif", fontWeight: 500, fontSize: 54 * s, lineHeight: 1.06, color: color("ink"), letterSpacing: -1.2 * s },
          h("div", {}, "An inference budget"),
          h("div", {}, "your agent spends"),
          h("div", { color: color("accent") }, "and nobody can steal."),
        ),
        h(
          "div",
          { display: "flex", flexDirection: "column", gap: 12 * s, width: 560 * s },
          proof("Every spend needs the agent's ML-DSA-87 signature, checked in the contract.", s),
          proof("A recovered classical key moves 0 fUSD; a stolen agent key, one budget window.", s),
          proof("With a yield vault it lasts indefinitely when the yield covers the spend.", s),
        ),
      ),
      h("div", { fontSize: 17 * s, color: color("ink-3") }, "perennial-flax.vercel.app · github.com/raldblox/perennial"),
    ),
  );
}

async function png(node: Node, width: number, height: number): Promise<Buffer> {
  const svg = await satori(node as never, { width, height, fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
}

function iconNode(size: number, maskable = false): Node {
  // A maskable icon fills the square and keeps the mark inside the central 80% safe zone.
  return h(
    "div",
    { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: color("paper"), borderRadius: maskable ? 0 : size * 0.18 },
    markSvg(color("accent"), size * (maskable ? 0.56 : 0.78)),
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
  write(resolve(app, "../docs/assets/cover.png"), await png(composition(1600, 900), 1600, 900));
  write(resolve(app, "public/social.png"), await png(composition(1200, 675), 1200, 675));
  write(resolve(app, "public/favicon.svg"), faviconSvg());
  write(resolve(app, "public/favicon.png"), await png(iconNode(64), 64, 64));
  write(resolve(app, "public/apple-touch-icon.png"), await png(iconNode(180), 180, 180));
  write(resolve(app, "public/icon-192.png"), await png(iconNode(192), 192, 192));
  write(resolve(app, "public/icon-512.png"), await png(iconNode(512), 512, 512));
  write(resolve(app, "public/icon-maskable-512.png"), await png(iconNode(512, true), 512, 512));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
