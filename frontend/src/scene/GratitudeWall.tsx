import { useEffect, useState } from "react";
import * as THREE from "three";
import { api, type WallEntry } from "../api";
import { wallTexture } from "./textures";

/** Donor names, sized by donation. `refresh` re-fetches after a new donation. */
export function GratitudeWall({ position, rotation = 0, width = 10, refresh, title, empty, anon }: {
  position: [number, number, number]; rotation?: number; width?: number; refresh: number; title: string; empty: string; anon: string;
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let alive = true;
    api<WallEntry[]>("/wall")
      .catch(() => [])
      .then((entries) => wallTexture(entries, title, empty, anon))
      .then((t) => { if (alive) setTex(t); });
    return () => { alive = false; };
  }, [refresh, title, empty, anon]);
  const h = width / 2;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, h / 2 + 0.6, -0.06]} castShadow>
        <boxGeometry args={[width + 0.4, h + 0.4, 0.1]} />
        <meshStandardMaterial color="#1f4f8f" />
      </mesh>
      {tex && (
        <mesh position={[0, h / 2 + 0.6, 0]}>
          <planeGeometry args={[width, h]} />
          <meshStandardMaterial map={tex} />
        </mesh>
      )}
    </group>
  );
}
