// Double-buffered render targets for iterative GPU simulation. Each step reads
// from `read` and renders into `write`, then `swap()` makes the result current.

import { createFBO, type FBO } from "./gl-utils";

export interface PingPong {
  readonly read: FBO;
  readonly write: FBO;
  swap(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export function createPingPong(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): PingPong {
  let read = createFBO(gl, width, height);
  let write = createFBO(gl, width, height);

  const destroy = (fbo: FBO): void => {
    gl.deleteFramebuffer(fbo.framebuffer);
    gl.deleteTexture(fbo.texture);
  };

  return {
    get read() {
      return read;
    },
    get write() {
      return write;
    },
    swap() {
      const tmp = read;
      read = write;
      write = tmp;
    },
    resize(w: number, h: number) {
      destroy(read);
      destroy(write);
      read = createFBO(gl, w, h);
      write = createFBO(gl, w, h);
    },
    dispose() {
      destroy(read);
      destroy(write);
    },
  };
}
