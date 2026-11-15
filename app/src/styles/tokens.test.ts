// @vitest-environment node
/**
 * Every text colour token meets WCAG AA (4.5:1) on both background tokens, in
 * both themes. Read straight from tokens.css so the check follows the source.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function block(selector: RegExp): Record<string, string> {
  const match = selector.exec(css);
  if (!match) throw new Error("block not found");
  const out: Record<string, string> = {};
  for (const m of match[1]?.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi) ?? []) out[m[1] ?? ""] = m[2] ?? "";
  return out;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const light = block(/:root\s*{([^}]*)}/);
const dark = { ...light, ...block(/prefers-color-scheme: dark\)\s*{\s*:root\s*{([^}]*)}/) };
const TEXT = ["ink", "ink-2", "ink-3", "accent", "ok", "warn", "danger"];

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme", (_name, tokens) => {
  it.each(TEXT)("--%s is readable on paper and fields", (token) => {
    const fg = tokens[token] ?? "";
    for (const bg of ["paper", "field"]) {
      expect(contrast(fg, tokens[bg] ?? "")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("puts accent text on the accent at AA", () => {
    expect(contrast(tokens["accent-ink"] ?? "", tokens.accent ?? "")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps buttons readable: paper on ink", () => {
    expect(contrast(tokens.paper ?? "", tokens.ink ?? "")).toBeGreaterThanOrEqual(4.5);
  });
});
