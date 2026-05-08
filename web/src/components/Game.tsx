import { useRef, useEffect, useCallback } from "react";

interface GameProps {
  onScore: (score: number) => void;
  onGameOver: () => void;
  paused?: boolean;
}

// ---------------------------------------------------------------------------
// Maze definition: 0 = wall, 1 = dot, 2 = power pellet, 3 = empty path
// 21 columns x 23 rows (classic-ish layout)
// ---------------------------------------------------------------------------
const MAZE_TEMPLATE: number[][] = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,0,0,0,1,0,1,0,0,0,0,1,0,0,1,0],
  [0,2,0,0,1,0,0,0,0,1,0,1,0,0,0,0,1,0,0,2,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,0,1,0],
  [0,1,1,1,1,0,1,1,1,0,0,0,1,1,1,0,1,1,1,1,0],
  [0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0],
  [0,0,0,0,1,0,1,1,1,1,1,1,1,1,1,0,1,0,0,0,0],
  [0,0,0,0,1,0,1,0,0,3,3,3,0,0,1,0,1,0,0,0,0],
  [1,1,1,1,1,1,1,0,3,3,3,3,3,0,1,1,1,1,1,1,1],
  [0,0,0,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,0,0,0],
  [0,0,0,0,1,0,1,1,1,1,1,1,1,1,1,0,1,0,0,0,0],
  [0,0,0,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,0,1,1,1,1,1,1,1,1,1,0],
  [0,1,0,0,1,0,0,0,0,1,0,1,0,0,0,0,1,0,0,1,0],
  [0,2,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,2,0],
  [0,0,1,0,1,0,1,0,0,0,0,0,0,0,1,0,1,0,1,0,0],
  [0,1,1,1,1,0,1,1,1,0,0,0,1,1,1,0,1,1,1,1,0],
  [0,1,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,1,0],
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

interface Ghost {
  x: number;
  y: number;
  dir: number;
  color: string;
  scared: boolean;
  eaten: boolean;
  moveTimer: number;
}

interface PacState {
  // Pac-Man position (grid coords, fractional during movement)
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
  ghosts: Ghost[];
  powerTimer: number;
  ghostsEatenThisPower: number;
  moveTimer: number;
  gameOver: boolean;

  // Speed (cells per second)
  pacSpeed: number;
  ghostSpeed: number;
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

function createGhosts(): Ghost[] {
  return [
    { x: 9, y: 9, dir: DIR_UP, color: "#ff0000", scared: false, eaten: false, moveTimer: 0 },
    { x: 10, y: 9, dir: DIR_UP, color: "#ffb8ff", scared: false, eaten: false, moveTimer: 0 },
    { x: 11, y: 9, dir: DIR_UP, color: "#00ffff", scared: false, eaten: false, moveTimer: 0 },
    { x: 10, y: 10, dir: DIR_UP, color: "#ffb852", scared: false, eaten: false, moveTimer: 0 },
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
    ghosts: createGhosts(),
    powerTimer: 0,
    ghostsEatenThisPower: 0,
    moveTimer: 0,
    gameOver: false,
    pacSpeed: 6,
    ghostSpeed: 4.5,
  };
}

function resetPositions(s: PacState) {
  s.px = 10;
  s.py = 16;
  s.dir = DIR_LEFT;
  s.nextDir = DIR_LEFT;
  s.ghosts = createGhosts();
  s.powerTimer = 0;
  s.ghostsEatenThisPower = 0;
  s.moveTimer = 0;
}

function nextLevel(s: PacState) {
  s.level++;
  s.maze = cloneMaze();
  s.totalDots = countDots(s.maze);
  s.dotsEaten = 0;
  s.ghostSpeed = Math.min(8, 4.5 + s.level * 0.5);
  s.pacSpeed = Math.min(9, 6 + s.level * 0.3);
  resetPositions(s);
}

// ---------------------------------------------------------------------------
// DRAWING
// ---------------------------------------------------------------------------
const WALL_COLOR = "#2244cc";
const DOT_COLOR = "#ffcc88";
const PELLET_COLOR = "#ffcc88";
const BG_COLOR = "#000000";
const PAC_COLOR = "#ffff00";
const SCARED_COLOR = "#2222ff";

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
        ctx.fillStyle = "#1a1a66";
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

function drawPacMan(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cellSize: number,
  dir: number,
  mouthAngle: number,
) {
  const cx = x * cellSize + cellSize / 2;
  const cy = y * cellSize + cellSize / 2;
  const radius = cellSize * 0.45;

  // Direction angle
  const angles = [Math.PI * 1.5, Math.PI * 0.5, Math.PI, 0]; // up, down, left, right
  const baseAngle = angles[dir] ?? 0;

  ctx.fillStyle = PAC_COLOR;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, radius, baseAngle + mouthAngle, baseAngle + Math.PI * 2 - mouthAngle);
  ctx.closePath();
  ctx.fill();
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  ghost: Ghost,
  cellSize: number,
) {
  const cx = ghost.x * cellSize + cellSize / 2;
  const cy = ghost.y * cellSize + cellSize / 2;
  const r = cellSize * 0.45;

  const color = ghost.scared ? SCARED_COLOR : ghost.color;
  ctx.fillStyle = color;

  // Body: rounded top + wavy bottom
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r, Math.PI, 0);
  // Right side down
  ctx.lineTo(cx + r, cy + r * 0.7);
  // Wavy bottom
  const waves = 3;
  const waveW = (r * 2) / waves;
  for (let i = 0; i < waves; i++) {
    const wx = cx + r - i * waveW;
    ctx.quadraticCurveTo(
      wx - waveW * 0.25, cy + r * 1.1,
      wx - waveW * 0.5, cy + r * 0.7,
    );
    ctx.quadraticCurveTo(
      wx - waveW * 0.75, cy + r * 0.35,
      wx - waveW, cy + r * 0.7,
    );
  }
  ctx.closePath();
  ctx.fill();

  // Eyes
  if (ghost.scared) {
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
    const pdx = DX[ghost.dir]! * r * 0.08;
    const pdy = DY[ghost.dir]! * r * 0.08;
    ctx.fillStyle = "#00f";
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
    const r = cellSize * 0.35;
    ctx.fillStyle = PAC_COLOR;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, 0.3, Math.PI * 2 - 0.3);
    ctx.closePath();
    ctx.fill();
  }
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
      for (const g of s.ghosts) g.scared = false;
      s.ghostsEatenThisPower = 0;
    }
  }

  // Move Pac-Man
  s.moveTimer += dt * s.pacSpeed;
  if (s.moveTimer >= 1) {
    s.moveTimer = 0;

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
      s.ghostsEatenThisPower = 0;
      for (const g of s.ghosts) {
        if (!g.eaten) g.scared = true;
      }
    }

    // Level complete
    if (s.dotsEaten >= s.totalDots) {
      nextLevel(s);
      return;
    }
  }

  // Move ghosts
  for (const g of s.ghosts) {
    g.moveTimer += dt * s.ghostSpeed;
    if (g.moveTimer < 1) continue;
    g.moveTimer = 0;

    // Decide direction: bias toward pac-man with some randomness
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
        // Chase: pick direction that reduces distance to pac-man
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

    // Collision with pac-man
    if (g.x === s.px && g.y === s.py) {
      if (g.scared) {
        g.eaten = true;
        g.scared = false;
        g.x = 10;
        g.y = 9;
        g.moveTimer = 0;
        s.ghostsEatenThisPower++;
        s.score += 200 * Math.pow(2, s.ghostsEatenThisPower - 1);
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
    for (const g of s.ghosts) {
      if (g.eaten) {
        g.eaten = false;
      }
    }
  }

  // Also check collision after pac-man moves (ghost may be on same cell)
  for (const g of s.ghosts) {
    if (g.x === s.px && g.y === s.py && !g.eaten) {
      if (g.scared) {
        g.eaten = true;
        g.scared = false;
        g.x = 10;
        g.y = 9;
        g.moveTimer = 0;
        s.ghostsEatenThisPower++;
        s.score += 200 * Math.pow(2, s.ghostsEatenThisPower - 1);
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

  onScoreRef.current = onScore;
  onGameOverRef.current = onGameOver;
  pausedRef.current = paused;

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
      updateState(s, dt);
      onScoreRef.current(s.score);

      if (s.gameOver && !gameOverFiredRef.current) {
        gameOverFiredRef.current = true;
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
          canvas.width = w * dpr;
          canvas.height = h * dpr;
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;

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
            drawPacMan(ctx, s.px, s.py, cellSize, s.dir, s.mouthAngle);
            for (const g of s.ghosts) {
              if (!g.eaten) drawGhost(ctx, g, cellSize);
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
