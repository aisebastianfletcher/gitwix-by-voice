/**
 * Gitwix — Three.js Orb Cluster Visualizer
 * Spherical cluster of smaller orbs with audio-reactive behavior.
 */
import * as THREE from 'three';

// Mount inside the hero stage, falling back to the global container
const heroStage = document.getElementById('orb-hero-stage');
const globalContainer = document.getElementById('orb-canvas-container');
const container = heroStage || globalContainer;
if (!container) throw new Error('Orb container not found');

// If we're using hero stage, move the global container inside it
if (heroStage && globalContainer) {
  heroStage.appendChild(globalContainer);
  globalContainer.style.position = 'absolute';
  globalContainer.style.inset = '0';
  globalContainer.style.width = '100%';
  globalContainer.style.height = '100%';
}

const renderTarget = globalContainer || container;

// === Config ===
const ORB_COUNT = 400;
const SPHERE_RADIUS = 2.8;
const IDLE_SPEED = 0.00015;
const DISPERSE_STRENGTH = 1.8;
const RETURN_SPEED = 0.04;
const COLOR_TRANSITION_SPEED = 0.03;

// Color palette for active state (Da Vinci gold tones)
const ACTIVE_COLORS = [
  new THREE.Color('#B8943F'),
  new THREE.Color('#D4BC73'),
  new THREE.Color('#9A7B34'),
  new THREE.Color('#E8D5A3'),
  new THREE.Color('#7D632A'),
  new THREE.Color('#C9A84C'),
];
const IDLE_COLOR = new THREE.Color('#2A2520');

// === Scene Setup ===
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.z = 8;

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderTarget.appendChild(renderer.domElement);

// === Orb Instanced Mesh ===
const orbGeo = new THREE.SphereGeometry(0.045, 10, 6);
const orbMat = new THREE.MeshStandardMaterial({
  color: IDLE_COLOR,
  roughness: 0.5,
  metalness: 0.3,
  transparent: true,
  opacity: 0.35,
});
const mesh = new THREE.InstancedMesh(orbGeo, orbMat, ORB_COUNT);

// Store base positions on a sphere
const basePositions = [];
const currentPositions = [];
const velocities = [];
const orbColors = [];
const targetColors = [];
const dummy = new THREE.Object3D();
const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(ORB_COUNT * 3), 3);

for (let i = 0; i < ORB_COUNT; i++) {
  // Fibonacci sphere distribution
  const phi = Math.acos(1 - 2 * (i + 0.5) / ORB_COUNT);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  const x = SPHERE_RADIUS * Math.sin(phi) * Math.cos(theta);
  const y = SPHERE_RADIUS * Math.sin(phi) * Math.sin(theta);
  const z = SPHERE_RADIUS * Math.cos(phi);

  basePositions.push(new THREE.Vector3(x, y, z));
  currentPositions.push(new THREE.Vector3(x, y, z));
  velocities.push(new THREE.Vector3(0, 0, 0));
  orbColors.push(IDLE_COLOR.clone());
  targetColors.push(IDLE_COLOR.clone());

  colorAttr.setXYZ(i, IDLE_COLOR.r, IDLE_COLOR.g, IDLE_COLOR.b);
}

mesh.instanceColor = colorAttr;
scene.add(mesh);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);
const pointLight = new THREE.PointLight(0xB8943F, 0.4, 20);
pointLight.position.set(-3, 2, 4);
scene.add(pointLight);

// === Audio Analysis State ===
let audioLevel = 0; // 0-1 normalized RMS
let frequencyData = new Float32Array(32); // frequency bins
let isActive = false;

// === Public API ===
window.orbVisualizer = {
  setAudioLevel(level) {
    audioLevel = Math.max(0, Math.min(1, level));
    isActive = level > 0.02;
  },
  setFrequencyData(data) {
    if (data && data.length) {
      for (let i = 0; i < Math.min(data.length, 32); i++) {
        frequencyData[i] = data[i] || 0;
      }
    }
  },
  setActive(active) {
    isActive = active;
    if (!active) audioLevel = 0;
  }
};

// === Animation Loop ===
let time = 0;

function animate() {
  requestAnimationFrame(animate);
  time += IDLE_SPEED;

  for (let i = 0; i < ORB_COUNT; i++) {
    const base = basePositions[i];
    const curr = currentPositions[i];
    const vel = velocities[i];

    if (isActive) {
      // Disperse based on audio level
      const freqIdx = i % 32;
      const freqBoost = 1 + (frequencyData[freqIdx] || 0) * 3;
      const disperseAmount = audioLevel * DISPERSE_STRENGTH * freqBoost;

      // Direction: outward from center + some chaos
      const dir = base.clone().normalize();
      const chaos = new THREE.Vector3(
        Math.sin(time * 200 + i * 0.7) * 0.3,
        Math.cos(time * 300 + i * 1.1) * 0.3,
        Math.sin(time * 250 + i * 0.5) * 0.3
      );

      const target = base.clone().add(dir.multiplyScalar(disperseAmount)).add(chaos.multiplyScalar(audioLevel));
      vel.lerp(target.sub(curr).multiplyScalar(0.15), 0.3);
      curr.add(vel);

      // Color → active palette
      const colorIdx = i % ACTIVE_COLORS.length;
      targetColors[i].copy(ACTIVE_COLORS[colorIdx]);
    } else {
      // Return to sphere
      // Gentle breathing — slow, organic drift
      const breathPhase = time * 12;
      const idleOffset = new THREE.Vector3(
        Math.sin(breathPhase + i * 0.5) * 0.06,
        Math.cos(breathPhase * 0.8 + i * 0.7) * 0.06,
        Math.sin(breathPhase * 0.9 + i * 0.3) * 0.06,
      );
      const target = base.clone().add(idleOffset);
      curr.lerp(target, RETURN_SPEED);
      vel.multiplyScalar(0.9);

      // Color → idle
      targetColors[i].copy(IDLE_COLOR);
    }

    // Smooth color lerp
    orbColors[i].lerp(targetColors[i], COLOR_TRANSITION_SPEED);
    colorAttr.setXYZ(i, orbColors[i].r, orbColors[i].g, orbColors[i].b);

    // Update instance
    dummy.position.copy(curr);
    const s = isActive ? 1 + audioLevel * 0.5 + (frequencyData[i % 32] || 0) * 0.8 : 1;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  colorAttr.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;

  // Opacity: subtle at rest, vivid when active
  const targetOpacity = isActive ? 0.85 : 0.35;
  orbMat.opacity += (targetOpacity - orbMat.opacity) * 0.05;

  // Gentle breathing rotation
  mesh.rotation.y = time * 8;
  mesh.rotation.x = Math.sin(time * 4) * 0.06;

  renderer.render(scene, camera);
}

// === Resize ===
function resize() {
  const w = renderTarget.clientWidth;
  const h = renderTarget.clientHeight;
  if (w && h) {
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

window.addEventListener('resize', resize);
resize();
animate();
