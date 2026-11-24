import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AppMode, BuildResult, Params, PartInfo } from '../types';
import { BOX_TOP_CLEARANCE } from '../lib/geometry';

interface ViewportProps {
  result: BuildResult | null;
  mode: AppMode;
  params: Params;
  explode: number;
  busy: boolean;
}

interface ViewportContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
  content: THREE.Group;
}

function makeMaterial(color: string, opacity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.72,
    metalness: 0.02,
    flatShading: true,
    transparent: opacity < 1,
    opacity,
  });
}

function partObject(part: PartInfo): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(part.mesh.vertProperties.slice(), 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(part.mesh.triVerts.slice(), 1));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, makeMaterial(part.color));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = part.name;
  return mesh;
}

function disposeGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((item) => item.dispose());
      else material.dispose();
    }
  });
  group.clear();
}

function fitCamera(ctx: ViewportContext) {
  const bbox = new THREE.Box3().setFromObject(ctx.content);
  if (bbox.isEmpty()) return;
  const sphere = bbox.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 25);
  const fov = (ctx.camera.fov * Math.PI) / 180;
  const distance = (radius / Math.sin(fov / 2)) * 1.02;
  const direction = new THREE.Vector3(0.95, 0.72, 1.15).normalize();
  ctx.controls.target.copy(sphere.center);
  ctx.camera.position.copy(sphere.center).addScaledVector(direction, distance);
  ctx.camera.near = Math.max(0.5, distance / 100);
  ctx.camera.far = distance * 20;
  ctx.camera.updateProjectionMatrix();
  ctx.controls.update();
}

function rebuildContent(
  ctx: ViewportContext,
  result: BuildResult | null,
  mode: AppMode,
  params: Params,
  explode: number,
) {
  disposeGroup(ctx.content);
  if (!result) return;

  if (mode === 'zones') {
    const body = result.zoneBody ?? result.parts[0];
    if (body) ctx.content.add(partObject(body));
    return;
  }

  if (mode === 'organizer') {
    for (const part of result.parts) {
      const mesh = partObject(part);
      if (part.offset) {
        mesh.position.set(part.offset.x, part.offset.y, part.offset.z);
      }
      ctx.content.add(mesh);
    }
    return;
  }

  if (mode === 'set' && result.box) {
    const box = result.box;
    const boxMesh = partObject(box);
    ctx.content.add(boxMesh);

    if (result.tray) {
      const bodyHeight =
        result.tray.height - (params.stackable ? 1 : 0);
      const floor = Math.max(box.height - result.stackTotalHeight - BOX_TOP_CLEARANCE, 0);
      const count = Math.max(1, params.box.trayCount);
      for (let index = 0; index < count; index += 1) {
        const clone = partObject(result.tray);
        clone.position.set(0, 0, floor + index * bodyHeight);
        ctx.content.add(clone);
      }
    }

    if (result.lid) {
      const lidHolder = new THREE.Group();
      lidHolder.rotation.y = Math.PI;
      const lidMesh = partObject(result.lid);
      lidHolder.add(lidMesh);
      lidHolder.position.set(0, 0, box.height + 4 + explode * 42);
      ctx.content.add(lidHolder);
    }
    return;
  }

  if (result.tray) {
    ctx.content.add(partObject(result.tray));
  }
}

export function Viewport({ result, mode, params, explode, busy }: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef<ViewportContext | null>(null);
  const lastFitKey = useRef('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.5,
      4000,
    );
    camera.position.set(160, 150, 200);
    camera.up.set(0, 1, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 30;
    controls.maxDistance = 1600;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.target.set(0, 10, 0);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x92a0af, 0.85));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9);
    keyLight.position.set(180, 280, 140);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 900;
    keyLight.shadow.camera.left = -260;
    keyLight.shadow.camera.right = 260;
    keyLight.shadow.camera.top = 260;
    keyLight.shadow.camera.bottom = -260;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xdfe8f4, 0.45);
    fillLight.position.set(-220, 160, -140);
    scene.add(fillLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400),
      new THREE.ShadowMaterial({ color: 0x1f2a36, opacity: 0.12 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.62;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(600, 60, 0xb9c2cc, 0xd8dee6);
    grid.position.y = -0.6;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.7;
    });
    scene.add(grid);

    const root = new THREE.Group();
    root.rotation.x = -Math.PI / 2;
    const content = new THREE.Group();
    root.add(content);
    scene.add(root);

    const ctx: ViewportContext = { renderer, scene, camera, controls, root, content };
    ctxRef.current = ctx;

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      disposeGroup(content);
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      grid.geometry.dispose();
      gridMaterials.forEach((material) => material.dispose());
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      ctxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    rebuildContent(ctx, result, mode, params, explode);
    const fitKey = `${mode}-${result?.parts.length ?? 0}-${Boolean(result?.box)}-${Boolean(result?.lid)}-${Boolean(result?.zoneBody)}`;
    if (fitKey !== lastFitKey.current) {
      lastFitKey.current = fitKey;
      requestAnimationFrame(() => fitCamera(ctx));
    }
  }, [result, mode, params, explode]);

  const zoom = (factor: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const offset = ctx.camera.position.clone().sub(ctx.controls.target);
    offset.multiplyScalar(factor);
    ctx.camera.position.copy(ctx.controls.target).add(offset);
    ctx.controls.update();
  };

  return (
    <div className={`viewport ${busy ? 'is-busy' : ''}`} ref={containerRef}>
      <div className="viewport-actions">
        <button type="button" className="icon-button" onClick={() => zoom(0.82)} aria-label="放大">
          +
        </button>
        <button type="button" className="icon-button" onClick={() => zoom(1.22)} aria-label="缩小">
          −
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => ctxRef.current && fitCamera(ctxRef.current)}
          aria-label="适配视图"
        >
          ⛶
        </button>
      </div>
      <div className="axis-widget" aria-hidden="true">
        <span className="axis axis-y">Y</span>
        <span className="axis axis-x">X</span>
        <span className="axis axis-z">Z</span>
        <span className="axis-dot dot-x" />
        <span className="axis-dot dot-y" />
        <span className="axis-dot dot-z" />
      </div>
    </div>
  );
}
