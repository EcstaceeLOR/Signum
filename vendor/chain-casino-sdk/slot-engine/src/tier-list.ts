export type Tier = { prize: string; weight: bigint };

export type Rational = { numerator: bigint; denominator: bigint };

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const FRACTION_PATTERN = /^\d+\/\d+$/;

export function greatestCommonDivisor(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** Accepts a plain decimal (`72.5`) or a fraction (`1/3`), the two forms `formatPrize` writes. */
export function parsePrize(value: string): Rational {
  let numerator: bigint;
  let denominator: bigint;
  if (FRACTION_PATTERN.test(value)) {
    [numerator, denominator] = value.split('/').map(BigInt) as [bigint, bigint];
    if (denominator === 0n) throw new Error(`Prize "${value}" divides by zero`);
  } else if (DECIMAL_PATTERN.test(value)) {
    const [whole, fraction = ''] = value.split('.');
    denominator = 10n ** BigInt(fraction.length);
    numerator = BigInt(whole + fraction);
  } else {
    throw new Error(`Prize "${value}" is not a non-negative decimal or fraction`);
  }
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function formatPrize(prizeUnits: bigint, prizeDenominator: bigint): string {
  const whole = prizeUnits / prizeDenominator;
  let remainder = prizeUnits % prizeDenominator;
  if (remainder === 0n) return whole.toString();
  let digits = '';
  while (remainder !== 0n && digits.length < 18) {
    remainder *= 10n;
    digits += (remainder / prizeDenominator).toString();
    remainder %= prizeDenominator;
  }
  if (remainder === 0n) return `${whole}.${digits}`;
  const divisor = greatestCommonDivisor(prizeUnits, prizeDenominator);
  return `${prizeUnits / divisor}/${prizeDenominator / divisor}`;
}

/** Parses `prize,weight` lines. Blank lines, `#` comments and a `prize,weight` header are skipped. */
export function parseTierList(source: string): Tier[] {
  const tiers: Tier[] = [];
  source.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#') || line.toLowerCase() === 'prize,weight') return;
    const [prize, weight, ...rest] = line.split(',').map(part => part.trim());
    if (prize === undefined || weight === undefined || rest.length > 0 || !/^\d+$/.test(weight)) {
      throw new Error(`Line ${index + 1}: expected "prize,weight", got "${rawLine}"`);
    }
    tiers.push({ prize, weight: BigInt(weight) });
  });
  return tiers;
}

export function formatTierList(tiers: Tier[]): string {
  return ['prize,weight', ...tiers.map(tier => `${tier.prize},${tier.weight}`)].join('\n') + '\n';
}
