import { OrbitControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { Lang } from "../api";
import { tr } from "../i18n";
import { Birds, FlowerBed, Fountain, Hedge, Tree } from "./Nature";
import { Person, Walker, type Look } from "./People";
import { GratitudeWall } from "./GratitudeWall";
import { foundationBannerTexture } from "./textures";
import { useMemo } from "react";
import { LOOKS } from "./Garden";

const wallMat = new THREE.MeshStandardMaterial({ color: "#f4f7fb" });
const accent = new THREE.MeshStandardMaterial({ color: "#1f4f8f" });
const seat = new THREE.MeshStandardMaterial({ color: "#3a7bd5" });
const metal = new THREE.MeshStandardMaterial({ color: "#9aa4b1", metalness: 0.6, roughness: 0.3 });

const W = 20, D = 14, H = 4.6;

// People in the waiting room (decor, not interactive).
const ADMIN: Look = { skin: "#c99572", shirt: "#5b8def", pants: "#2b3a55", hair: "#3b2416" };
const DOCTOR: Look = { skin: "#9c6a4a", shirt: "#7fb7e8", pants: "#3a5f8f", hair: "#1a1a1a", coat: true };
const SEATED: { look: Look; p: [number, number, number] }[] = [
  { look: { skin: "#c08560", shirt: "#c0392b", pants: "#2e2e46", hair: "#24140b", dress: true }, p: [-2.8, 0, 0.5] }, // parent
  { look: { skin: "#a87553", shirt: "#d9d2c0", pants: "#5a4a3a", hair: "#d6d6d6" }, p: [-2.1, 0, 2.4] },               // grandparent
  { look: { skin: "#d1a07a", shirt: "#27ae60", pants: "#34495e", hair: "#4a2c17" }, p: [3.5, 0, 0.5] },                // adult
];
const KID: Look = { skin: "#b57a52", shirt: "#f39c12", pants: "#2f5fa7", hair: "#1a1009", scale: 0.6 };

function Chair({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.48, 0]} material={seat} castShadow><boxGeometry args={[0.6, 0.1, 0.6]} /></mesh>
      <mesh position={[0, 0.85, -0.27]} material={seat} castShadow><boxGeometry args={[0.6, 0.65, 0.08]} /></mesh>
      <mesh position={[0, 0.22, 0]} material={metal}><boxGeometry args={[0.08, 0.45, 0.08]} /></mesh>
    </group>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.35, 0.28, 0.6, 12]} /><meshStandardMaterial color="#ffffff" /></mesh>
      <mesh position={[0, 1.0, 0]}><icosahedronGeometry args={[0.6, 1]} /><meshStandardMaterial color="#3d8a42" /></mesh>
    </group>
  );
}

/** Back wall with a large window looking out onto the garden. */
function WindowWall() {
  const wx = 12, wy0 = 0.9, wy1 = 3.8;
  return (
    <group position={[0, 0, -D / 2]}>
      <mesh position={[0, wy0 / 2, 0]} material={wallMat}><boxGeometry args={[W, wy0, 0.3]} /></mesh>
      <mesh position={[0, (wy1 + H) / 2, 0]} material={wallMat}><boxGeometry args={[W, H - wy1, 0.3]} /></mesh>
      <mesh position={[-(W + wx) / 4, (wy0 + wy1) / 2, 0]} material={wallMat}><boxGeometry args={[(W - wx) / 2, wy1 - wy0, 0.3]} /></mesh>
      <mesh position={[(W + wx) / 4, (wy0 + wy1) / 2, 0]} material={wallMat}><boxGeometry args={[(W - wx) / 2, wy1 - wy0, 0.3]} /></mesh>
      {/* frame + mullions */}
      {[-wx / 2, -wx / 6, wx / 6, wx / 2].map((x) => (
        <mesh key={x} position={[x, (wy0 + wy1) / 2, 0]} material={accent}><boxGeometry args={[0.12, wy1 - wy0, 0.34]} /></mesh>
      ))}
      <mesh position={[0, wy0, 0.2]} material={accent}><boxGeometry args={[wx + 0.3, 0.12, 0.6]} /></mesh>
      <mesh position={[0, wy1, 0]} material={accent}><boxGeometry args={[wx + 0.3, 0.12, 0.34]} /></mesh>
    </group>
  );
}

/** Foundation name across the wall above the window. */
function FoundationBanner() {
  const tex = useMemo(foundationBannerTexture, []);
  return (
    <mesh position={[0, 4.2, -D / 2 + 0.17]}>
      <planeGeometry args={[9.5, 0.68]} />
      <meshStandardMaterial map={tex} />
    </mesh>
  );
}

/** What you see through the window: the garden where you were. */
function OutsideView() {
  return (
    <group position={[0, -0.01, -D / 2 - 1]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -40]}><planeGeometry args={[200, 90]} /><meshStandardMaterial color="#6fae4f" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -16]}><circleGeometry args={[7, 32]} /><meshStandardMaterial color="#d8d2c4" /></mesh>
      <Fountain position={[0, 0, -16]} />
      <Hedge position={[-12, 0, -10]} size={[12, 0.8, 0.8]} />
      <Hedge position={[12, 0, -10]} size={[12, 0.8, 0.8]} />
      <FlowerBed center={[-12, -13]} w={10} d={3} count={70} />
      <FlowerBed center={[12, -13]} w={10} d={3} count={70} />
      {[[-20, -24], [-9, -32], [8, -30], [21, -22], [-28, -14], [28, -16], [0, -42], [-16, -40], [16, -44]].map(([x, z], i) => (
        <Tree key={i} position={[x, 0, z]} scale={1.2} conifer={i % 3 === 0} />
      ))}
      {[[-4, -12], [5, -11]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation={[0, i ? -0.6 : 0.6, 0]}>
          <Person look={i ? LOOKS["dra-mendez"] : LOOKS.mateo} />
        </group>
      ))}
      <Birds count={6} center={[0, -30]} />
    </group>
  );
}

export function WaitingRoom({ lang, wallRefresh }: { lang: Lang; wallRefresh: number }) {
  const t = tr(lang);
  return (
    <>
      <Sky sunPosition={[60, 80, -40]} turbidity={3} rayleigh={0.6} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#ffffff", "#bcd3ee", 0.6]} />
      <directionalLight position={[10, 30, -40]} intensity={2.0} castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, H - 0.3, 0]} intensity={8} distance={20} color="#fff8ee" />
      <OrbitControls makeDefault target={[-3.5, 2.0, -1.8]} enablePan={false} minDistance={2} maxDistance={8.5}
        maxPolarAngle={Math.PI / 1.9} />

      {/* room shell */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[W, D]} /><meshStandardMaterial color="#dfe6ee" /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, 0]}><planeGeometry args={[W, D]} /><meshStandardMaterial color="#ffffff" /></mesh>
      <WindowWall />
      <mesh position={[-W / 2, H / 2, 0]} rotation={[0, Math.PI / 2, 0]} material={wallMat}><planeGeometry args={[D, H]} /></mesh>
      <mesh position={[W / 2, H / 2, 0]} rotation={[0, -Math.PI / 2, 0]} material={wallMat}><planeGeometry args={[D, H]} /></mesh>
      <mesh position={[0, H / 2, D / 2]} rotation={[0, Math.PI, 0]} material={wallMat}><planeGeometry args={[W, H]} /></mesh>
      {/* blue accent stripe */}
      <mesh position={[-W / 2 + 0.01, 0.6, 0]} rotation={[0, Math.PI / 2, 0]} material={accent}><planeGeometry args={[D, 0.12]} /></mesh>
      <mesh position={[W / 2 - 0.01, 0.6, 0]} rotation={[0, -Math.PI / 2, 0]} material={accent}><planeGeometry args={[D, 0.12]} /></mesh>
      {/* ceiling light panels */}
      {[-5, 0, 5].map((x) => (
        <mesh key={x} position={[x, H - 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[2.4, 1.2]} /><meshBasicMaterial color="#ffffff" /></mesh>
      ))}

      <OutsideView />
      <FoundationBanner />

      {/* gratitude wall on the left */}
      <GratitudeWall position={[-W / 2 + 0.1, 0, 0]} rotation={Math.PI / 2} width={7} refresh={wallRefresh} title={t.wallTitle} empty={t.wallEmpty} anon={t.wallAnon} />

      {/* rows of chairs facing the window */}
      {[0.5, 2.4].map((z) => [-3.5, -2.8, -2.1, -1.4, 1.4, 2.1, 2.8, 3.5].map((x) => <Chair key={`${x}${z}`} position={[x, 0, z]} rotation={Math.PI} />))}

      {/* reception / donations desk on the right */}
      <group position={[7.2, 0, 1]}>
        <mesh position={[0, 0.55, 0]} castShadow material={accent}><boxGeometry args={[1.2, 1.1, 4.5]} /></mesh>
        <mesh position={[0, 1.12, 0]} material={wallMat}><boxGeometry args={[1.4, 0.06, 4.7]} /></mesh>
        <group position={[1.3, 0, 0]} rotation={[0, -Math.PI / 2, 0]}><Person look={LOOKS["lic-soto"]} /></group>
        <group position={[1.3, 0, 1.7]} rotation={[0, -Math.PI / 2, 0]}><Person look={ADMIN} /></group>
      </group>
      {SEATED.map((s2, i) => (
        <group key={i} position={s2.p} rotation={[0, Math.PI, 0]}><Person look={s2.look} seated /></group>
      ))}
      <group position={[-1.9, 0, 1.0]} rotation={[0, -Math.PI / 2, 0]}><Person look={KID} /></group>
      <Walker look={DOCTOR} path={[[-7, -4.5], [5.5, -4.5], [5.5, 4.8], [-7, 4.8]]} speed={1.0} />
      <Plant position={[-8.5, 0, -5.8]} />
      <Plant position={[8.5, 0, -5.8]} />
      <Plant position={[8.5, 0, 5.8]} />
    </>
  );
}
