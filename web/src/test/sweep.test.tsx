import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../components/Game", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../components/Game")>()),
  Game: () => null,
}));

import App from "../App";
import { fitCanvas } from "../components/Game";

describe("fitCanvas", () => {
  it("only reallocates the backing store when the size changes", () => {
    let writes = 0;
    let width = 300;
    let height = 150;
    const canvas = {
      get width() { return width; },
      set width(v: number) { writes++; width = v; },
      get height() { return height; },
      set height(v: number) { writes++; height = v; },
      style: {} as CSSStyleDeclaration,
    } as HTMLCanvasElement;

    fitCanvas(canvas, 400, 300, 2.5);
    expect([canvas.width, canvas.height, writes]).toEqual([1000, 750, 2]);
    expect(canvas.style.width).toBe("400px");

    fitCanvas(canvas, 400, 300, 2.5);
    fitCanvas(canvas, 400, 300, 2.5);
    expect(writes).toBe(2);

    fitCanvas(canvas, 401.3, 300, 1.75); // fractional sizes floor like the DOM does
    expect([canvas.width, canvas.height, writes]).toEqual([702, 525, 4]);
  });
});

describe("best score persistence", () => {
  beforeEach(() => localStorage.clear());

  it("treats a corrupt stored best as 0 instead of NaN", () => {
    localStorage.setItem("freepacman-best", "garbage");
    render(<App />);
    expect(screen.queryByText("NaN")).toBeNull();
  });
});
