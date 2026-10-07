/**
 * Renderer, camera, lights and the render loop. Knows nothing about the rules.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SUN_DIRECTION } from './environment.ts';
import { SKY_BOTTOM } from './palette.ts';

export type Stage = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** Register a per-frame callback. Returns an unsubscribe function. */
  onFrame(fn: (dt: number) => void): () => void;
  /** Ease the orbit target toward a point over the next few frames. */
  focusOn(point: THREE.Vector3): void;
  /** Pull the camera back far enough to see all of `box`, from the south. */
  frame(box: THREE.Box3): void;
  dispose(): void;
};

/** A soft vignette and a touch of warmth — the board as a photograph. */
const VignetteShader = {
  uniforms: { tDiffuse: { value: null }, strength: { value: 0.32 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * strength * 2.2;
      gl_FragColor = vec4(c.rgb * v, c.a);
    }
  `,
};

/**
 * ?quality=low — for phones and older laptops joining a room: lower
 * resolution, no shadows, no bloom. Everything else looks the same.
 */
const LOW_QUALITY = new URLSearchParams(window.location.search).get('quality') === 'low';

export function createStage(container: HTMLElement): Stage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_BOTTOM);
  // Valley haze: the far range fades into the sky rather than ending at a line.
  scene.fog = new THREE.Fog(SKY_BOTTOM, 110, 330);

  const camera = new THREE.PerspectiveCamera(
    45,
    // A page that starts hidden has no size yet; assume a wide screen until it does.
    container.clientHeight > 0 ? container.clientWidth / container.clientHeight : 16 / 9,
    0.1,
    1200,
  );
  camera.position.set(-1, 25, -15);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const pixelRatio = LOW_QUALITY ? Math.min(window.devicePixelRatio, 1) * 0.75 : Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = !LOW_QUALITY;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Image-based light so painted wood, brass and lacquer pick up reflections.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();

  // Post: a restrained bloom (only truly bright things glow — beacons, the
  // sun, highlight rings), a vignette, then tone mapping + sRGB output.
  // The composer renders off-screen, where the canvas's own antialiasing never
  // applies — so give its target real MSAA, or every edge comes out jagged.
  const msaaTarget = new THREE.WebGLRenderTarget(
    Math.max(1, container.clientWidth * pixelRatio),
    Math.max(1, container.clientHeight * pixelRatio),
    { type: THREE.HalfFloatType, samples: LOW_QUALITY ? 0 : 4 },
  );
  const composer = new EffectComposer(renderer, msaaTarget);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(container.clientWidth, container.clientHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth, container.clientHeight),
    0.4,
    0.55,
    3.2,
  );
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(VignetteShader));
  composer.addPass(new OutputPass());

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 12;
  controls.maxDistance = 90;
  // Keep the camera above the board — no peeking from underneath.
  controls.maxPolarAngle = Math.PI * 0.46;
  controls.target.set(0, 0, 11);

  // Morning light from the east, the way the valley actually gets it.
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
  sun.position.copy(SUN_DIRECTION).multiplyScalar(60);
  sun.castShadow = !LOW_QUALITY;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 220;
  sun.shadow.radius = 3;
  sun.shadow.normalBias = 0.02;
  const d = 40;
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, 11);

  scene.add(new THREE.HemisphereLight(0xcfe6f5, 0xb8a888, 0.9));

  // A cool rim light from behind the range, so silhouettes separate.
  const rim = new THREE.DirectionalLight(0xbcd4ff, 0.55);
  rim.position.set(-30, 25, 60);
  scene.add(rim);

  // --- frame loop ---
  const callbacks = new Set<(dt: number) => void>();

  let focusTarget: THREE.Vector3 | null = null;
  let intro: {
    t: number;
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;
  const INTRO_TIME = 3.2;
  // Any user drag skips the fly-in.
  controls.addEventListener('start', () => {
    if (intro) {
      camera.position.copy(intro.toPos);
      controls.target.copy(intro.toTarget);
      intro = null;
    }
  });
  let lastTick = performance.now();
  let lastFrameAt = lastTick;

  /** Largest slice of time any single update sees, so tweens stay stable. */
  const MAX_SUBSTEP = 0.05;

  function advance(dt: number): void {
    if (intro) {
      intro.t = Math.min(intro.t + dt / INTRO_TIME, 1);
      const k = 1 - Math.pow(1 - intro.t, 3); // ease-out cubic
      camera.position.lerpVectors(intro.fromPos, intro.toPos, k);
      controls.target.lerpVectors(intro.fromTarget, intro.toTarget, k);
      if (intro.t >= 1) intro = null;
    } else if (focusTarget) {
      // Pan rather than swivel: the camera travels with its target, so the
      // view keeps its angle instead of twisting toward far-off points.
      const before = controls.target.clone();
      controls.target.lerp(focusTarget, 1 - Math.pow(0.004, dt));
      camera.position.add(controls.target.clone().sub(before));
      if (controls.target.distanceTo(focusTarget) < 0.05) focusTarget = null;
    }
    for (const fn of callbacks) fn(dt);
    controls.update();
  }

  /**
   * Advance by the elapsed wall time, in sub-steps no larger than MAX_SUBSTEP.
   * `budget` caps how much animation one call may catch up on.
   */
  function step(now: number, budget: number): void {
    const elapsed = Math.min((now - lastTick) / 1000, budget);
    lastTick = now;

    let remaining = elapsed;
    while (remaining > 0) {
      const slice = Math.min(remaining, MAX_SUBSTEP);
      advance(slice);
      remaining -= slice;
    }

    // A container with no size (a hidden tab or panel) has nothing to draw
    // into; rendering anyway only fills the console with framebuffer errors.
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    if (LOW_QUALITY) renderer.render(scene, camera);
    else composer.render();
  }

  renderer.setAnimationLoop(() => {
    lastFrameAt = performance.now();
    step(lastFrameAt, MAX_SUBSTEP);
  });

  /**
   * Turn flow is gated on animations finishing, and a browser that withholds
   * frames — a hidden tab, a throttled background window — would otherwise
   * strand a turn mid-move with input locked for as long as it stays hidden.
   * When requestAnimationFrame goes quiet, keep stepping on a timer.
   *
   * Timers are themselves clamped to ~1Hz in a hidden tab, so this catches up
   * on real elapsed time rather than a single frame's worth. Nobody is looking
   * at the animation in that state; what matters is that the turn finishes.
   */
  const FRAME_STALL_MS = 250;
  const CATCH_UP_BUDGET = 2;
  const fallback = window.setInterval(() => {
    const now = performance.now();
    if (now - lastFrameAt < FRAME_STALL_MS) return;
    step(now, CATCH_UP_BUDGET);
  }, 1000 / 30);

  function resize(): void {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', resize);
  // The container can change size without the window doing so (a panel
  // opening, the page starting out hidden), so watch it directly too.
  const observer = new ResizeObserver(() => resize());
  observer.observe(container);

  return {
    scene,
    camera,
    renderer,
    controls,
    onFrame(fn) {
      callbacks.add(fn);
      return () => callbacks.delete(fn);
    },
    focusOn(point) {
      focusTarget = point.clone();
    },

    frame(box) {
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());

      // Distance that fits the box both vertically and horizontally.
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (camera.aspect || 16 / 9));
      const distance = Math.max(size.z / 2 / Math.tan(vFov / 2), size.x / 2 / Math.tan(hFov / 2));

      // Looking from the south and above, so the Mountain loop reads as depth.
      // A little lower than straight-down-ish, so the Himalaya rise behind
      // the board instead of being cropped off the top of the screen.
      const pull = distance * 1.08;
      const finalPos = new THREE.Vector3(centre.x, pull * 0.55, centre.z - pull * 0.9);
      const finalTarget = centre.clone().add(new THREE.Vector3(0, -1, 9));
      controls.maxDistance = pull * 2.2;

      // Open with a slow fly-in from high over the range.
      intro = {
        t: 0,
        fromPos: new THREE.Vector3(centre.x + pull * 0.5, pull * 1.25, centre.z - pull * 0.2),
        toPos: finalPos,
        fromTarget: centre.clone().add(new THREE.Vector3(0, 0, 30)),
        toTarget: finalTarget,
      };
      camera.position.copy(intro.fromPos);
      controls.target.copy(intro.fromTarget);

      // ?cam=px,py,pz,tx,ty,tz pins the view (offsets from the board centre)
      // — for screenshots and for checking a corner of the board up close.
      const cam = new URLSearchParams(window.location.search).get('cam')?.split(',').map(Number);
      if (cam && cam.length === 6 && cam.every(Number.isFinite)) {
        intro = null;
        controls.minDistance = 1; // close-ups are the point of a pinned camera
        camera.position.copy(centre).add(new THREE.Vector3(cam[0], cam[1], cam[2]));
        controls.target.copy(centre).add(new THREE.Vector3(cam[3], cam[4], cam[5]));
      }
      controls.update();

      sun.position.copy(centre).addScaledVector(SUN_DIRECTION, 80);
      sun.target.position.copy(centre);
      sun.target.updateMatrixWorld();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.clearInterval(fallback);
      window.removeEventListener('resize', resize);
      observer.disconnect();
      controls.dispose();
      composer.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}
