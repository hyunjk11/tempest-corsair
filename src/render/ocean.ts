import * as THREE from 'three';
import { waveGlsl } from './waves';

export const OCEAN_SIZE = 460;
export const OCEAN_SEGMENTS = 100;

export function createOcean(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const geometry = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uSunDir: { value: new THREE.Vector3(-0.42, 0.84, -0.32).normalize() },
      uFogColor: { value: new THREE.Color('#f2b07a') },
      uDeep: { value: new THREE.Color('#0b4664') },
      uShallow: { value: new THREE.Color('#2aa4ae') },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uStorm;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vWave;
      ${waveGlsl()}
      void main() {
        vec3 pos = position;
        vec3 baseWorld = (modelMatrix * vec4(pos, 1.0)).xyz;
        float h = corsairWave(baseWorld.xz, uTime, uStorm);
        float e = 1.2;
        float hx = corsairWave(baseWorld.xz + vec2(e, 0.0), uTime, uStorm);
        float hz = corsairWave(baseWorld.xz + vec2(0.0, e), uTime, uStorm);
        vNormal = normalize(vec3(h - hx, e, h - hz));
        pos.y += h;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        vWave = h;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uFogColor;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uStorm;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vWave;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 L = normalize(uSunDir);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.4);
        float spec = pow(max(dot(reflect(-L, N), V), 0.0), 240.0);
        float peak = smoothstep(-0.15, 0.9, vWave);
        vec3 col = mix(uDeep, uShallow, 0.42 + peak * 0.45);
        col += vec3(1.0, 0.94, 0.82) * spec * mix(0.42, 0.1, uStorm);
        col = mix(col, vec3(0.78, 0.9, 0.93), fres * 0.28);
        float foam = smoothstep(0.55, 1.25, vWave) * (0.35 + uStorm * 0.6);
        col = mix(col, vec3(0.9, 0.97, 0.98), foam);
        float dist = distance(vWorld.xz, cameraPosition.xz);
        col = mix(col, uFogColor, smoothstep(120.0, 320.0, dist));
        col = toneMapping(col);
        gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  return { mesh, material };
}
