// Vertex shader for intermediate FBO passes (no Y flip)
export const VERTEX_SHADER_FBO = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Vertex shader for final output (with Y flip for video coordinate system)
export const VERTEX_SHADER_OUTPUT = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  // Flip Y coordinate: WebGL has Y=0 at bottom, video has Y=0 at top
  v_texCoord = vec2(a_texCoord.x, 1.0 - a_texCoord.y);
}
`;

// Mask feather shader - smooths the mask edges with Gaussian sampling
export const MASK_FEATHER_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_mask;
uniform vec2 u_resolution;
uniform float u_featherRadius;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec2 texelSize = 1.0 / u_resolution;
  float result = 0.0;
  float weightSum = 0.0;
  
  float sigma = max(u_featherRadius / 2.0, 1.0);
  
  // 2D Gaussian sampling for mask feathering
  for (float y = -3.0; y <= 3.0; y += 1.0) {
    for (float x = -3.0; x <= 3.0; x += 1.0) {
      vec2 offset = vec2(x, y) * (u_featherRadius / 3.0);
      float dist2 = dot(offset, offset);
      float weight = exp(-dist2 / (2.0 * sigma * sigma));
      vec2 sampleCoord = v_texCoord + offset * texelSize;
      result += texture(u_mask, sampleCoord).r * weight;
      weightSum += weight;
    }
  }
  
  fragColor = vec4(vec3(result / weightSum), 1.0);
}
`;

// Color isolation shader - subject in color, background monochrome
export const COLOR_ISOLATION_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_original;
uniform sampler2D u_mask;  // Feathered subject mask

in vec2 v_texCoord;
out vec4 fragColor;

// Convert RGB to grayscale using luminance weights
float getLuminance(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

void main() {
  vec4 original = texture(u_original, v_texCoord);
  float mask = texture(u_mask, v_texCoord).r;
  
  // Subject stays in color (where mask is 1)
  float subjectAlpha = smoothstep(0.0, 1.0, mask);
  
  // Convert background to grayscale
  float luminance = getLuminance(original.rgb);
  vec3 grayscale = vec3(luminance);
  
  // Slight exposure drop for background (8%)
  float effectStrength = 1.0 - subjectAlpha;
  float exposureDrop = 1.0 - (effectStrength * 0.08);
  grayscale *= exposureDrop;
  
  // Mix: subject in color, background in grayscale
  vec3 result = mix(grayscale, original.rgb, subjectAlpha);
  
  fragColor = vec4(result, original.a);
}
`;

// Preview shader - show mask overlay on original (highlight the subject)
export const PREVIEW_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_original;
uniform sampler2D u_mask;
uniform vec3 u_overlayColor;
uniform float u_overlayOpacity;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  vec4 original = texture(u_original, v_texCoord);
  float mask = texture(u_mask, v_texCoord).r;
  
  // Highlight the subject (where mask is 1) with overlay color
  vec3 overlay = mix(original.rgb, u_overlayColor, mask * u_overlayOpacity);
  fragColor = vec4(overlay, original.a);
}
`;

// Passthrough shader - just render the video without any effects
export const PASSTHROUGH_SHADER = `#version 300 es
precision highp float;

uniform sampler2D u_texture;

in vec2 v_texCoord;
out vec4 fragColor;

void main() {
  fragColor = texture(u_texture, v_texCoord);
}
`;

