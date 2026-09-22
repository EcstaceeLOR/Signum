import { LINES, REELS, type Stops, type Symbol, visibleGrid } from '../../game.ts';

const GLYPHS: Record<Symbol, string> = {
  seven: '7',
  bar: 'BAR',
  bell: '🔔',
  grapes: '🍇',
  orange: '🍊',
  lemon: '🍋',
  cherry: '🍒',
};

type ReelsProps = { stops: Stops; landedReels: number; winningLines: number[] };

export function Reels({ stops, landedReels, winningLines }: ReelsProps) {
  const grid = visibleGrid(stops);
  const winningCells = new Set(
    winningLines.flatMap(line => LINES[line].map((row, reel) => `${reel}:${row}`)),
  );
  return (
    <div className="reels">
      {REELS.map((strip, reel) => (
        <div key={reel} className={`reel${landedReels > reel ? '' : ' reel--spinning'}`}>
          {landedReels > reel ? (
            grid[reel].map((symbol, row) => (
              <Cell key={row} symbol={symbol} winning={winningCells.has(`${reel}:${row}`)} />
            ))
          ) : (
            <div className="reel__track">
              {[...strip, ...strip].map((symbol, index) => (
                <Cell key={index} symbol={symbol} winning={false} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Cell({ symbol, winning }: { symbol: Symbol; winning: boolean }) {
  return (
    <div className={`cell cell--${symbol}${winning ? ' cell--win' : ''}`}>{GLYPHS[symbol]}</div>
  );
}
