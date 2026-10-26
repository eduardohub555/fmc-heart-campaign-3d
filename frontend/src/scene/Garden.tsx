import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import type { Lang, Persona } from "../api";
import { Birds, FlowerBed, Fountain, Hedge, Tree } from "./Nature";
import { Hospital, Plaque, SignWall } from "./Hospital";
import { Npc, Person, Walker, type Look } from "./People";
import { GratitudeWall } from "./GratitudeWall";
import { tr } from "../i18n";

export const LOOKS: Record<string, Look> = {
  "dra-herrera": { skin: "#c68863", shirt: "#3a7bd5", pants: "#2b3a55", hair: "#2a1a10", coat: true },
  "dr-ramirez": { skin: "#a8714f", shirt: "#4fa3a5", pants: "#3a6e8f", hair: "#151515", coat: true },
  "dra-mendez": { skin: "#e0ac85", shirt: "#e07aa5", pants: "#34425e", hair: "#6b3d1e", coat: true },
  "lic-soto": { skin: "#b97a56", shirt: "#1f4f8f", pants: "#3b3b3b", hair: "#1c1c1c" },
  mateo: { skin: "#b57a52", shirt: "#e8b730", pants: "#2f5fa7", hair: "#1a1009", scale: 0.6 },
  mariana: { skin: "#c18661", shirt: "#8e44ad", pants: "#2e2e46", hair: "#24140b", dress: true },
  "don-ernesto": { skin: "#a86e4a", shirt: "#d9d2c0", pants: "#5a4a3a", hair: "#cfcfcf", cane: true },
  "dona-rosa": { skin: "#b9805c", shirt: "#c0392b", pants: "#4a3a4a", hair: "#e6e6e6", dress: true, cane: true },
};

export const NPC_SPOTS: Record<string, { p: [number, number, number]; r: number }> = {
  "dra-herrera": { p: [-7, 0, 6], r: 0.5 },
  "dr-ramirez": { p: [4.5, 0, -13], r: -0.3 },
  "dra-mendez": { p: [-12, 0, -14], r: 0.6 },
  "lic-soto": { p: [6, 0, -24], r: 0 },
  mateo: { p: [-4.5, 0, -2], r: 0.8 },
  mariana: { p: [12, 0, 4], r: -0.7 },
  "don-ernesto": { p: [17, 0, -10.5], r: -1.0 },
  "dona-rosa": { p: [-25, 0, -2], r: 1.0 },
};

const AMBIENT: { look: Look; path: [number, number][]; speed?: number }[] = [
  { look: { skin: "#d0a07c", shirt: "#ff7f50", pants: "#1f3b70", hair: "#3a2412", scale: 0.55 }, path: [[-3, 3], [3, 3], [5, -3], [0, -8 + 6], [-5, -3]], speed: 2.6 },
  { look: { skin: "#8d5a3b", shirt: "#2ecc71", pants: "#203050", hair: "#111", scale: 0.55 }, path: [[3, 4], [-4, 2], [-5, -4], [4, -4]], speed: 2.4 },
  { look: { skin: "#c9946c", shirt: "#ffffff", pants: "#4a6fa5", hair: "#333", coat: true }, path: [[-28, 20], [-28, -24], [28, -24], [28, 20]], speed: 1.2 },
  { look: { skin: "#b07b58", shirt: "#5dade2", pants: "#2c3e50", hair: "#222" }, path: [[0, 34], [0, 14], [-14, 14], [-14, 30]], speed: 1.1 },
  { look: { skin: "#d7a985", shirt: "#f5b7b1", pants: "#5d6d7e", hair: "#ddd", dress: true }, path: [[22, 26], [22, 10], [10, 10]], speed: 0.7 },
  { look: { skin: "#9c6644", shirt: "#7d3c98", pants: "#1b2631", hair: "#000" }, path: [[-22, 26], [-8, 30], [-22, 10]], speed: 1.0 },
];

const BOUNDS = { x: 44, zMin: -27, zMax: 44 };

/** The visitor's avatar: click-to-walk or WASD/arrows; the camera follows. */
function Player({ target, controls }: { target: React.MutableRefObject<THREE.Vector3 | null>; controls: React.RefObject<OrbitImpl | null> }) {
  const ref = useRef<THREE.Group>(null);
  const walk = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const { camera } = useThree();
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      keys.current[e.key.toLowerCase()] = true;
    };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const before = g.position.clone();
    const k = keys.current;
    const fwd = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0);
    const side = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0);
    const speed = 6;
    let moving = false;
    if (fwd || side) {
      target.current = null;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      dir.y = 0;
      dir.normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
      const mv = dir.multiplyScalar(fwd).add(right.multiplyScalar(side)).normalize().multiplyScalar(speed * dt);
      g.position.add(mv);
      g.rotation.y = Math.atan2(mv.x, mv.z);
      moving = true;
    } else if (target.current) {
      const d = target.current.clone().sub(g.position);
      d.y = 0;
      const dist = d.length();
      if (dist < 0.15) target.current = null;
      else {
        g.position.add(d.normalize().multiplyScalar(Math.min(dist, speed * dt)));
        g.rotation.y = Math.atan2(d.x, d.z);
        moving = true;
      }
    }
    // stay in the garden and out of the fountain
    g.position.x = THREE.MathUtils.clamp(g.position.x, -BOUNDS.x, BOUNDS.x);
    g.position.z = THREE.MathUtils.clamp(g.position.z, BOUNDS.zMin, BOUNDS.zMax);
    const fc = new THREE.Vector2(g.position.x, g.position.z + 8);
    if (fc.length() < 4.8) {
      fc.setLength(4.8);
      g.position.x = fc.x;
      g.position.z = fc.y - 8;
    }
    walk.current = THREE.MathUtils.lerp(walk.current, moving ? 1 : 0, 0.2);
    const delta = g.position.clone().sub(before);
    camera.position.add(delta);
    controls.current?.target.add(delta);
  });
  return (
    <group ref={ref} position={[0, 0, 28]} rotation={[0, Math.PI, 0]}>
      <Person look={{ skin: "#c58c62", shirt: "#1f6fd1", pants: "#e8eef7", hair: "#2b1a0e" }} walkRef={walk} />
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.7, 24]} />
        <meshBasicMaterial color="#1f6fd1" />
      </mesh>
    </group>
  );
}

export function Garden({ lang, personas, activeNpc, onTalk, onEnter, wallRefresh }: {
  lang: Lang; personas: Record<string, Persona>; activeNpc: string | null;
  onTalk: (id: string) => void; onEnter: () => void; wallRefresh: number;
}) {
  const t = tr(lang);
  const target = useRef<THREE.Vector3 | null>(null);
  const controls = useRef<OrbitImpl | null>(null);
  const marker = useRef<THREE.Mesh>(null);

  const trees = useMemo(() => {
    const out: { p: [number, number, number]; s: number; c: boolean }[] = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const x = Math.cos(a) * 48, z = 8 + Math.sin(a) * 40;
      if (z < -28) continue;
      out.push({ p: [x, 0, z], s: 0.9 + Math.random() * 0.6, c: i % 4 === 0 });
    }
    for (const [x, z] of [[-30, 0], [30, 2], [-26, 24], [26, 26], [-36, 14], [36, -12], [-36, -16], [16, 34], [-12, 38]]) {
      out.push({ p: [x, 0, z], s: 1 + Math.random() * 0.5, c: Math.random() > 0.6 });
    }
    return out;
  }, []);

  return (
    <>
      <Sky sunPosition={[60, 80, 40]} turbidity={3} rayleigh={0.6} mieCoefficient={0.004} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#cfe8ff", "#5d8a4a", 0.6]} />
      <directionalLight
        position={[40, 60, 30]} intensity={2.4} castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-60} shadow-camera-right={60}
        shadow-camera-top={60} shadow-camera-bottom={-60} shadow-camera-far={200}
      />
      <fog attach="fog" args={["#d9ecff", 90, 200]} />
      <OrbitControls
        ref={controls} makeDefault target={[0, 1.5, 28]} enablePan={false}
        minDistance={6} maxDistance={45} maxPolarAngle={Math.PI / 2.15}
      />

      {/* lawn: click to walk */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]} receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          target.current = new THREE.Vector3(e.point.x, 0, e.point.z);
          marker.current?.position.set(e.point.x, 0.05, e.point.z);
        }}
      >
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color="#6fae4f" />
      </mesh>
      <mesh ref={marker} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]}>
        <ringGeometry args={[0.3, 0.45, 20]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* paths */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 8]} receiveShadow>
        <planeGeometry args={[5, 72]} />
        <meshStandardMaterial color="#d8d2c4" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.021, 14]} receiveShadow>
        <planeGeometry args={[70, 4]} />
        <meshStandardMaterial color="#d8d2c4" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, -8]} receiveShadow>
        <circleGeometry args={[8, 40]} />
        <meshStandardMaterial color="#d8d2c4" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.023, -26]} receiveShadow>
        <planeGeometry args={[70, 8]} />
        <meshStandardMaterial color="#bdbab3" />
      </mesh>

      {/* formal parterre like the photo */}
      {[-1, 1].map((sd) => (
        <group key={sd}>
          <Hedge position={[sd * 14, 0, -6]} size={[16, 0.8, 0.8]} />
          <Hedge position={[sd * 14, 0, 2]} size={[16, 0.8, 0.8]} />
          <Hedge position={[sd * 6.5, 0, -2]} size={[0.8, 0.8, 8]} />
          <Hedge position={[sd * 21.5, 0, -2]} size={[0.8, 0.8, 8]} />
          <Hedge position={[sd * 14, 0, -16]} size={[18, 0.7, 0.7]} />
          <Hedge position={[sd * 14, 0, -21]} size={[18, 0.7, 0.7]} />
          <FlowerBed center={[sd * 14, -2]} w={12} d={5} count={110} />
          <FlowerBed center={[sd * 14, -18.5]} w={14} d={2.8} count={70} colors={["#e63946", "#ffffff"]} />
          <Hedge position={[sd * 10, 0, 22]} size={[12, 0.9, 0.9]} />
          <FlowerBed center={[sd * 10, 26]} w={10} d={4} count={80} colors={["#ffd166", "#f78c6b", "#ffffff"]} />
        </group>
      ))}

      <Fountain position={[0, 0, -8]} />
      {/* benches around the fountain */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + 0.5;
        return (
          <group key={i} position={[Math.cos(a) * 7.2, 0, -8 + Math.sin(a) * 7.2]} rotation={[0, -a + Math.PI / 2, 0]}>
            <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[2.2, 0.12, 0.6]} /><meshStandardMaterial color="#8b5a2b" /></mesh>
            <mesh position={[0, 0.85, -0.28]} castShadow><boxGeometry args={[2.2, 0.5, 0.08]} /><meshStandardMaterial color="#8b5a2b" /></mesh>
            {[-0.9, 0.9].map((x) => <mesh key={x} position={[x, 0.25, 0]}><boxGeometry args={[0.1, 0.5, 0.5]} /><meshStandardMaterial color="#444" /></mesh>)}
          </group>
        );
      })}

      {trees.map((tr2, i) => <Tree key={i} position={tr2.p} scale={tr2.s} conifer={tr2.c} />)}

      <Hospital position={[0, 0, -40]} />
      {/* clickable entrance */}
      <mesh position={[0, 1.6, -39.8]} onClick={(e) => { e.stopPropagation(); onEnter(); }}
        onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "auto")}>
        <planeGeometry args={[6, 3.2]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
      <SignWall position={[-22, 0, 20]} rotation={0.55} />
      <Plaque position={[5, 0, 30]} rotation={-0.3} />
      <GratitudeWall position={[19, 0, -27]} rotation={-0.25} width={7} refresh={wallRefresh} title={t.wallTitle} empty={t.wallEmpty} anon={t.wallAnon} />

      <Birds count={10} center={[0, -5]} />

      {Object.entries(NPC_SPOTS).map(([id, s]) => personas[id] && (
        <Npc
          key={id} position={s.p} rotation={s.r} look={LOOKS[id]} name={personas[id].name}
          age={`${personas[id].age} ${t.yearsOld}`}
          role={lang === "es" ? personas[id].role_es : personas[id].role_en}
          onTalk={() => onTalk(id)} active={activeNpc === id}
        />
      ))}
      {AMBIENT.map((a, i) => <Walker key={i} look={a.look} path={a.path} speed={a.speed} offset={i} />)}

      <Player target={target} controls={controls} />
    </>
  );
}
