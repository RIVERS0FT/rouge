import type {ConstructionKind,Province} from '../game/types.ts';

export const BUILDING_ART_KINDS=['house','market','barracks','fortress'] as const;
export type BuildingArtKind=typeof BUILDING_ART_KINDS[number];
export const BUILDING_ART_SCALE=0.5;
export const BUILDING_RENDER_LIMIT=188;

// TOWNS preserves the simulator's deterministic order of valid footprints.
// A built facility replaces the first existing placeholder, not a new obstacle.
export function townModelForSlot(slot:number,construction:Province['construction']):BuildingArtKind {
 return slot===0&&construction?construction.kind:'house';
}
export function constructionVisualChanged(previous:ConstructionKind|undefined,next:Province['construction']){
 return previous!==next?.kind;
}
