import {BALANCE} from '../game/balance.ts';

/** Balance numbers inside UI copy, so a retune of balance.ts never needs a text edit.
 * `{talents.industry.training|up}` reads that path of BALANCE (array indexes are path
 * segments too: `{buildings.market.benefits.2}`). Formats: none = the value as is,
 * pct = value × 100, up = (value − 1) × 100, down = (1 − value) × 100. The copy keeps
 * its own "%" and units. Plain placeholders without a dot (`{count}`) are left alone. */
const PLACEHOLDER = /\{([a-zA-Z]+(?:\.[a-zA-Z0-9]+)+)(?:\|(pct|up|down))?\}/g;
const FORMATS = {pct: (v: number) => v * 100, up: (v: number) => (v - 1) * 100, down: (v: number) => (1 - v) * 100};

export function balanceText(text: string): string {
 return text.replace(PLACEHOLDER, (_, path: string, format?: keyof typeof FORMATS) => {
  let value: unknown = BALANCE;
  for(const key of path.split('.')) value = value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  if(typeof value !== 'number') throw Error(`UI copy names a missing balance value: ${path}`);
  const shown = format ? FORMATS[format](value) : value;
  // Round away float noise (1.12 − 1 = 0.12000000000000011) without hiding real decimals such as 0.16.
  return String(Math.round(shown * 1000) / 1000);
 });
}
