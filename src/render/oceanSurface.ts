import * as THREE from 'three';

/** Optical ripples only. The existing flat sea mesh, depth and land mask stay
 * untouched. Integer longitude frequencies join exactly at repeated atlases. */
export const OCEAN_RIPPLE_CONTRAST=.025;
export const OCEAN_REFLECTION_STRENGTH=.075;

export function installOceanSurface(material:THREE.Material,nearView:{value:number}){
  const previous=material.onBeforeCompile,previousKey=material.customProgramCacheKey();
  material.onBeforeCompile=(shader,renderer)=>{
    previous.call(material,shader,renderer);
    shader.uniforms.uOceanNear=nearView;
    shader.vertexShader='varying vec2 vOceanUv; varying vec3 vOceanWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vOceanUv = uv;
vOceanWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader=`uniform float uOceanNear;
varying vec2 vOceanUv;
varying vec3 vOceanWorld;
float oceanHash(vec2 p) {
  vec3 h = fract(vec3(p.xyx) * 0.1031);
  h += dot(h, h.yzx + 33.33);
  return fract((h.x + h.y) * h.z);
}
// Periodic value noise: every octave wraps longitude at the same atlas seam.
// Derivative filtering fades fine grain to its mean before it becomes subpixel.
float oceanGrain(vec2 uv, vec2 cells) {
  vec2 p = uv * cells;
  vec2 cell = floor(p), f = fract(p);
  vec2 w = f * f * (3.0 - 2.0 * f);
  float a = oceanHash(vec2(mod(cell.x, cells.x), cell.y));
  float b = oceanHash(vec2(mod(cell.x + 1.0, cells.x), cell.y));
  float c = oceanHash(vec2(mod(cell.x, cells.x), cell.y + 1.0));
  float d = oceanHash(vec2(mod(cell.x + 1.0, cells.x), cell.y + 1.0));
  float grain = mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
  float footprint = max(length(dFdx(p)), length(dFdy(p)));
  return mix(grain, 0.5, smoothstep(0.55, 1.5, footprint));
}
// Fade subpixel waves instead of aliasing when zoomed out or on small screens.
float oceanWave(float phase) {
  float visibility = 1.0 - smoothstep(0.7, 2.8, fwidth(phase));
  return sin(phase) * visibility;
}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 oceanPhase = 6.28318530718 * vOceanUv;
float body = 0.45 * oceanGrain(vOceanUv, vec2(12.0, 6.0))
           + 0.35 * oceanGrain(vOceanUv, vec2(48.0, 24.0))
           + 0.20 * oceanGrain(vOceanUv, vec2(192.0, 96.0));
float grain = oceanGrain(vOceanUv, vec2(768.0, 384.0));
float warp = 6.0 * (body - 0.5);
float swell = oceanWave(dot(oceanPhase, vec2(72.0, 190.0)) + 0.7 * sin(oceanPhase.x * 9.0) + warp);
float crossSwell = oceanWave(dot(oceanPhase, vec2(-48.0, 127.0)) + 0.55 * sin(oceanPhase.y * 17.0) - warp);
float fineWave = oceanWave(dot(oceanPhase, vec2(360.0, 720.0)));
float ripple = 0.55 * swell + 0.3 * crossSwell + 0.15 * fineWave;
// A dark teal, softly mottled chart surface rather than regular bright stripes.
diffuseColor.rgb *= 1.0 + 0.34 * (body - 0.5) + 0.14 * (grain - 0.5) + ${OCEAN_RIPPLE_CONTRAST.toFixed(8)} * ripple;
// A gently broken sky/sun reflection appears only in the tilted close view.
// This is shading, never geometric displacement or an extra reflection pass.
vec3 waterNormal = normalize(vec3(swell * 0.10 + fineWave * 0.025, 1.0, crossSwell * 0.10));
vec3 waterView = normalize(cameraPosition - vOceanWorld);
vec3 waterLight = normalize(vec3(-0.35, 0.85, -0.40));
vec3 waterHalf = normalize(waterLight + waterView);
float glint = pow(max(dot(waterNormal, waterHalf), 0.0), 48.0);
float fresnel = pow(1.0 - max(dot(waterNormal, waterView), 0.0), 3.0);
diffuseColor.rgb += vec3(0.72, 0.85, 0.88) * ${OCEAN_REFLECTION_STRENGTH.toFixed(8)} * uOceanNear * (glint + 0.35 * fresnel);`);
  };
  material.customProgramCacheKey=()=>`${previousKey}:ocean-surface-v2`;
}
