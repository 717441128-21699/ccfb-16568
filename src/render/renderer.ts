/**
 * 场景渲染器：持有 WebGL2 程序与静态网格，每帧从 Simulator 状态绘制
 * 水面、陆地、码头、航标、本船、拖轮与交通船。
 */
import { createGL, createProgram, createMesh, type GLProgram, type Mesh } from './gl';
import { GLOW_FS, GLOW_VS, SCENE_FS, SCENE_VS, WATER_FS, WATER_VS } from './shaders';
import { mat4LookAt, mat4Model, mat4Perspective, type Mat4, type Vec3 } from './mat4';
import { boxMesh, buoyPoleMesh, buoyTopMesh, hullMesh, prismMesh, waterMesh } from './meshbuilder';
import type { PortDef } from '../core/ports';
import type { ShipParams } from '../core/ships';
import type { Simulator } from '../core/engine';
import type { TrafficShip } from '../core/types';
import { rad2deg } from '../core/units';

export type CameraMode = 'chase' | 'top' | 'bridge' | 'orbit';

interface CameraState {
  mode: CameraMode;
  orbitAngle: number;
  orbitDist: number;
  height: number;
}

interface RenderObject {
  mesh: Mesh;
  model: Mat4;
  color: [number, number, number];
  alpha?: number;
  glow?: boolean;
}

export class SceneRenderer {
  private gl: WebGL2RenderingContext;
  private sceneProg: GLProgram;
  private waterProg: GLProgram;
  private glowProg: GLProgram;
  private water: Mesh;
  private port: PortDef;
  private ship: ShipParams;
  private hull: Mesh;
  private deckhouse: Mesh;
  private funnel: Mesh;
  private tugHull: Mesh;
  private buoyPole: Mesh;
  private buoyTop: Mesh;
  private landMeshes: { mesh: Mesh; color: [number, number, number] }[] = [];
  private berthObjs: { mesh: Mesh; model: Mat4 }[] = [];
  private buoyObjs: { x: number; y: number; color: [number, number, number] }[] = [];
  private camera: CameraState = { mode: 'chase', orbitAngle: 0, orbitDist: 1200, height: 550 };
  private time = 0;
  private proj: Mat4;

  constructor(canvas: HTMLCanvasElement, port: PortDef, ship: ShipParams) {
    this.gl = createGL(canvas);
    this.port = port;
    this.ship = ship;
    const gl = this.gl;
    this.sceneProg = createProgram(gl, SCENE_VS, SCENE_FS);
    this.waterProg = createProgram(gl, WATER_VS, WATER_FS);
    this.glowProg = createProgram(gl, GLOW_VS, GLOW_FS);

    this.water = waterMesh(gl, 4500, 90);
    this.hull = hullMesh(gl, ship.L, ship.B, ship.d, ship.superstructureHeight);
    this.deckhouse = boxMesh(gl, ship.L * 0.18, ship.B * 0.7, ship.superstructureHeight * 0.7);
    this.funnel = boxMesh(gl, ship.L * 0.05, ship.B * 0.35, ship.superstructureHeight * 0.5);
    this.tugHull = boxMesh(gl, 30, 11, 6);
    this.buoyPole = buoyPoleMesh(gl);
    this.buoyTop = buoyTopMesh(gl);

    this.buildPort();
    this.proj = mat4Perspective((55 * Math.PI) / 180, canvas.width / canvas.height, 1, 30000);
  }

  private buildPort(): void {
    const gl = this.gl;
    // 陆地
    const landColor: [number, number, number] = [0.32, 0.4, 0.26];
    this.landMeshes = [{ mesh: prismMesh(gl, this.port.land, 4, -30), color: landColor }];
    // 港池底板（浅水色提示）
    const basinFloor = prismMesh(gl, this.port.basin, -28, -32);
    this.landMeshes.push({ mesh: basinFloor, color: [0.45, 0.42, 0.3] });
    // 码头：沿 bankLines 岸线生成矮墙（网格建在原点，用模型矩阵定位旋转）
    for (const line of this.port.bankLines) {
      for (let i = 0; i < line.pts.length - 1; i++) {
        const a = line.pts[i];
        const c = line.pts[i + 1];
        const len = Math.hypot(c.x - a.x, c.y - a.y);
        const ang = Math.atan2(c.y - a.y, c.x - a.x);
        // 码头墙：沿线长 x，厚 14(y)，高 7(z)
        const mesh = boxMesh(gl, len, 14, 7);
        const model = mat4Model((a.x + c.x) / 2, (a.y + c.y) / 2, 1.5, ang, 1, 1, 1);
        this.berthObjs.push({ mesh, model });
      }
    }
    // 航标：沿航道中线每 400m 一对
    const fw = this.port.fairway;
    for (let i = 0; i < fw.length - 1; i++) {
      const a = fw[i], c = fw[i + 1];
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      const ang = Math.atan2(c.y - a.y, c.x - a.x);
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      const n = Math.max(1, Math.floor(len / 450));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const cx = a.x + (c.x - a.x) * t;
        const cy = a.y + (c.y - a.y) * t;
        this.buoyObjs.push({ x: cx + nx * this.port.fairwayHalfWidth * 0.92, y: cy + ny * this.port.fairwayHalfWidth * 0.92, color: [0.9, 0.2, 0.15] });
        this.buoyObjs.push({ x: cx - nx * this.port.fairwayHalfWidth * 0.92, y: cy - ny * this.port.fairwayHalfWidth * 0.92, color: [0.2, 0.8, 0.35] });
      }
    }
  }

  setCamera(mode: CameraMode): void {
    this.camera.mode = mode;
  }
  getCamera(): CameraState {
    return this.camera;
  }
  orbit(delta: number): void {
    this.camera.orbitAngle += delta;
  }
  zoom(factor: number): void {
    this.camera.orbitDist = Math.max(200, Math.min(5000, this.camera.orbitDist * factor));
    this.camera.height = Math.max(120, Math.min(1800, this.camera.height * factor));
  }

  resize(w: number, h: number): void {
    const gl = this.gl;
    gl.canvas.width = w;
    gl.canvas.height = h;
    gl.viewport(0, 0, w, h);
    this.proj = mat4Perspective((55 * Math.PI) / 180, w / h, 1, 30000);
  }

  private eyeAndTarget(sim: Simulator): { eye: Vec3; target: Vec3 } {
    const s = sim.state;
    const target: Vec3 = [s.x, s.y, 12];
    const c = Math.cos(s.psi);
    const sn = Math.sin(s.psi);
    switch (this.camera.mode) {
      case 'chase': {
        const back = this.ship.L * 1.6;
        return {
          eye: [s.x - c * back, s.y - sn * back, this.ship.L * 0.95],
          target: [s.x + c * this.ship.L * 0.4, s.y + sn * this.ship.L * 0.4, 6],
        };
      }
      case 'top':
        // 高空倾斜俯视（纯垂直俯视会被半透明水面均匀罩色）
        return { eye: [s.x - 260, s.y - 260, 520], target: [s.x, s.y, 0] };
      case 'bridge': {
        // 驾驶台视角：船首前上方
        const fwd = this.ship.L * 0.55;
        return {
          eye: [s.x + c * this.ship.L * 0.15, s.y + sn * this.ship.L * 0.15, this.ship.superstructureHeight + 6],
          target: [s.x + c * fwd, s.y + sn * fwd, 4],
        };
      }
      case 'orbit': {
        const a = this.camera.orbitAngle;
        return {
          eye: [s.x + Math.cos(a) * this.camera.orbitDist, s.y + Math.sin(a) * this.camera.orbitDist, this.camera.height],
          target,
        };
      }
    }
  }

  render(sim: Simulator, dt: number): void {
    this.time += dt;
    const gl = this.gl;
    gl.clearColor(0.62, 0.74, 0.82, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const { eye, target } = this.eyeAndTarget(sim);
    const view = mat4LookAt(eye, target, [0, 0, 1]);
    const lightDir: Vec3 = [0.4, 0.5, 0.75];

    // ===== 第一遍：不透明物体（写深度） =====
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.useProgram(this.sceneProg.program);
    const sp = this.sceneProg.uniforms;
    gl.uniformMatrix4fv(sp.uProj, false, this.proj);
    gl.uniformMatrix4fv(sp.uView, false, view);
    gl.uniform3f(sp.uLightDir, lightDir[0], lightDir[1], lightDir[2]);
    gl.uniform3f(sp.uCamPos, eye[0], eye[1], eye[2]);

    for (const lm of this.landMeshes) {
      this.drawObject({ mesh: lm.mesh, model: mat4Identity(), color: lm.color });
    }
    // 码头（混凝土灰）
    for (const bo of this.berthObjs) {
      this.drawObject({ mesh: bo.mesh, model: bo.model, color: [0.55, 0.54, 0.52] });
    }
    // 本船
    this.drawShip(sim);
    // 拖轮
    for (const rt of sim.tugs) {
      const s = sim.state;
      const c = Math.cos(s.psi), sn = Math.sin(s.psi);
      const tx = s.x + c * rt.def.xT - sn * rt.def.side * (this.ship.B / 2 + 18);
      const ty = s.y + sn * rt.def.xT + c * rt.def.side * (this.ship.B / 2 + 18);
      const model = mat4Model(tx, ty, 2, s.psi + (rt.def.side > 0 ? 0.15 : -0.15), 1, 1, 1);
      const active = Math.abs(rt.thrust) > 50;
      this.drawObject({
        mesh: this.tugHull,
        model,
        color: active ? [0.95, 0.55, 0.1] : [0.85, 0.8, 0.7],
      });
    }
    // 交通船
    for (const t of sim.env.traffic) this.drawTraffic(t);

    // 航标（不透明自发光，仍在水面前画）
    gl.useProgram(this.glowProg.program);
    const gp = this.glowProg.uniforms;
    gl.uniformMatrix4fv(gp.uProj, false, this.proj);
    gl.uniformMatrix4fv(gp.uView, false, view);
    for (const bu of this.buoyObjs) {
      const poleModel = mat4Model(bu.x, bu.y, 3, 0, 1, 1, 1);
      gl.uniformMatrix4fv(gp.uModel, false, poleModel);
      gl.uniform3f(gp.uColor, 0.6, 0.6, 0.55);
      gl.uniform1f(gp.uAlpha, 1);
      this.drawMesh(this.buoyPole);
      const topModel = mat4Model(bu.x, bu.y, 7.5, 0, 1, 1, 1);
      gl.uniformMatrix4fv(gp.uModel, false, topModel);
      gl.uniform3f(gp.uColor, bu.color[0], bu.color[1], bu.color[2]);
      this.drawMesh(this.buoyTop);
    }

    // ===== 第二遍：半透明水面（不写深度，靠深度测试停在物体之后） =====
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.useProgram(this.waterProg.program);
    const wp = this.waterProg.uniforms;
    gl.uniformMatrix4fv(wp.uProj, false, this.proj);
    gl.uniformMatrix4fv(wp.uView, false, view);
    gl.uniform1f(wp.uTime, this.time);
    gl.uniform1f(wp.uWaveScale, 0.5);
    gl.uniform3f(wp.uCamPos, eye[0], eye[1], eye[2]);
    gl.uniform3f(wp.uShallowColor, 0.18, 0.42, 0.46);
    gl.uniform3f(wp.uDeepColor, 0.05, 0.2, 0.32);
    gl.uniform1f(wp.uAlpha, 0.35);
    this.drawMesh(this.water);
    gl.depthMask(true);
  }

  private drawShip(sim: Simulator): void {
    const s = sim.state;
    const ship = this.ship;
    // 船体随 squat 下沉（z 减小）
    const hullModel = mat4Model(s.x, s.y, -s.squat, s.psi, 1, 1, 1);
    this.drawObject({ mesh: this.hull, model: hullModel, color: ship.hullColor });
    // 上层建筑（船中偏后）
    const c = Math.cos(s.psi), sn = Math.sin(s.psi);
    const offX = -ship.L * 0.18;
    const dx = c * offX, dy = sn * offX;
    const houseModel = mat4Model(s.x + dx, s.y + dy, ship.superstructureHeight * 0.5 - s.squat, s.psi, 1, 1, 1);
    this.drawObject({ mesh: this.deckhouse, model: houseModel, color: [0.82, 0.82, 0.8] });
    const funnelModel = mat4Model(s.x + dx - c * ship.L * 0.12, s.y + dy - sn * ship.L * 0.12, ship.superstructureHeight * 0.85 - s.squat, s.psi, 1, 1, 1);
    this.drawObject({ mesh: this.funnel, model: funnelModel, color: [0.75, 0.2, 0.15] });
  }

  private drawTraffic(t: TrafficShip): void {
    const mesh = this.tugHull; // 简化：交通船用放大箱体
    const scale = t.L / 30;
    const model = mat4Model(t.x, t.y, 3, t.psi, scale, scale * 1.5, scale * 1.4);
    this.drawObject({ mesh, model, color: [0.35, 0.4, 0.5] });
  }

  private drawObject(o: RenderObject): void {
    const gl = this.gl;
    const sp = this.sceneProg.uniforms;
    gl.uniformMatrix4fv(sp.uModel, false, o.model);
    gl.uniform3f(sp.uColor, o.color[0], o.color[1], o.color[2]);
    gl.uniform1f(sp.uAlpha, o.alpha ?? 1);
    this.drawMesh(o.mesh);
  }

  private drawMesh(mesh: Mesh): void {
    const gl = this.gl;
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.vertexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }

  debugInfo(): string {
    return `相机 ${this.camera.mode} 方位 ${rad2deg(this.camera.orbitAngle).toFixed(0)}° 距离 ${this.camera.orbitDist.toFixed(0)}m`;
  }
}

function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}
