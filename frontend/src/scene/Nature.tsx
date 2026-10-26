import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const leaf = new THREE.MeshStandardMaterial({ color: "#3d7d3a" });
const leafDark = new THREE.MeshStandardMaterial({ color: "#2e6a33" });
const bark = new THREE.MeshStandardMaterial({ color: "#6b4a2b" });
const hedgeMat = new THREE.MeshStandardMaterial({ color: "#2f6b2f" });

export function Tree({ position, scale = 1, conifer = false }: { position: [number, number, number]; scale?: number; conifer?: boolean }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.2, 0]} material={bark} castShadow>
        <cylinderGeometry args={[0.18, 0.28, 2.4, 7]} />
      </mesh>
      {conifer ? (
        <>
          <mesh position={[0, 3.2, 0]} material={leafDark} castShadow>
            <coneGeometry args={[1.5, 3.2, 8]} />
          </mesh>
          <mesh position={[0, 4.6, 0]} material={leafDark} castShadow>
            <coneGeometry args={[1.05, 2.4, 8]} />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 3.3, 0]} material={leaf} castShadow>
            <icosahedronGeometry args={[1.6, 1]} />
          </mesh>
          <mesh position={[0.8, 2.8, 0.3]} material={leafDark} castShadow>
            <icosahedronGeometry args={[1.0, 1]} />
          </mesh>
          <mesh position={[-0.7, 3.0, -0.4]} material={leaf} castShadow>
            <icosahedronGeometry args={[1.1, 1]} />
          </mesh>
        </>
      )}
    </group>
  );
}

export function Hedge({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={[position[0], position[1] + size[1] / 2, position[2]]} material={hedgeMat} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

/** Flowers as one instanced mesh (cheap). */
export function FlowerBed({ center, w, d, count = 80, colors = ["#e63946", "#ff8fab", "#ffd166", "#ffffff"] }: {
  center: [number, number]; w: number; d: number; count?: number; colors?: string[];
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => Array.from({ length: count }, () => ({
    x: center[0] + (Math.random() - 0.5) * w,
    z: center[1] + (Math.random() - 0.5) * d,
    c: new THREE.Color(colors[Math.floor(Math.random() * colors.length)]),
  })), [center, w, d, count, colors]);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    data.forEach((f, i) => {
      m.setPosition(f.x, 0.35, f.z);
      ref.current?.setMatrixAt(i, m);
      ref.current?.setColorAt(i, f.c);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    }
  }, [data]);
  return (
    <group>
      <mesh position={[center[0], 0.12, center[1]]} receiveShadow>
        <boxGeometry args={[w + 0.4, 0.24, d + 0.4]} />
        <meshStandardMaterial color="#5a3d26" />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]}>
        <sphereGeometry args={[0.16, 6, 6]} />
        <meshStandardMaterial />
      </instancedMesh>
    </group>
  );
}

/** Two-tier fountain with animated water droplets. */
export function Fountain({ position }: { position: [number, number, number] }) {
  const N = 220;
  const ref = useRef<THREE.InstancedMesh>(null);
  const drops = useMemo(() => Array.from({ length: N }, () => ({
    t: Math.random() * 1.6,
    a: Math.random() * Math.PI * 2,
    v: 1.4 + Math.random() * 0.8,
  })), []);
  const m = useMemo(() => new THREE.Matrix4(), []);
  const water = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, dt) => {
    drops.forEach((d, i) => {
      d.t += dt;
      if (d.t > 1.6) { d.t = 0; d.a = Math.random() * Math.PI * 2; }
      const r = d.v * d.t;
      const y = 3.6 + 3.2 * d.t - 4.9 * d.t * d.t;
      m.setPosition(Math.cos(d.a) * r, Math.max(y, 0.7), Math.sin(d.a) * r);
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
    if (water.current) water.current.position.y = 0.72 + Math.sin(clock.elapsedTime * 2) * 0.015;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.4, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[4, 4.2, 0.8, 40]} />
        <meshStandardMaterial color="#d8d4cc" />
      </mesh>
      <mesh ref={water} position={[0, 0.72, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.7, 40]} />
        <meshStandardMaterial color="#4aa3df" transparent opacity={0.85} roughness={0.1} metalness={0.2} />
      </mesh>
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.5, 2.6, 16]} />
        <meshStandardMaterial color="#d8d4cc" />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow>
        <cylinderGeometry args={[1.5, 0.6, 0.4, 24]} />
        <meshStandardMaterial color="#e2ded6" />
      </mesh>
      <mesh position={[0, 3.31, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.35, 24]} />
        <meshStandardMaterial color="#5bb4ea" transparent opacity={0.85} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, N]}>
        <sphereGeometry args={[0.06, 5, 5]} />
        <meshStandardMaterial color="#bfe6ff" transparent opacity={0.85} />
      </instancedMesh>
    </group>
  );
}

/** A flock of birds circling with flapping wings. */
export function Birds({ count = 9, center = [0, 0] as [number, number] }) {
  const birds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    r: 14 + Math.random() * 18,
    h: 14 + Math.random() * 10,
    speed: 0.15 + Math.random() * 0.15,
    phase: (i / count) * Math.PI * 2,
    dir: i % 3 === 0 ? -1 : 1,
  })), [count]);
  return <>{birds.map((b, i) => <Bird key={i} {...b} center={center} />)}</>;
}

function Bird({ r, h, speed, phase, dir, center }: { r: number; h: number; speed: number; phase: number; dir: number; center: [number, number] }) {
  const g = useRef<THREE.Group>(null);
  const wl = useRef<THREE.Group>(null);
  const wr = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed * dir + phase;
    if (g.current) {
      g.current.position.set(center[0] + Math.cos(t) * r, h + Math.sin(t * 3) * 0.8, center[1] + Math.sin(t) * r);
      g.current.rotation.y = -t - (dir > 0 ? 0 : Math.PI);
    }
    const flap = Math.sin(clock.elapsedTime * 12 + phase * 5) * 0.7;
    if (wl.current) wl.current.rotation.z = flap;
    if (wr.current) wr.current.rotation.z = -flap;
  });
  return (
    <group ref={g}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.6, 5]} />
        <meshStandardMaterial color="#3b3b44" />
      </mesh>
      <group ref={wl}>
        <mesh position={[-0.45, 0, 0]}>
          <boxGeometry args={[0.9, 0.02, 0.25]} />
          <meshStandardMaterial color="#2c2c33" />
        </mesh>
      </group>
      <group ref={wr}>
        <mesh position={[0.45, 0, 0]}>
          <boxGeometry args={[0.9, 0.02, 0.25]} />
          <meshStandardMaterial color="#2c2c33" />
        </mesh>
      </group>
    </group>
  );
}
