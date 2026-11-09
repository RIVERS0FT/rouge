/** Cosmetic only: never determines ownership, spawn position or combat rules. */
export const FLAG_PRESETS=['cn','fr','de','it','jp','gb','us','ch'] as const;
export const FLAG_PATTERNS=['solid','horizontal','vertical','cross'] as const;
export type Flag = {type:'preset';id:typeof FLAG_PRESETS[number]} | {type:'custom';pattern:typeof FLAG_PATTERNS[number];colors:[string,string,string]};
export function validFlag(value:unknown):value is Flag {
 if(!value||typeof value!=='object')return false;
 const f=value as Record<string,unknown>;
 if(f.type==='preset')return Object.keys(f).length===2&&FLAG_PRESETS.includes(f.id as typeof FLAG_PRESETS[number]);
 return f.type==='custom'&&Object.keys(f).length===3&&FLAG_PATTERNS.includes(f.pattern as typeof FLAG_PATTERNS[number])&&Array.isArray(f.colors)&&f.colors.length===3&&f.colors.every(c=>typeof c==='string'&&/^#[0-9a-fA-F]{6}$/.test(c));
}
