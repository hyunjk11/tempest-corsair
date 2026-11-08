export type TerrainKind = 'island' | 'reef' | 'coast';

export interface TerrainBody {
  kind: TerrainKind;
  x: number;
  z: number;
  radius: number;
}

export function terrainHit(x: number, z: number, padding: number, bodies: readonly TerrainBody[]): TerrainBody | null {
  for (const body of bodies) {
    const reach = body.radius + padding;
    const dx = x - body.x;
    const dz = z - body.z;
    if (dx * dx + dz * dz < reach * reach) return body;
  }
  return null;
}

export function terrainBlocks(x: number, z: number, padding: number, bodies: readonly TerrainBody[]): boolean {
  return terrainHit(x, z, padding, bodies) !== null;
}
