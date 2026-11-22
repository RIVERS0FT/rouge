import {Icon} from './icons.tsx';

/** A whole number in [min, max], given as the player's typed draft. */
export const validCount = (value: string, min: number, max: number) =>
 /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;

/** A number field between −/+ buttons, shared by campaign deployment and the LAN room.
 * Typing stays possible (the map holds hundreds of countries); the buttons step from the
 * typed count clamped to the range, and restart at the minimum from any other draft. */
export function NumberStepper({id, testId, value, min, max, disabled = false, describedBy, fewerLabel, moreLabel, onChange}: {
 id: string; testId: string; value: string; min: number; max: number; disabled?: boolean; describedBy: string;
 fewerLabel: string; moreLabel: string; onChange: (value: string) => void;
}) {
 const typed = /^\d+$/.test(value) ? Number(value) : null;
 const step = (delta: number) => onChange(String(typed === null ? min : Math.min(max, Math.max(min, typed + delta))));
 return <div className="number-stepper">
  <button type="button" aria-label={fewerLabel} aria-controls={id} disabled={disabled || typed !== null && typed <= min} onClick={() => step(-1)}><Icon name="minus" size={16}/></button>
  <input id={id} data-testid={testId} type="number" inputMode="numeric" min={min} max={max} step={1} placeholder={`${min}–${max}`} value={value} disabled={disabled}
   aria-invalid={!validCount(value, min, max)} aria-describedby={describedBy} onChange={event => onChange(event.target.value)}/>
  <button type="button" aria-label={moreLabel} aria-controls={id} disabled={disabled || typed !== null && typed >= max} onClick={() => step(1)}><Icon name="plus" size={16}/></button>
 </div>;
}
