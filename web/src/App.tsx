import { useState, useCallback, useEffect, useRef } from "react";
import { GameShell, GameTopbar, GameAuth } from "@freegamestore/games";
import { Game } from "./components/Game";

const BEST_SCORE_KEY = "freepacman-best";

function getBestScore(): number {
  const v = localStorage.getItem(BEST_SCORE_KEY);
  return v ? parseInt(v, 10) : 0;
}

export default function App() {
  const [phase, setPhase] = useState<"menu" | "playing" | "over">("menu");
  const [score, setScore] = useState(0);
  const [bestScore, setBestScore] = useState(getBestScore);
  const scoreRef = useRef(0);

  const handleScore = useCallback((s: number) => {
    scoreRef.current = s;
    setScore(s);
  }, []);

  const handleGameOver = useCallback(() => {
    const final = scoreRef.current;
    const best = getBestScore();
    if (final > best) {
      localStorage.setItem(BEST_SCORE_KEY, String(final));
      setBestScore(final);
    }
    setPhase("over");
  }, []);

  const start = useCallback(() => {
    setScore(0);
    scoreRef.current = 0;
    setPhase("playing");
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (phase !== "playing" && (e.key === " " || e.key === "Enter")) {
        start();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, start]);

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Pac-Man"
          stats={[
            { label: "Score", value: score, accent: true },
            { label: "Best", value: bestScore },
          ]}
          actions={<GameAuth />}
          rules={
            <div>
              <h3 style={{ fontWeight: 700 }}>Pac-Man</h3>
              <h4 style={{ fontWeight: 600 }}>Rules</h4>
              <ul><li>Eat all dots to clear the level</li><li>Avoid ghosts — they cost a life</li><li>Power pellets let you eat ghosts temporarily</li></ul>
              <h4 style={{ fontWeight: 600 }}>Controls</h4>
              <ul><li>Arrow keys, WASD, or swipe to move</li></ul>
            </div>
          }
        />
      }
    >
      <div className="relative w-full h-full">
        {phase === "playing" ? (
          <Game onScore={handleScore} onGameOver={handleGameOver} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <h1
              className="text-4xl font-bold"
              style={{ fontFamily: "Fraunces, serif" }}
            >
              Pac-Man
            </h1>
            {phase === "over" && (
              <p
                className="text-xl font-bold"
                style={{ color: "var(--error)", fontFamily: "Fraunces, serif" }}
              >
                Game Over! Score: {score}
              </p>
            )}
            <p style={{ color: "var(--muted)" }}>
              Eat all the dots. Arrow keys, WASD, or swipe to move.
            </p>
            <button
              onClick={start}
              className="px-6 py-3 rounded-xl font-semibold"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {phase === "menu" ? "Start Game" : "Play Again"}
            </button>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Press Space or Enter to start
            </p>
          </div>
        )}
      </div>
    </GameShell>
  );
}
