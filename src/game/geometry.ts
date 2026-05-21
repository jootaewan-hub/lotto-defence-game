export const DESIGN_WIDTH = 390;
export const DESIGN_HEIGHT = 844;

export interface Point {
  x: number;
  y: number;
}

export const PATH_POINTS: Point[] = [
  { x: 54, y: 98 },
  { x: 336, y: 98 },
  { x: 336, y: 380 },
  { x: 54, y: 380 },
  { x: 54, y: 98 },
];

export const TOWER_RADIUS = 18;

export const TOWER_SPAWN = {
  x: 195,
  y: 239,
};

export const TOWER_FIELD = {
  x: 86,
  y: 130,
  width: 218,
  height: 218,
};

const segments = PATH_POINTS.slice(0, -1).map((point, index) => {
  const next = PATH_POINTS[index + 1]!;
  const length = Math.hypot(next.x - point.x, next.y - point.y);
  return { start: point, end: next, length };
});

export const PATH_LENGTH = segments.reduce((total, segment) => total + segment.length, 0);

export function getPathPosition(progress: number): Point {
  const loopedProgress = ((progress % 1) + 1) % 1;
  const targetDistance = loopedProgress * PATH_LENGTH;
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

export function getSpawnPosition(index: number): Point {
  if (index === 0) {
    return TOWER_SPAWN;
  }

  const angle = index * 2.399963;
  const radius = 8 + Math.sqrt(index) * 8;
  return clampTowerPosition({
    x: TOWER_SPAWN.x + Math.cos(angle) * radius,
    y: TOWER_SPAWN.y + Math.sin(angle) * radius,
  });
}

export function clampTowerPosition(point: Point): Point {
  return {
    x: Math.max(TOWER_FIELD.x + TOWER_RADIUS, Math.min(TOWER_FIELD.x + TOWER_FIELD.width - TOWER_RADIUS, point.x)),
    y: Math.max(TOWER_FIELD.y + TOWER_RADIUS, Math.min(TOWER_FIELD.y + TOWER_FIELD.height - TOWER_RADIUS, point.y)),
  };
}
