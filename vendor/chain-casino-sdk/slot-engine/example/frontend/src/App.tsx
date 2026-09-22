import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits, type Hex, hexToBigInt, parseUnits } from 'viem';
import { computeMaxWager, SessionPhase } from '@chain/casino-sdk/guest';
import { compileConfiguration } from '../../../src/compile.ts';
import { parseDisplayMapping, pickDisplaySeed } from '../../../src/display.ts';
import { formatPrize, parseTierList } from '../../../src/tier-list.ts';
import {
  CHERRY_PAIR_UNITS,
  decodeSeed,
  PRIZE_DENOMINATOR,
  type Stops,
  SYMBOLS,
  THREE_OF_A_KIND_UNITS,
  winningLines,
} from '../../game.ts';
import baseTierList from '../../base.csv?raw';
import displayMappingFile from '../../display-mapping.json';
import { Reels } from './Reels.tsx';
import { useCasinoHost } from './useCasinoHost.ts';

const base = compileConfiguration(parseTierList(baseTierList), {
  prizeDenominator: PRIZE_DENOMINATOR,
});
const mapping = parseDisplayMapping(displayMappingFile, PRIZE_DENOMINATOR);
const topPrizeMultiplier = Number(base.stats.topPrizeUnits) / Number(PRIZE_DENOMINATOR);
const IDLE_STOPS: Stops = [0, 0, 0];
const REEL_STOP_MS = 450;

type Round = {
  sessionKey: string;
  wager: bigint;
  status: 'opening' | 'spinning' | 'landing' | 'settled';
  sessionId?: string;
  prizeUnits?: bigint;
  payout?: bigint;
  stops?: Stops;
};

const prizeLabel = (units: bigint) => `${formatPrize(units, PRIZE_DENOMINATOR)}x`;

/** The settled game state is the 4-byte prize; anything shorter is a session still in flight. */
function settledPrizeUnits(gameState: Hex | undefined): bigint | undefined {
  return gameState !== undefined && gameState.length === 10 ? hexToBigInt(gameState) : undefined;
}

function stopsFor(prizeUnits: bigint, randomness: Hex): Stops | undefined {
  const seed = pickDisplaySeed(mapping, prizeUnits, randomness);
  return seed === undefined ? undefined : decodeSeed(seed);
}

export function App() {
  const { hostApi, snapshot } = useCasinoHost();
  const [wagerInput, setWagerInput] = useState('1');
  const [round, setRound] = useState<Round | null>(null);
  const [landedReels, setLandedReels] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const hostApiRef = useRef(hostApi);
  hostApiRef.current = hostApi;

  const decimals = snapshot?.token.decimals ?? 18;
  const symbol = snapshot?.token.symbol ?? '';
  const balance =
    snapshot?.balances.smartVaultBalance === undefined
      ? undefined
      : BigInt(snapshot.balances.smartVaultBalance);

  useEffect(
    function settleFromSnapshot() {
      if (!round || round.status !== 'spinning' || !snapshot) return;
      const row = snapshot.sessions.items.find(item => item.sessionKey === round.sessionKey);
      if (!row) return;
      if (row.phase === SessionPhase.FORFEITED || row.phase === SessionPhase.CANCELLED) {
        setError('The round did not settle; the on-chain rules decide what happens to the wager.');
        setRound(null);
        setLandedReels(3);
        return;
      }
      const prizeUnits = settledPrizeUnits(row.raw.gameState);
      if (!(row.isSettled || row.phase === SessionPhase.SETTLED) || prizeUnits === undefined)
        return;
      setRound({
        ...round,
        status: 'landing',
        sessionId: row.sessionId,
        prizeUnits,
        payout:
          row.payout === undefined
            ? (round.wager * prizeUnits) / PRIZE_DENOMINATOR
            : BigInt(row.payout),
        stops: stopsFor(prizeUnits, row.raw.randomness ?? '0x'),
      });
    },
    [snapshot, round],
  );

  useEffect(
    function stopReelsThenReveal() {
      if (!round || round.status !== 'landing') return;
      const reelTimers = [1, 2, 3].map(count =>
        setTimeout(() => setLandedReels(count), count * REEL_STOP_MS),
      );
      const revealTimer = setTimeout(
        () => {
          setRound(current =>
            current?.sessionKey === round.sessionKey ? { ...current, status: 'settled' } : current,
          );
          if (round.sessionId) {
            void hostApiRef.current?.revealOutcome({ sessionId: round.sessionId }).catch(() => {});
          }
        },
        3 * REEL_STOP_MS + 200,
      );
      return () => [...reelTimers, revealTimer].forEach(clearTimeout);
    },
    [round],
  );

  const wager = useMemo(() => {
    try {
      const parsed = parseUnits(wagerInput.trim(), decimals);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [wagerInput, decimals]);

  const maxWager = useMemo(() => {
    const result = computeMaxWager(snapshot, { maxMultiplierX: topPrizeMultiplier });
    return result.kind === 'limit' ? result.maxWager : undefined;
  }, [snapshot]);

  const spin = useCallback(async () => {
    if (!hostApi || wager === null) return;
    setError(null);
    setLandedReels(0);
    const pendingKey = `pending:${Date.now()}`;
    setRound({ sessionKey: pendingKey, wager, status: 'opening' });
    try {
      const { sessionKey } = await hostApi.openSession({ wager: wager.toString(), gameData: '0x' });
      setRound(current =>
        current?.sessionKey === pendingKey
          ? { ...current, sessionKey, status: 'spinning' }
          : current,
      );
    } catch (cause) {
      setRound(null);
      setLandedReels(3);
      setError(cause instanceof Error ? cause.message : 'Failed to open the round.');
    }
  }, [hostApi, wager]);

  if (!hostApi || !snapshot) {
    return <div className="waiting">Connecting to host…</div>;
  }

  const walletReady = snapshot.wallet.status === 'ready';
  const inFlight = round !== null && round.status !== 'settled';
  const insufficientBalance = wager !== null && balance !== undefined && wager > balance;
  const aboveMaxWager = wager !== null && maxWager !== undefined && wager > maxWager;
  const canSpin =
    walletReady && !inFlight && wager !== null && !insufficientBalance && !aboveMaxWager;
  const reason = !walletReady
    ? 'Connect your wallet in the host app to play.'
    : error
      ? error
      : insufficientBalance
        ? 'Insufficient balance.'
        : aboveMaxWager && maxWager !== undefined
          ? `Max bet right now: ${formatUnits(maxWager, decimals)} ${symbol}.`
          : null;

  const stops = round?.stops ?? IDLE_STOPS;
  const settledLines = round?.status === 'settled' && round.stops ? winningLines(round.stops) : [];
  const history = snapshot.sessions.items
    .flatMap(item => {
      const units = settledPrizeUnits(item.raw.gameState);
      return item.gameAddress === snapshot.integration.gameAddress && units !== undefined
        ? [{ ...item, units }]
        : [];
    })
    .slice(0, 8);

  return (
    <div className="shell">
      <aside className="panel">
        <h1>Lucky Reels</h1>
        <label className="field">
          <span>Bet ({symbol})</span>
          <input
            value={wagerInput}
            onChange={event => setWagerInput(event.target.value)}
            inputMode="decimal"
            disabled={inFlight}
          />
        </label>
        <div className="meta">
          <span>Balance</span>
          <span>{balance === undefined ? '—' : formatUnits(balance, decimals)}</span>
        </div>
        <div className="meta">
          <span>Title RTP</span>
          <span>{(Number(base.stats.rtpWad) / 1e16).toFixed(2)}%</span>
        </div>
        <button className="spin" onClick={() => void spin()} disabled={!canSpin}>
          {inFlight ? 'Spinning…' : 'Spin'}
        </button>
        {reason && <p className="reason">{reason}</p>}
        <table className="paytable">
          <tbody>
            {SYMBOLS.map(name => (
              <tr key={name}>
                <td>3 × {name}</td>
                <td>{prizeLabel(BigInt(THREE_OF_A_KIND_UNITS[name]))}</td>
              </tr>
            ))}
            <tr>
              <td>cherry, cherry, any</td>
              <td>{prizeLabel(BigInt(CHERRY_PAIR_UNITS))}</td>
            </tr>
          </tbody>
        </table>
        <p className="lines">5 lines: three rows and both diagonals. One bet covers all of them.</p>
      </aside>
      <main className="stage">
        <Reels stops={stops} landedReels={landedReels} winningLines={settledLines} />
        <div className={`result${round?.status === 'settled' ? ' result--visible' : ''}`}>
          {round?.status === 'settled' && round.prizeUnits !== undefined && (
            <>
              <strong>
                {round.prizeUnits === 0n ? 'No win' : `${prizeLabel(round.prizeUnits)} win`}
              </strong>
              {round.payout !== undefined && round.payout > 0n && (
                <span>
                  +{formatUnits(round.payout, decimals)} {symbol}
                </span>
              )}
            </>
          )}
        </div>
        <ol className="history">
          {history.map(item => (
            <li key={item.sessionKey}>
              <span>#{item.sessionId}</span>
              <span>{item.units === 0n ? 'miss' : prizeLabel(item.units)}</span>
              <span>
                {item.payout === undefined ? '' : formatUnits(BigInt(item.payout), decimals)}
              </span>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
