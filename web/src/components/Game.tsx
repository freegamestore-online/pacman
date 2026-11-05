import { useRef, useEffect, useCallback } from "react";
import { useGameSounds } from "@freegamestore/games";

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  paused?: boolean;
}

// ---------------------------------------------------------------------------
// Maze definition: 0 = wall, 1 = dot, 2 = power pellet, 3 = empty path
// 21 columns x 23 rows, original layout (no arcade maze)
// ---------------------------------------------------------------------------
const MAZE_TEMPLATE: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,2,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,2,0],
  [0,1,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,1,0],
  [0,1,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,0,1,0,0,0,1,1,1,0,0,0,1,0,0,0,1,0],
  [0,1,0,0,0,1,0,0,0,1,1,1,0,0,0,1,0,0,0,1,0],
  [0,1,0,0,0,1,0,0,0,1,1,1,0,0,0,1,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,0,0,3,0,0,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,0,3,3,3,0,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,0,3,3,3,0,1,1,1,3,1,1,1,1],
  [0,1,1,1,1,1,1,1,0,0,0,0,0,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,0,1,0,0,0,1,1,1,0,0,0,1,0,0,0,1,0],
  [0,1,0,0,0,1,0,0,0,1,1,1,0,0,0,1,0,0,0,1,0],
  [0,1,0,0,0,1,0,0,0,1,1,1,0,0,0,1,0,0,0,1,0],
  [0,1,1,1,1,1,1,1,1,1,3,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,1,0],
  [0,1,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,1,0],
  [0,2,0,0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0,2,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

const COLS = MAZE_TEMPLATE[0]!.length;
const ROWS = MAZE_TEMPLATE.length;

const DIR_UP = 0;
const DIR_DOWN = 1;
const DIR_LEFT = 2;
const DIR_RIGHT = 3;

const DX = [0, 0, -1, 1];
const DY = [-1, 1, 0, 0];

interface Chaser {
  x: number;
  y: number;
  dir: number;
  color: string;
  scared: boolean;
  eaten: boolean;
  moveTimer: number;
}

interface PacState {
  // Muncher position (grid coords, fractional during movement)
  px: number;
  py: number;
  dir: number;
  nextDir: number;
  mouthAngle: number;
  mouthOpening: boolean;

  // Game state
  maze: number[][];
  score: number;
  lives: number;
  level: number;
  totalDots: number;
  dotsEaten: number;
  chasers: Chaser[];
  powerTimer: number;
  chasersEatenThisPower: number;
  moveTimer: number;
  gameOver: boolean;

  // Speed (cells per second)
  pacSpeed: number;
  chaserSpeed: number;
}

function cloneMaze(): number[][] {
  return MAZE_TEMPLATE.map((row) => [...row]);
}

function countDots(maze: number[][]): number {
  let count = 0;
  for (const row of maze) {
    for (const cell of row) {
      if (cell === 1 || cell === 2) count++;
    }
  }
  return count;
}

function isWalkable(maze: number[][], col: number, row: number): boolean {
  // Wrap horizontally for tunnel
  const c = ((col % COLS) + COLS) % COLS;
  if (row < 0 || row >= ROWS) return false;
  const cell = maze[row]?.[c];
  return cell !== undefined && cell !== 0;
}

function canMove(maze: number[][], x: number, y: number, dir: number): boolean {
  const nx = x + DX[dir]!;
  const ny = y + DY[dir]!;
  return isWalkable(maze, nx, ny);
}

// Brand colours for the chasers; they carry no names or individual identities.
const CHASER_COLORS = ["#dc2626", "#2563eb", "#d97706", "#16a34a"];

function createChasers(): Chaser[] {
  return [
    { x: 9, y: 9, dir: DIR_UP, color: CHASER_COLORS[0]!, scared: false, eaten: false, moveTimer: 0 },
    { x: 10, y: 9, dir: DIR_UP, color: CHASER_COLORS[1]!, scared: false, eaten: false, moveTimer: 0 },
    { x: 11, y: 9, dir: DIR_UP, color: CHASER_COLORS[2]!, scared: false, eaten: false, moveTimer: 0 },
    { x: 10, y: 10, dir: DIR_UP, color: CHASER_COLORS[3]!, scared: false, eaten: false, moveTimer: 0 },
  ];
}

function createState(): PacState {
  const maze = cloneMaze();
  return {
    px: 10,
    py: 16,
    dir: DIR_LEFT,
    nextDir: DIR_LEFT,
    mouthAngle: 0.3,
    mouthOpening: true,
    maze,
    score: 0,
    lives: 3,
    level: 1,
    totalDots: countDots(maze),
    dotsEaten: 0,
    chasers: createChasers(),
    powerTimer: 0,
    chasersEatenThisPower: 0,
    moveTimer: 0,
    gameOver: false,
    pacSpeed: 6,
    chaserSpeed: 4.5,
  };
}

function resetPositions(s: PacState) {
  s.px = 10;
  s.py = 16;
  s.dir = DIR_LEFT;
  s.nextDir = DIR_LEFT;
  s.chasers = createChasers();
  s.powerTimer = 0;
  s.chasersEatenThisPower = 0;
  s.moveTimer = 0;
}

function nextLevel(s: PacState) {
  s.level++;
  s.maze = cloneMaze();
  s.totalDots = countDots(s.maze);
  s.dotsEaten = 0;
  s.chaserSpeed = Math.min(8, 4.5 + s.level * 0.5);
  s.pacSpeed = Math.min(9, 6 + s.level * 0.3);
  resetPositions(s);
}

// ---------------------------------------------------------------------------
// DRAWING
// ---------------------------------------------------------------------------
const WALL_COLOR = "#0d9488";
const WALL_INNER_COLOR = "#042f2e";
const DOT_COLOR = "#e5e7eb";
const PELLET_COLOR = "#e5e7eb";
const BG_COLOR = "#0f0f0f";
const MUNCHER_COLOR = "#10b981";
const MUNCHER_EYE_COLOR = "#042f2e";
const SCARED_COLOR = "#9ca3af";

// Facing angle per direction (up, down, left, right)
const MUNCHER_FACING = [-Math.PI / 2, Math.PI / 2, Math.PI, 0];

function drawMaze(ctx: CanvasRenderingContext2D, maze: number[][], cellSize: number) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = maze[r]?.[c];
      const x = c * cellSize;
      const y = r * cellSize;

      if (cell === 0) {
        ctx.fillStyle = WALL_COLOR;
        ctx.fillRect(x, y, cellSize, cellSize);
        // Draw inner gap for nicer walls
        ctx.fillStyle = WALL_INNER_COLOR;
        const inset = cellSize * 0.15;
        ctx.fillRect(x + inset, y + inset, cellSize - inset * 2, cellSize - inset * 2);
      } else if (cell === 1) {
        // Dot
        ctx.fillStyle = DOT_COLOR;
        ctx.beginPath();
        ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.1, 0, Math.PI * 2);
        ctx.fill();
      } else if (cell === 2) {
        // Power pellet
        ctx.fillStyle = PELLET_COLOR;
        ctx.beginPath();
        ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      // 3 = empty path, draw nothing
    }
  }
}

// Muncher: a rounded square with a wedge bite that opens toward its facing angle.
function drawMuncher(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  angle: number,
  mouth: number,
) {
  const gap = r * Math.min(0.5, mouth * 1.2);
  const corner = r * 0.35;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.fillStyle = MUNCHER_COLOR;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(r, -gap);
  ctx.arcTo(r, -r, -r, -r, corner);
  ctx.arcTo(-r, -r, -r, r, corner);
  ctx.arcTo(-r, r, r, r, corner);
  ctx.arcTo(r, r, r, gap, corner);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = MUNCHER_EYE_COLOR;
  ctx.beginPath();
  ctx.arc(-r * 0.15, -r * 0.5, r * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Chaser: a rounded block with two eyes that look toward its movement.
function drawChaser(
  ctx: CanvasRenderingContext2D,
  chaser: Chaser,
  cellSize: number,
) {
  const cx = chaser.x * cellSize + cellSize / 2;
  const cy = chaser.y * cellSize + cellSize / 2;
  const r = cellSize * 0.45;

  ctx.fillStyle = chaser.scared ? SCARED_COLOR : chaser.color;
  ctx.beginPath();
  ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.45);
  ctx.fill();

  if (chaser.scared) {
    // Simple scared eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.15, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.3, cy - r * 0.2, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // White of eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.3, cy - r * 0.2, r * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // Pupils (look in movement direction)
    const pdx = DX[chaser.dir]! * r * 0.08;
    const pdy = DY[chaser.dir]! * r * 0.08;
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(cx - r * 0.3 + pdx, cy - r * 0.2 + pdy, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + r * 0.3 + pdx, cy - r * 0.2 + pdy, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLives(ctx: CanvasRenderingContext2D, lives: number, cellSize: number) {
  for (let i = 0; i < lives - 1; i++) {
    const cx = cellSize * 1.5 + i * cellSize * 1.3;
    const cy = ROWS * cellSize + cellSize * 0.5;
    drawMuncher(ctx, cx, cy, cellSize * 0.35, 0, 0.25);
  }
}

// Resize the backing store only when the size changes; assigning width/height
// reallocates and clears the canvas, so doing it every frame is wasteful.
export function fitCanvas(canvas: HTMLCanvasElement, w: number, h: number, dpr: number) {
  const bw = Math.floor(w * dpr);
  const bh = Math.floor(h * dpr);
  if (canvas.width === bw && canvas.height === bh) return;
  canvas.width = bw;
  canvas.height = bh;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
}

// ---------------------------------------------------------------------------
// GAME LOGIC UPDATE
// ---------------------------------------------------------------------------
function updateState(s: PacState, dt: number): void {
  if (s.gameOver) return;

  // Animate mouth
  if (s.mouthOpening) {
    s.mouthAngle += dt * 4;
    if (s.mouthAngle > 0.4) s.mouthOpening = false;
  } else {
    s.mouthAngle -= dt * 4;
    if (s.mouthAngle < 0.05) s.mouthOpening = true;
  }

  // Power timer
  if (s.powerTimer > 0) {
    s.powerTimer -= dt;
    if (s.powerTimer <= 0) {
      s.powerTimer = 0;
      for (const g of s.chasers) g.scared = false;
      s.chasersEatenThisPower = 0;
    }
  }

  // Move muncher (remember where it was, to catch chasers swapping cells with it)
  const prevPx = s.px;
  const prevPy = s.py;
  s.moveTimer += dt * s.pacSpeed;
  if (s.moveTimer >= 1) {
    s.moveTimer -= 1;

    // Try next direction first
    if (canMove(s.maze, s.px, s.py, s.nextDir)) {
      s.dir = s.nextDir;
    }

    if (canMove(s.maze, s.px, s.py, s.dir)) {
      s.px += DX[s.dir]!;
      s.py += DY[s.dir]!;
      // Tunnel wrap
      s.px = ((s.px % COLS) + COLS) % COLS;
    }

    // Eat dot
    const cell = s.maze[s.py]?.[s.px];
    if (cell === 1) {
      s.maze[s.py]![s.px] = 3;
      s.score += 10;
      s.dotsEaten++;
    } else if (cell === 2) {
      s.maze[s.py]![s.px] = 3;
      s.score += 50;
      s.dotsEaten++;
      s.powerTimer = 7;
      s.chasersEatenThisPower = 0;
      for (const g of s.chasers) {
        if (!g.eaten) g.scared = true;
      }
    }

    // Level complete
    if (s.dotsEaten >= s.totalDots) {
      nextLevel(s);
      return;
    }
  }

  // Move chasers
  for (const g of s.chasers) {
    g.moveTimer += dt * s.chaserSpeed;
    if (g.moveTimer < 1) continue;
    g.moveTimer -= 1;
    const prevGx = g.x;
    const prevGy = g.y;

    // Decide direction: bias toward muncher with some randomness
    const possible: number[] = [];
    const opposite = g.dir === DIR_UP ? DIR_DOWN : g.dir === DIR_DOWN ? DIR_UP : g.dir === DIR_LEFT ? DIR_RIGHT : DIR_LEFT;
    for (let d = 0; d < 4; d++) {
      if (d === opposite) continue; // no 180 turns (unless only option)
      if (canMove(s.maze, g.x, g.y, d)) possible.push(d);
    }
    if (possible.length === 0) {
      // Dead end: allow reverse
      if (canMove(s.maze, g.x, g.y, opposite)) possible.push(opposite);
    }

    if (possible.length > 0) {
      let chosen: number;
      if (g.scared) {
        // Scared: move randomly
        chosen = possible[Math.floor(Math.random() * possible.length)]!;
      } else if (Math.random() < 0.6) {
        // Chase: pick direction that reduces distance to muncher
        let bestDist = Infinity;
        chosen = possible[0]!;
        for (const d of possible) {
          const nx = g.x + DX[d]!;
          const ny = g.y + DY[d]!;
          const dist = Math.abs(nx - s.px) + Math.abs(ny - s.py);
          if (dist < bestDist) {
            bestDist = dist;
            chosen = d;
          }
        }
      } else {
        // Random for variety
        chosen = possible[Math.floor(Math.random() * possible.length)]!;
      }

      g.dir = chosen;
      g.x += DX[chosen]!;
      g.y += DY[chosen]!;
      // Tunnel wrap
      g.x = ((g.x % COLS) + COLS) % COLS;
    }

    // Collision with muncher (same cell, or swapped cells this frame)
    const swapped = g.x === prevPx && g.y === prevPy && prevGx === s.px && prevGy === s.py;
    if ((g.x === s.px && g.y === s.py) || swapped) {
      if (g.scared) {
        g.eaten = true;
        g.scared = false;
        g.x = 10;
        g.y = 9;
        g.moveTimer = 0;
        s.chasersEatenThisPower++;
        s.score += 200 * Math.pow(2, s.chasersEatenThisPower - 1);
      } else if (!g.eaten) {
        s.lives--;
        if (s.lives <= 0) {
          s.gameOver = true;
          return;
        }
        resetPositions(s);
        return;
      }
    }
  }

  // Reset eaten status when power ends
  if (s.powerTimer <= 0) {
    for (const g of s.chasers) {
      if (g.eaten) {
        g.eaten = false;
      }
    }
  }

  // Also check collision after muncher moves (chaser may be on same cell)
  for (const g of s.chasers) {
    if (g.x === s.px && g.y === s.py && !g.eaten) {
      if (g.scared) {
        g.eaten = true;
        g.scared = false;
        g.x = 10;
        g.y = 9;
        g.moveTimer = 0;
        s.chasersEatenThisPower++;
        s.score += 200 * Math.pow(2, s.chasersEatenThisPower - 1);
      } else {
        s.lives--;
        if (s.lives <= 0) {
          s.gameOver = true;
          return;
        }
        resetPositions(s);
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export function Game({ onScore, onGameOver, paused }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PacState>(createState());
  const rafRef = useRef(0);
  const lastTimeRef = useRef(0);
  const onScoreRef = useRef(onScore);
  const onGameOverRef = useRef(onGameOver);
  const pausedRef = useRef(paused);
  const gameOverFiredRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const sounds = useGameSounds();
  const soundsRef = useRef(sounds);

  onScoreRef.current = onScore;
  onGameOverRef.current = onGameOver;
  pausedRef.current = paused;
  soundsRef.current = sounds;

  const setDirection = useCallback((dir: number) => {
    const s = stateRef.current;
    if (!s.gameOver) s.nextDir = dir;
  }, []);

  useEffect(() => {
    // Reset state on mount
    stateRef.current = createState();
    gameOverFiredRef.current = false;
    lastTimeRef.current = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") { setDirection(DIR_UP); e.preventDefault(); }
      else if (e.key === "ArrowDown" || e.key === "s") { setDirection(DIR_DOWN); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "a") { setDirection(DIR_LEFT); e.preventDefault(); }
      else if (e.key === "ArrowRight" || e.key === "d") { setDirection(DIR_RIGHT); e.preventDefault(); }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const start = touchStartRef.current;
      if (!t || !start) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      touchStartRef.current = null;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        setDirection(dx > 0 ? DIR_RIGHT : DIR_LEFT);
      } else {
        setDirection(dy > 0 ? DIR_DOWN : DIR_UP);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    const loop = (time: number) => {
      if (lastTimeRef.current === 0) lastTimeRef.current = time;
      if (pausedRef.current) {
        lastTimeRef.current = time;
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      const dt = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;

      const s = stateRef.current;
      const prevScore = s.score;
      const prevLives = s.lives;
      updateState(s, dt);
      onScoreRef.current(s.score);

      // Sound effects based on state changes
      if (s.score > prevScore) {
        // Chaser eaten gives 200+ points
        if (s.score - prevScore >= 200) {
          soundsRef.current.playLevelUp();
        } else {
          soundsRef.current.playScore();
        }
      }
      if (s.lives < prevLives) {
        soundsRef.current.playError();
      }

      if (s.gameOver && !gameOverFiredRef.current) {
        gameOverFiredRef.current = true;
        soundsRef.current.playGameOver();
        onGameOverRef.current();
      }

      // Draw
      const canvas = canvasRef.current;
      if (canvas) {
        const parent = canvas.parentElement;
        if (parent) {
          const dpr = window.devicePixelRatio || 1;
          const w = parent.clientWidth;
          const h = parent.clientHeight;
          fitCanvas(canvas, w, h, dpr);

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Calculate cell size to fit maze in canvas
            const hud = 30; // bottom area for lives
            const cellW = w / COLS;
            const cellH = (h - hud) / ROWS;
            const cellSize = Math.min(cellW, cellH);
            const offsetX = (w - cellSize * COLS) / 2;
            const offsetY = (h - hud - cellSize * ROWS) / 2;

            ctx.fillStyle = BG_COLOR;
            ctx.fillRect(0, 0, w, h);

            ctx.save();
            ctx.translate(offsetX, offsetY);

            drawMaze(ctx, s.maze, cellSize);
            drawMuncher(
              ctx,
              s.px * cellSize + cellSize / 2,
              s.py * cellSize + cellSize / 2,
              cellSize * 0.45,
              MUNCHER_FACING[s.dir] ?? 0,
              s.mouthAngle,
            );
            for (const g of s.chasers) {
              if (!g.eaten) drawChaser(ctx, g, cellSize);
            }
            drawLives(ctx, s.lives, cellSize);

            ctx.restore();
          }
        }
      }

      if (!s.gameOver) {
        rafRef.current = requestAnimationFrame(loop);
      }
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [setDirection]);

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%", background: BG_COLOR }}
    />
  );
}
