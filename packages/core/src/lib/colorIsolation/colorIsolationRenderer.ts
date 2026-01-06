import type { MaskData } from '../../types';
import {
  VERTEX_SHADER_FBO,
  VERTEX_SHADER_OUTPUT,
  MASK_FEATHER_SHADER,
  COLOR_ISOLATION_SHADER,
  PASSTHROUGH_SHADER,
  PREVIEW_SHADER,
} from './shaders';

const FEATHER_RADIUS = 4;

export class ColorIsolationRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;

  // Programs
  private maskFeatherProgram: WebGLProgram | null = null;
  private colorIsolationProgram: WebGLProgram | null = null;
  private previewProgram: WebGLProgram | null = null;
  private passthroughProgram: WebGLProgram | null = null;

  // Buffers
  private quadBuffer: WebGLBuffer | null = null;

  // Textures
  private videoTexture: WebGLTexture | null = null;
  private maskTexture: WebGLTexture | null = null;
  private featheredMaskTexture: WebGLTexture | null = null;

  // Framebuffers
  private fbo: WebGLFramebuffer | null = null;

  private width = 0;
  private height = 0;
  private maskWidth = 0;
  private maskHeight = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    this.init();
  }

  private init(): void {
    const gl = this.gl;

    // Create programs
    this.maskFeatherProgram = this.createProgram(VERTEX_SHADER_FBO, MASK_FEATHER_SHADER);
    this.colorIsolationProgram = this.createProgram(VERTEX_SHADER_OUTPUT, COLOR_ISOLATION_SHADER);
    this.previewProgram = this.createProgram(VERTEX_SHADER_OUTPUT, PREVIEW_SHADER);
    this.passthroughProgram = this.createProgram(VERTEX_SHADER_OUTPUT, PASSTHROUGH_SHADER);

    // Create quad buffer (full-screen triangle strip)
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    // prettier-ignore
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      // position    // texCoord
      -1, -1,        0, 0,
       1, -1,        1, 0,
      -1,  1,        0, 1,
       1,  1,        1, 1,
    ]), gl.STATIC_DRAW);

    // Create textures
    this.videoTexture = this.createTexture();
    this.maskTexture = this.createTexture();
    this.featheredMaskTexture = this.createTexture();

    // Create framebuffer
    this.fbo = gl.createFramebuffer();
  }

  private createProgram(vertSrc: string, fragSrc: string): WebGLProgram {
    const gl = this.gl;

    const vert = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vert, vertSrc);
    gl.compileShader(vert);
    if (!gl.getShaderParameter(vert, gl.COMPILE_STATUS)) {
      throw new Error(`Vertex shader error: ${gl.getShaderInfoLog(vert)}`);
    }

    const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(frag, fragSrc);
    gl.compileShader(frag);
    if (!gl.getShaderParameter(frag, gl.COMPILE_STATUS)) {
      throw new Error(`Fragment shader error: ${gl.getShaderInfoLog(frag)}`);
    }

    const program = gl.createProgram()!;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link error: ${gl.getProgramInfoLog(program)}`);
    }

    gl.deleteShader(vert);
    gl.deleteShader(frag);

    return program;
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return tex;
  }

  private setupVertexAttribs(program: WebGLProgram): void {
    const gl = this.gl;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);

    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);

    const texLoc = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
  }

  private resizeIfNeeded(width: number, height: number): void {
    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;

    const gl = this.gl;

    // Resize feathered mask texture
    gl.bindTexture(gl.TEXTURE_2D, this.featheredMaskTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    gl.viewport(0, 0, width, height);
  }

  updateVideo(video: HTMLVideoElement): void {
    const gl = this.gl;

    this.resizeIfNeeded(video.videoWidth, video.videoHeight);

    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  }

  updateMask(mask: MaskData | null): void {
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);

    if (!mask) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));
      this.maskWidth = 0;
      this.maskHeight = 0;
      return;
    }

    // Convert boolean mask to 0/255
    const data = new Uint8Array(mask.data.length);
    for (let i = 0; i < mask.data.length; i++) {
      data[i] = mask.data[i] > 0 ? 255 : 0;
    }

    this.maskWidth = mask.width;
    this.maskHeight = mask.height;

    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      mask.width,
      mask.height,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      data,
    );
  }

  renderPreview(): void {
    const gl = this.gl;

    if (!this.previewProgram) return;

    // biome-ignore lint/correctness/useHookAtTopLevel: this is not a hook
    gl.useProgram(this.previewProgram);
    this.setupVertexAttribs(this.previewProgram);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.uniform1i(gl.getUniformLocation(this.previewProgram, 'u_original'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(gl.getUniformLocation(this.previewProgram, 'u_mask'), 1);

    gl.uniform3f(gl.getUniformLocation(this.previewProgram, 'u_overlayColor'), 0.13, 0.77, 0.37);
    gl.uniform1f(gl.getUniformLocation(this.previewProgram, 'u_overlayOpacity'), 0.4);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  render(): void {
    const gl = this.gl;

    if (!this.maskFeatherProgram || !this.colorIsolationProgram) return;

    // Pass 1: Feather the mask (mask -> featheredMask)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.featheredMaskTexture, 0);

    // biome-ignore lint/correctness/useHookAtTopLevel: this is not a hook
    gl.useProgram(this.maskFeatherProgram);
    this.setupVertexAttribs(this.maskFeatherProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture);
    gl.uniform1i(gl.getUniformLocation(this.maskFeatherProgram, 'u_mask'), 0);
    const maskW = this.maskWidth || this.width;
    const maskH = this.maskHeight || this.height;
    gl.uniform2f(gl.getUniformLocation(this.maskFeatherProgram, 'u_resolution'), maskW, maskH);
    gl.uniform1f(gl.getUniformLocation(this.maskFeatherProgram, 'u_featherRadius'), FEATHER_RADIUS);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // Pass 2: Color isolation composite (video + mask -> canvas)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // biome-ignore lint/correctness/useHookAtTopLevel: this is not a hook
    gl.useProgram(this.colorIsolationProgram);
    this.setupVertexAttribs(this.colorIsolationProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.uniform1i(gl.getUniformLocation(this.colorIsolationProgram, 'u_original'), 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.featheredMaskTexture);
    gl.uniform1i(gl.getUniformLocation(this.colorIsolationProgram, 'u_mask'), 1);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Render the video without any effects (passthrough)
   */
  renderPassthrough(): void {
    const gl = this.gl;

    if (!this.passthroughProgram) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // biome-ignore lint/correctness/useHookAtTopLevel: this is not a hook
    gl.useProgram(this.passthroughProgram);
    this.setupVertexAttribs(this.passthroughProgram);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.uniform1i(gl.getUniformLocation(this.passthroughProgram, 'u_texture'), 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  clear(): void {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose(): void {
    const gl = this.gl;

    gl.deleteProgram(this.maskFeatherProgram);
    gl.deleteProgram(this.colorIsolationProgram);
    gl.deleteProgram(this.previewProgram);
    gl.deleteProgram(this.passthroughProgram);

    gl.deleteBuffer(this.quadBuffer);

    gl.deleteTexture(this.videoTexture);
    gl.deleteTexture(this.maskTexture);
    gl.deleteTexture(this.featheredMaskTexture);

    gl.deleteFramebuffer(this.fbo);
  }
}

