// The same instanced material paints these details on the original fabric.
// Coordinates are the mesh's undeformed local XYZ, so paint follows the skin
// and does not produce thickness, cast shadows or need its own draw.
export const infantryFabricShader = `
varying vec3 rougePigment;
varying float rougeEmission;
varying vec3 rougeFabricPoint;
varying vec3 rougeArmbandColor;
varying float rougeFabricKind;
float rougeInside(float signedDistance, float pixelWidth) {
  float aa = max(pixelWidth * 0.75, 0.001);
  return 1.0 - smoothstep(-aa, aa, signedDistance);
}
vec3 rougeFabricPigment() {
  vec3 p = rougeFabricPoint;
  // Evaluate screen derivatives before the material branch so neighboring
  // pixels may differ safely along the shared borders with other surfaces.
  vec3 w = fwidth(p);
  if (rougeFabricKind > 1.5) {
    float band = rougeInside(max(-0.185 - p.y, p.y + 0.087), w.y);
    float stripe = rougeInside(max(-0.153 - p.y, p.y + 0.116), w.y);
    return mix(rougePigment, mix(rougeArmbandColor, vec3(0.76, 0.64, 0.46), stripe), band);
  }
  if (rougeFabricKind > 0.5) {
    float crossDistance = min(abs(p.y - 0.408 - p.x * 1.07), abs(p.y - 0.408 + p.x * 1.07));
    float crossLimit = max(max(0.175 - p.y, p.y - 0.637), 0.043 - p.z);
    float width = max(w.y + 1.07 * w.x, w.z);
    float crossOuter = rougeInside(max(crossDistance - 0.047, crossLimit), width);
    float crossInner = rougeInside(max(crossDistance - 0.041, crossLimit), width);
    vec3 canvas = mix(vec3(0.37, 0.27, 0.15), vec3(0.68, 0.53, 0.36), crossInner);
    return mix(rougePigment, canvas, crossOuter);
  }
  return rougePigment;
}
`;
