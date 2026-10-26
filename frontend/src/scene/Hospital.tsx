import { useMemo } from "react";
import * as THREE from "three";
import { entranceSignTexture, helipadTexture, plaqueTexture, stoneSignTexture } from "./textures";

const tan = new THREE.MeshStandardMaterial({ color: "#b98f6b", roughness: 0.9 });
const tanLight = new THREE.MeshStandardMaterial({ color: "#cfaa84", roughness: 0.9 });
const glass = new THREE.MeshStandardMaterial({ color: "#2f4558", roughness: 0.15, metalness: 0.5 });
const white = new THREE.MeshStandardMaterial({ color: "#f1f1ee", roughness: 0.6 });
const roofRed = new THREE.MeshStandardMaterial({ color: "#c64a32", roughness: 0.8 });
const concrete = new THREE.MeshStandardMaterial({ color: "#d9d6cf", roughness: 0.9 });

function Box({ p, s, m, shadow = true }: { p: [number, number, number]; s: [number, number, number]; m: THREE.Material; shadow?: boolean }) {
  return (
    <mesh position={p} material={m} castShadow={shadow} receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** Main entrance building, modelled on the INC façade photo. Origin = ground at façade centre. */
function MainBuilding() {
  const sign = useMemo(entranceSignTexture, []);
  const W = 56, D = 16;
  const cols = useMemo(() => Array.from({ length: 19 }, (_, i) => -W / 2 + 1 + i * ((W - 2) / 18)), []);
  return (
    <group>
      {/* ground floor glass with white columns */}
      <Box p={[0, 2.2, -D / 2]} s={[W - 1, 4.4, D - 1]} m={glass} />
      {cols.map((x) => <Box key={x} p={[x, 2.2, -0.4]} s={[0.5, 4.4, 0.5]} m={white} />)}
      {/* upper floors: concrete bands + window strips */}
      <Box p={[0, 5.6, -D / 2]} s={[W, 2.4, D]} m={tan} />
      <Box p={[0, 7.6, -D / 2 + 0.3]} s={[W - 0.4, 1.6, D - 0.2]} m={glass} />
      {Array.from({ length: 28 }, (_, i) => -W / 2 + 1 + i * 2).map((x) => (
        <Box key={x} p={[x, 7.6, 0.25]} s={[0.15, 1.6, 0.2]} m={white} shadow={false} />
      ))}
      <Box p={[0, 9.3, -D / 2]} s={[W, 1.8, D]} m={tan} />
      <Box p={[0, 10.8, -D / 2 + 0.3]} s={[W - 0.4, 1.2, D - 0.2]} m={glass} />
      <Box p={[0, 11.9, -D / 2]} s={[W, 1.0, D]} m={tan} />
      {/* rooftop box */}
      <Box p={[-6, 13.6, -D / 2]} s={[12, 2.4, 8]} m={tanLight} />
      <Box p={[-6, 15.4, -D / 2]} s={[5, 1.2, 4]} m={concrete} />
      {/* entrance canopy with the sign */}
      <Box p={[0, 4.2, 5]} s={[16, 1.6, 10]} m={concrete} />
      <mesh position={[0, 4.2, 10.02]}>
        <planeGeometry args={[15, 1.5]} />
        <meshStandardMaterial map={sign} />
      </mesh>
      {[-7, 7].map((x) => <Box key={x} p={[x, 1.7, 9]} s={[1.2, 3.4, 1.2]} m={concrete} />)}
      {/* doors */}
      <mesh position={[0, 1.6, 0.05]}>
        <planeGeometry args={[6, 3.2]} />
        <meshStandardMaterial color="#9fc6e6" transparent opacity={0.7} metalness={0.3} roughness={0.1} />
      </mesh>
      {/* red car at the drop-off */}
      <group position={[-3, 0, 6]}>
        <Box p={[0, 0.55, 0]} s={[4.2, 0.7, 1.8]} m={new THREE.MeshStandardMaterial({ color: "#c81e2b", metalness: 0.4, roughness: 0.3 })} />
        <Box p={[-0.2, 1.1, 0]} s={[2.2, 0.6, 1.6]} m={glass} />
        {[[-1.4, 0.9], [1.4, 0.9], [-1.4, -0.9], [1.4, -0.9]].map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x, 0.32, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.25, 12]} />
            <meshStandardMaterial color="#1a1a1a" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Campus behind: tower with helipad, wings with red roofs (aerial photo). */
function Campus() {
  const heli = useMemo(helipadTexture, []);
  return (
    <group>
      {/* tower */}
      <Box p={[0, 15, -30]} s={[16, 30, 14]} m={tanLight} />
      {Array.from({ length: 7 }, (_, i) => -6 + i * 2).map((x) => (
        <Box key={x} p={[x, 15.5, -22.9]} s={[0.9, 27, 0.2]} m={glass} shadow={false} />
      ))}
      <Box p={[0, 30.6, -30]} s={[16.6, 1.2, 14.6]} m={roofRed} />
      <mesh position={[0, 31.25, -30]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial map={heli} />
      </mesh>
      {/* wings */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <Box p={[side * 34, 9, -22]} s={[14, 18, 22]} m={tan} />
          <Box p={[side * 34, 18.5, -22]} s={[14.6, 1, 22.6]} m={roofRed} />
          {Array.from({ length: 6 }, (_, i) => 2 + i * 2.8).map((y) => (
            <Box key={y} p={[side * 34, y, -10.9]} s={[13, 1.1, 0.2]} m={glass} shadow={false} />
          ))}
        </group>
      ))}
      <Box p={[0, 6, -46]} s={[60, 12, 14]} m={tanLight} />
      <Box p={[0, 12.5, -46]} s={[60.6, 1, 14.6]} m={roofRed} />
    </group>
  );
}

export function Hospital({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <MainBuilding />
      <Campus />
    </group>
  );
}

/** Stone sign wall with the mosaic emblem (second photo). */
export function SignWall({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const tex = useMemo(stoneSignTexture, []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box p={[0, 0.6, 0]} s={[14.4, 1.2, 1.2]} m={tan} />
      <mesh position={[0, 4.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[14, 6, 0.8]} />
        <meshStandardMaterial color="#a9afb2" />
      </mesh>
      <mesh position={[0, 4.2, 0.41]}>
        <planeGeometry args={[14, 6]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
    </group>
  );
}

/** Small plaque with the inauguration date (first image). */
export function Plaque({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  const tex = useMemo(plaqueTexture, []);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Box p={[0, 0.6, 0]} s={[0.3, 1.2, 0.3]} m={concrete} />
      <mesh position={[0, 1.8, 0]} castShadow>
        <boxGeometry args={[2.6, 1.3, 0.12]} />
        <meshStandardMaterial color="#1f4f8f" />
      </mesh>
      <mesh position={[0, 1.8, 0.065]}>
        <planeGeometry args={[2.5, 1.22]} />
        <meshStandardMaterial map={tex} />
      </mesh>
    </group>
  );
}
