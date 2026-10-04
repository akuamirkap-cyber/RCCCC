import * as THREE from 'three';

/* ============================================================
   GARAGE — static showroom used behind the start menu.
   Flat slate studio (floor + gradient back wall + blue angled
   panel), soft key/rim lighting with a contact shadow, fixed
   low side camera: the car sits on the right of the frame with
   its nose toward screen-left, exactly like a console racer's
   main menu. The car does NOT rotate.
   ============================================================ */

function gradientTexture(top: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Garage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private car: THREE.Group | null = null;
  private readonly carPos = new THREE.Vector3(0, 0, 0);
  private readonly carYaw = 0; // nose toward +Z = screen-right for a camera looking +X

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color('#5c6e8c');

    // floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: '#56687f', roughness: 0.5, metalness: 0.08, envMapIntensity: 0.5 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    // back wall with a vertical gradient (lighter at the top, like a cyclorama)
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 40),
      new THREE.MeshBasicMaterial({ map: gradientTexture('#9aa9bd', '#5c6e8c') }),
    );
    wall.position.set(16, 20, 0);
    wall.rotation.y = -Math.PI / 2; // faces -X (toward the camera)
    s.add(wall);

    // blue angled panel on the wall (the menu's signature shape) — mirrored so it sits behind the car's nose
    const shape = new THREE.Shape();
    shape.moveTo(-6, 0);
    shape.lineTo(40, 0);
    shape.lineTo(40, 40);
    shape.lineTo(-15, 40);
    shape.closePath();
    const panel = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: '#4f7fe0' }));
    panel.position.set(15.9, 0, 0);
    panel.rotation.y = -Math.PI / 2;
    s.add(panel);

    // lighting: soft sky fill + strong key from front-left-top + cool rim from behind
    s.add(new THREE.HemisphereLight(0xe6eefa, 0x4a5a70, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(-7, 9, -5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = key.shadow.camera.bottom = -7;
    key.shadow.camera.right = key.shadow.camera.top = 7;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    s.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 1.4);
    rim.position.set(7, 5, 7);
    s.add(rim, rim.target);
    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, 3, 8);
    s.add(fill, fill.target);

    // fixed low side camera; the look target is shifted toward the nose so the car sits on the right of the frame
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
    this.camera.position.set(-9.8, 1.15, -2.0);
    this.camera.lookAt(0, 0.85, -2.0);
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    // portrait / narrow: pull back so the whole nose stays in frame
    this.camera.fov = aspect < 1 ? 46 : aspect < 1.4 ? 36 : 30;
    this.camera.updateProjectionMatrix();
  }

  /** Parks `car` in the showroom (re-parents it into the garage scene). */
  show(car: THREE.Group) {
    if (this.car && this.car !== car) this.scene.remove(this.car);
    this.car = car;
    this.scene.add(car);
    this.pose();
  }

  /** Re-applies the static showroom pose (call once per frame while the menu is up). */
  pose() {
    if (!this.car) return;
    this.car.position.copy(this.carPos);
    this.car.rotation.set(0, this.carYaw, 0);
  }

  /** Removes the car from the showroom; the caller re-adds it to the race scene. */
  release(): THREE.Group | null {
    const c = this.car;
    if (c) this.scene.remove(c);
    this.car = null;
    return c;
  }

  get active() {
    return this.car !== null;
  }

  render(renderer: THREE.WebGLRenderer, environment: THREE.Texture | null) {
    this.scene.environment = environment;
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.release(); // the car belongs to the game, never dispose it here
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material & { map?: THREE.Texture };
        mat.map?.dispose();
        mat.dispose();
      }
    });
  }
}
