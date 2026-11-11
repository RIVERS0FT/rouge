import * as THREE from 'three';

/** Optical ripples only. The existing flat sea mesh, depth and land mask stay
 * untouched. Integer longitude frequencies join exactly at repeated atlases. */
export const OCEAN_RIPPLE_CONTRAST=.055;
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
// Fade subpixel waves instead of aliasing when zoomed out or on small screens.
float oceanWave(float phase) {
  float visibility = 1.0 - smoothstep(0.7, 2.8, fwidth(phase));
  return sin(phase) * visibility;
}
`+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
vec2 oceanPhase = 6.28318530718 * vOceanUv;
float swell = oceanWave(dot(oceanPhase, vec2(72.0, 190.0)) + 0.7 * sin(oceanPhase.x * 9.0));
float crossSwell = oceanWave(dot(oceanPhase, vec2(-48.0, 127.0)) + 0.55 * sin(oceanPhase.y * 17.0));
float fineWave = oceanWave(dot(oceanPhase, vec2(360.0, 720.0)));
float ripple = 0.55 * swell + 0.3 * crossSwell + 0.15 * fineWave;
diffuseColor.rgb *= 1.0 + ${OCEAN_RIPPLE_CONTRAST.toFixed(8)} * ripple;
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
  material.customProgramCacheKey=()=>`${previousKey}:ocean-surface-v1`;
}
