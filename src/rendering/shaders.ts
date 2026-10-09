// Pixi v8 supplies the filter frame and backing-texture dimensions.
// Keep normalized picture UVs separate from pooled filter texture UVs.
export const FILTER_VERTEX = `
precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;
out vec2 vPictureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
void main() {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  gl_Position = vec4(position, 0.0, 1.0);
  vTextureCoord = aPosition * uOutputFrame.zw * uInputSize.zw;
  vPictureCoord = aPosition;
}`;

export const BLOOM_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
out vec4 finalColor;
void main() {
  vec3 color = texture(uTexture, vTextureCoord).rgb;
  float brightness = max(color.r, max(color.g, color.b));
  // Only luminous areas bloom. Midtones and dark sleeve artwork stay intact.
  float threshold = smoothstep(0.58, 0.94, brightness);
  finalColor = vec4(color * threshold, 1.0);
}`;

export const CRT_FRAGMENT = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vPictureCoord;
uniform sampler2D uTexture;
uniform sampler2D uBloom;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uInputClamp;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCurvature;
uniform float uScanlines;
uniform float uGlow;
uniform float uNoise;
uniform float uAberration;
uniform float uGlitch;
uniform float uProfile;
out vec4 finalColor;

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

vec3 picture(vec2 uv) {
  vec2 coord = uv * uOutputFrame.zw * uInputSize.zw;
  return texture(uTexture, clamp(coord, uInputClamp.xy, uInputClamp.zw)).rgb;
}

void main() {
  vec2 p = vPictureCoord * 2.0 - 1.0;
  vec2 bend = p * (1.0 + uCurvature * 0.17 * p.yx * p.yx);
  vec2 uv = bend * 0.5 + 0.5;
  // A short, localized sync disturbance; driven by the CPU's rare event clock.
  float band = exp(-pow((uv.y - fract(uTime * 0.73)) * 34.0, 2.0));
  uv.x += uGlitch * band * sin(uv.y * 220.0 + uTime * 31.0) * 0.018;
  uv.y += uGlitch * sin(uTime * 47.0) * 0.0014;

  float edge = pow(clamp(length(p) * 0.71, 0.0, 1.0), 2.6);
  vec2 shift = vec2((0.25 + edge * 2.5) * uAberration / uResolution.x, 0.0);
  vec3 color = picture(uv);
  color.r = picture(uv + shift).r;
  color.b = picture(uv - shift).b;
  vec3 glow = texture(uBloom, clamp(uv, 0.0, 1.0)).rgb;
  color += glow * uGlow * vec3(1.08, 0.95, 0.82);

  // At least three internal pixels per scanline to limit undersampling/moiré.
  float lines = min(uv.y * min(420.0, uResolution.y / 3.0), 10000.0);
  float scan = 0.5 + 0.5 * cos(lines * 6.2831853);
  color *= 1.0 - uScanlines * (0.35 + 0.65 * scan);
  float grain = hash(vec3(floor(vPictureCoord * uResolution), floor(uTime * 60.0)));
  color += (grain - 0.5) * (uNoise * 0.1 + uGlitch * 0.22);
  color *= 1.0 + uGlitch * 0.025 * sin(uTime * 39.0);
  // Gentle glass shading and edge falloff; no physical enclosure.
  color *= 1.0 - 0.25 * pow(clamp(length(p) * 0.65, 0.0, 1.0), 3.0);
  color += vec3(0.008, 0.008, 0.006) * (1.0 - smoothstep(0.0, 1.0, uv.y));

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  if (uProfile > 0.5 && uProfile < 1.5) color = luma * vec3(0.64, 1.0, 0.72);
  else if (uProfile > 1.5 && uProfile < 2.5) color = luma * vec3(1.0, 0.73, 0.38);
  else if (uProfile > 2.5) color = vec3(luma);

  vec2 bounds = abs(bend);
  vec2 q = bounds - vec2(0.96);
  float roundedDistance = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;
  float mask = 1.0 - smoothstep(-0.008, 0.004, roundedDistance);
  finalColor = vec4(max(color, 0.0) * mask, 1.0);
}`;
