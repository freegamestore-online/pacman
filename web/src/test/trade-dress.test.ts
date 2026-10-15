import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { describe, it, expect } from "vitest";

const WEB = resolve(__dirname, "../..");

// Shipped surface: everything under src/ except the tests, plus the HTML entry and Vite config
// (title, meta, manifest). Tests are excluded so the banned-name list below doesn't match itself.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "test" ? [] : walk(full);
    return [full];
  });
}

const shipped = [
  ...walk(resolve(WEB, "src")),
  resolve(WEB, "index.html"),
  resolve(WEB, "vite.config.ts"),
].map((file) => ({ file: relative(WEB, file), text: readFileSync(file, "utf-8") }));

const PAC_MAN_TITLE = /pac-man/i;
const GHOST_NAMES = /\b(blinky|pinky|inky|clyde)\b/i;

describe("trade dress removed", () => {
  it("scans the shipped sources", () => {
    expect(shipped.map((s) => s.file)).toEqual(
      expect.arrayContaining(["index.html", "vite.config.ts", "src/App.tsx", "src/components/Game.tsx"]),
    );
  });

  it('never contains "Pac-Man"', () => {
    const hits = shipped.filter((s) => PAC_MAN_TITLE.test(s.text)).map((s) => s.file);
    expect(hits).toEqual([]);
  });

  it("never names the ghosts Blinky, Pinky, Inky or Clyde", () => {
    const hits = shipped.filter((s) => GHOST_NAMES.test(s.text)).map((s) => s.file);
    expect(hits).toEqual([]);
  });

  it('uses "Dot Muncher" for the title, manifest and topbar', () => {
    const byFile = Object.fromEntries(shipped.map((s) => [s.file, s.text]));
    expect(byFile["index.html"]).toContain("<title>Dot Muncher");
    expect(byFile["vite.config.ts"]).toContain("name: 'Dot Muncher'");
    expect(byFile["src/App.tsx"]).toContain('title="Dot Muncher"');
  });

  it("keeps the storage key and analytics app id", () => {
    const byFile = Object.fromEntries(shipped.map((s) => [s.file, s.text]));
    expect(byFile["src/App.tsx"]).toContain('"freepacman-best"');
    expect(byFile["index.html"]).toContain("?app=pacman");
  });
});
