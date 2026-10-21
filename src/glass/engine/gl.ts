/**
 * WebGL2 的薄封装：着色器编译（支持 KHR_parallel_shader_compile 异步编译）与渲染目标管理。
 */

export type UniformMap<Name extends string> = Readonly<Record<Name, WebGLUniformLocation | null>>;

export interface Program<Name extends string> {
  readonly program: WebGLProgram;
  readonly uniforms: UniformMap<Name>;
}

interface PendingProgram<Name extends string> {
  readonly program: WebGLProgram;
  readonly shaders: readonly WebGLShader[];
  readonly uniformNames: readonly Name[];
}

export interface RenderTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

/** 轮询并行编译状态的间隔（ms） */
const COMPILE_POLL_MS = 16;

export function compileShader(
  gl: WebGL2RenderingContext,
  type: GLenum,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (shader === null) throw new Error('无法创建着色器');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

/** 只提交编译与链接，不读取状态（读取状态会阻塞到编译完成） */
export function startProgram<Name extends string>(
  gl: WebGL2RenderingContext,
  vertex: WebGLShader,
  fragmentSource: string,
  uniformNames: readonly Name[],
): PendingProgram<Name> {
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return { program, shaders: [fragment], uniformNames };
}

function shaderLogs(gl: WebGL2RenderingContext, program: WebGLProgram): string {
  const shaders = gl.getAttachedShaders(program) ?? [];
  return [gl.getProgramInfoLog(program), ...shaders.map((shader) => gl.getShaderInfoLog(shader))]
    .filter((log): log is string => log !== null && log.length > 0)
    .join('\n');
}

export function finishProgram<Name extends string>(
  gl: WebGL2RenderingContext,
  pending: PendingProgram<Name>,
): Program<Name> {
  if (gl.getProgramParameter(pending.program, gl.LINK_STATUS) !== true) {
    throw new Error(`着色器链接失败：${shaderLogs(gl, pending.program)}`);
  }
  for (const shader of pending.shaders) gl.deleteShader(shader);
  const uniforms = Object.fromEntries(
    pending.uniformNames.map((name) => [name, gl.getUniformLocation(pending.program, name)]),
  ) as Record<Name, WebGLUniformLocation | null>;
  return { program: pending.program, uniforms };
}

/** 等待一组程序编译完成：有并行编译扩展时让出主线程，否则立即返回 */
export async function waitForPrograms(
  gl: WebGL2RenderingContext,
  programs: readonly WebGLProgram[],
): Promise<void> {
  const parallel = gl.getExtension('KHR_parallel_shader_compile');
  if (parallel === null) return;
  const done = (): boolean =>
    programs.every(
      (program) =>
        gl.isContextLost() ||
        gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR) === true,
    );
  while (!done()) {
    await new Promise((resolve) => setTimeout(resolve, COMPILE_POLL_MS));
  }
}

export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): RenderTarget {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, width, height };
}

export function deleteTarget(gl: WebGL2RenderingContext, target: RenderTarget): void {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

/** 尺寸不符时重建；尺寸相同则原样返回 */
export function ensureTarget(
  gl: WebGL2RenderingContext,
  target: RenderTarget | undefined,
  width: number,
  height: number,
): RenderTarget {
  if (target?.width === width && target.height === height) return target;
  if (target !== undefined) deleteTarget(gl, target);
  return createTarget(gl, width, height);
}

/** 绑定渲染目标（null = 默认帧缓冲）并设置视口 */
export function bindTarget(
  gl: WebGL2RenderingContext,
  target: RenderTarget | null,
  width: number,
  height: number,
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target?.framebuffer ?? null);
  gl.viewport(0, 0, width, height);
}

export function bindTexture(gl: WebGL2RenderingContext, texture: WebGLTexture): void {
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

/** 浏览器出于隐私屏蔽真实名称时 RENDERER 返回的占位值（Chrome、Safari） */
const MASKED_RENDERER = /^WebKit WebGL$/;
/** 软件光栅化：GPU 被驱动列入黑名单或没有 GPU 时的回退实现，逐帧折射会占满 CPU */
const SOFTWARE_RENDERER =
  /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render|Basic Render Driver/i;

/**
 * 渲染器名称。先读 RENDERER（Firefox 直接返回净化后的真实名称，读取调试扩展会触发弃用警告），
 * 被屏蔽时再读 WEBGL_debug_renderer_info。
 */
export function rendererName(gl: WebGL2RenderingContext): string {
  const basic = String(gl.getParameter(gl.RENDERER));
  if (!MASKED_RENDERER.test(basic)) return basic;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info === null ? basic : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
}

export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE_RENDERER.test(renderer);
}
