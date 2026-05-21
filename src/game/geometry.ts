export const DESIGN_WIDTH = 390;
export const DESIGN_HEIGHT = 844;

export interface Point {
  x: number;
  y: number;
}

export const PATH_POINTS: Point[] = [
  { x: 34, y: 104 },
  { x: 350, y: 104 },
  { x: 350, y: 246 },
  { x: 42, y: 246 },
  { x: 42, y: 362 },
  { x: 346, y: 362 },
];

export const BOARD = {
  x: 29,
  y: 426,
  columns: 4,
  rows: 4,
  cell: 76,
  gap: 8,
};

const segments = PATH_POINTS.slice(0, -1).map((point, index) => {
  const next = PATH_POINTS[index + 1]!;
  const length = Math.hypot(next.x - point.x, next.y - point.y);
  return { start: point, end: next, length };
});

export const PATH_LENGTH = segments.reduce((total, segment) => total + segment.length, 0);

export function getPathPosition(progress: number): Point {
  const targetDistance = Math.max(0, Math.min(1, progress)) * PATH_LENGTH;
  let walked = 0;

  for (const segment of segments) {
    if (walked + segment.length >= targetDistance) {
      const local = (targetDistance - walked) / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * local,
        y: segment.start.y + (segment.end.y - segment.start.y) * local,
      };
    }
    walked += segment.length;
  }

  return PATH_POINTS[PATH_POINTS.length - 1]!;
}

export function getBoardSlotCenter(index: number): Point {
  const col = index % BOARD.columns;
  const row = Math.floor(index / BOARD.columns);
  return {
    x: BOARD.x + col * (BOARD.cell + BOARD.gap) + BOARD.cell / 2,
    y: BOARD.y + row * (BOARD.cell + BOARD.gap) + BOARD.cell / 2,
  };
}

export function getBoardSlotAt(point: Point): number | null {
  const localX = point.x - BOARD.x;
  const localY = point.y - BOARD.y;
  const stride = BOARD.cell + BOARD.gap;
  const col = Math.floor(localX / stride);
  const row = Math.floor(localY / stride);
  const insideCellX = localX - col * stride <= BOARD.cell;
  const insideCellY = localY - row * stride <= BOARD.cell;

  if (col < 0 || col >= BOARD.columns || row < 0 || row >= BOARD.rows || !insideCellX || !insideCellY) {
    return null;
  }

  return row * BOARD.columns + col;
}
