export const WAVE_TERMS = [
  { ax: 0.045, az: 0.012, speed: 0.72, phase: 0.2, weight: 0.52 },
  { ax: 0.02, az: 0.055, speed: -0.9, phase: 1.4, weight: 0.34 },
  { ax: 0.07, az: 0.04, speed: 1.25, phase: 0.5, weight: 0.18 },
  { ax: 0.13, az: -0.09, speed: 1.7, phase: 2.2, weight: 0.1 },
  { ax: 0.2, az: 0.16, speed: 2.3, phase: 0.8, weight: 0.05 },
] as const;

const BASE_AMP = 0.85;
const STORM_AMP = 1.2;

export function waveHeight(x: number, z: number, time: number, storm: number): number {
  const amp = BASE_AMP + storm * STORM_AMP;
  let height = 0;
  for (const term of WAVE_TERMS) {
    height += Math.sin(x * term.ax + z * term.az + time * term.speed + term.phase) * term.weight;
  }
  return height * amp;
}

export function waveGlsl(): string {
  const lines = WAVE_TERMS.map(
    (term) =>
      `h += sin(p.x * ${term.ax.toFixed(4)} + p.y * ${term.az.toFixed(4)} + t * ${term.speed.toFixed(4)} + ${term.phase.toFixed(4)}) * ${term.weight.toFixed(4)};`,
  );
  return `
    float corsairWave(vec2 p, float t, float storm) {
      float amp = ${BASE_AMP.toFixed(4)} + storm * ${STORM_AMP.toFixed(4)};
      float h = 0.0;
      ${lines.join('\n')}
      return h * amp;
    }
  `;
}
