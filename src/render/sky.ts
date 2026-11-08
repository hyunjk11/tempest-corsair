import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.42, 0.84, -0.32).normalize();

export function createSky(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const geometry = new THREE.SphereGeometry(430, 28, 18);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uZenithA: { value: new THREE.Color('#1d4e89') },
      uZenithB: { value: new THREE.Color('#141b22') },
      uHorizonA: { value: new THREE.Color('#f2b07a') },
      uHorizonB: { value: new THREE.Color('#5d6b73') },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uStorm;
      uniform vec3 uSunDir;
      uniform vec3 uZenithA;
      uniform vec3 uZenithB;
      uniform vec3 uHorizonA;
      uniform vec3 uHorizonB;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float height = clamp(dir.y, 0.0, 1.0);
        vec3 zenith = mix(uZenithA, uZenithB, uStorm);
        vec3 horizon = mix(uHorizonA, uHorizonB, uStorm);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.62, height));
        vec3 sun = normalize(uSunDir);
        float disc = pow(max(dot(dir, sun), 0.0), 1400.0);
        float glow = pow(max(dot(dir, sun), 0.0), 28.0);
        col += vec3(1.0, 0.86, 0.62) * disc * (1.0 - uStorm);
        col += vec3(1.0, 0.74, 0.48) * glow * 0.16 * (1.0 - uStorm);
        float clouds = sin(dir.x * 7.0 + uTime * 0.03) * sin(dir.z * 5.5 - uTime * 0.02);
        float band = smoothstep(0.02, 0.18, dir.y) * (1.0 - smoothstep(0.4, 0.72, dir.y));
        float puff = smoothstep(0.18, 0.78, clouds) * band;
        vec3 cloudCol = mix(vec3(1.0, 0.95, 0.88), vec3(0.42, 0.48, 0.54), uStorm);
        col = mix(col, cloudCol, puff * mix(0.58, 0.18, uStorm));
        col = toneMapping(col);
        gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, material };
}

export function createBirds(): THREE.Group {
  const flock = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: '#1b2430', side: THREE.DoubleSide });
  const wing = new THREE.PlaneGeometry(0.72, 0.15);
  for (let i = 0; i < 6; i += 1) {
    const bird = new THREE.Group();
    const left = new THREE.Mesh(wing, material);
    const right = new THREE.Mesh(wing, material);
    left.position.x = -0.36;
    right.position.x = 0.36;
    bird.add(left, right);
    flock.add(bird);
  }
  return flock;
}

export function updateBirds(flock: THREE.Group, time: number, focusX: number, focusZ: number): void {
  flock.children.forEach((bird, index) => {
    const angle = time * 0.22 + index * 1.15;
    const radius = 16 + (index % 3) * 7;
    bird.position.set(focusX + Math.cos(angle) * radius, 9 + (index % 4) * 1.3, focusZ + Math.sin(angle * 0.85) * radius);
    bird.rotation.y = -angle + Math.PI / 2;
    const flap = Math.sin(time * 6.5 + index) * 0.55;
    const left = bird.children[0];
    const right = bird.children[1];
    if (left && right) {
      left.rotation.z = flap;
      right.rotation.z = -flap;
    }
  });
}
