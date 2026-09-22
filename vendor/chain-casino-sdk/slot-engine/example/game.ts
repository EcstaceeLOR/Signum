export const SYMBOLS = ['seven', 'bar', 'bell', 'grapes', 'orange', 'lemon', 'cherry'] as const;
export type Symbol = (typeof SYMBOLS)[number];
export type Stops = [number, number, number];

export const ROWS = 3;
export const PRIZE_DENOMINATOR = 10n;

export const REELS: Symbol[][] = [
  // prettier-ignore
  ['cherry', 'lemon', 'bar', 'orange', 'cherry', 'grapes', 'lemon', 'seven', 'cherry', 'orange', 'bell', 'lemon', 'cherry', 'grapes', 'orange', 'cherry', 'lemon', 'bar', 'cherry', 'orange', 'bell', 'grapes', 'lemon', 'cherry'],
  // prettier-ignore
  ['lemon', 'cherry', 'orange', 'bell', 'lemon', 'grapes', 'cherry', 'bar', 'orange', 'lemon', 'seven', 'cherry', 'grapes', 'orange', 'lemon', 'bell', 'cherry', 'orange', 'grapes', 'lemon', 'bar', 'cherry', 'orange', 'lemon'],
  // prettier-ignore
  ['orange', 'lemon', 'grapes', 'cherry', 'bell', 'lemon', 'orange', 'bar', 'lemon', 'cherry', 'grapes', 'orange', 'seven', 'lemon', 'bell', 'orange', 'grapes', 'lemon', 'cherry', 'orange', 'bar', 'lemon', 'grapes', 'orange'],
];

/** Row index per reel. */
export const LINES: number[][] = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];

/** Prizes in units of 1/10 of the wager; one wager covers every line. */
export const THREE_OF_A_KIND_UNITS: Record<Symbol, number> = {
  seven: 1000,
  bar: 400,
  bell: 150,
  grapes: 80,
  orange: 50,
  lemon: 30,
  cherry: 20,
};
export const CHERRY_PAIR_UNITS = 5;

export function visibleGrid(stops: Stops): Symbol[][] {
  return REELS.map((strip, reel) =>
    Array.from({ length: ROWS }, (_, row) => strip[(stops[reel] + row) % strip.length]),
  );
}

export function lineUnits(symbols: Symbol[]): number {
  const [first, second, third] = symbols;
  if (first === second && second === third) return THREE_OF_A_KIND_UNITS[first];
  if (first === 'cherry' && second === 'cherry') return CHERRY_PAIR_UNITS;
  return 0;
}

export function lineSymbols(grid: Symbol[][], line: number[]): Symbol[] {
  return line.map((row, reel) => grid[reel][row]);
}

export function winningLines(stops: Stops): number[] {
  const grid = visibleGrid(stops);
  return LINES.flatMap((line, index) => (lineUnits(lineSymbols(grid, line)) > 0 ? [index] : []));
}

export function prizeUnits(stops: Stops): number {
  const grid = visibleGrid(stops);
  return LINES.reduce((total, line) => total + lineUnits(lineSymbols(grid, line)), 0);
}

export function encodeSeed(stops: Stops): string {
  return stops.join('.');
}

export function decodeSeed(seed: string): Stops {
  const stops = seed.split('.').map(Number);
  if (stops.length !== 3 || stops.some((stop, reel) => !(stop >= 0 && stop < REELS[reel].length))) {
    throw new Error(`Malformed seed "${seed}"`);
  }
  return stops as Stops;
}
