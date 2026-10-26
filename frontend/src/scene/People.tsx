import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export interface Look {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  scale?: number; // kids ~0.6
  coat?: boolean; // doctor's white coat
  cane?: boolean; // grandparent
  dress?: boolean;
}

/** A simple low-poly person built from primitives. `walk` 0..1 drives the stride. */
/** `seated` lowers the body onto a chair (seat ≈ 0.53 high) with bent legs. */
export function Person({ look, walkRef, seated = false }: { look: Look; walkRef?: React.MutableRefObject<number>; seated?: boolean }) {
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const seed = useRef(Math.random() * 10);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed.current;
    const moving = walkRef?.current ?? 0;
    const swing = Math.sin(t * 8) * 0.6 * moving;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.8 + Math.sin(t * 1.5) * 0.04;
    if (armR.current) armR.current.rotation.x = swing * 0.8 - Math.sin(t * 1.5) * 0.04;
    if (body.current) body.current.position.y = Math.abs(Math.sin(t * 8)) * 0.05 * moving + Math.sin(t * 2) * 0.01;
  });

  const s = look.scale ?? 1;
  return (
    <group scale={s}>
      <group ref={body}>
      <group position={[0, seated ? -0.655 : 0, 0]}>
        {/* legs */}
        {seated ? (
          [-0.13, 0.13].map((x) => (
            <group key={x}>
              <mesh position={[x, 1.2, 0.22]} castShadow>
                <boxGeometry args={[0.18, 0.18, 0.5]} />
                <meshStandardMaterial color={look.dress ? look.shirt : look.pants} />
              </mesh>
              <mesh position={[x, 0.93, 0.47]} castShadow>
                <boxGeometry args={[0.18, 0.55, 0.18]} />
                <meshStandardMaterial color={look.pants} />
              </mesh>
            </group>
          ))
        ) : (
          <>
            <mesh ref={legL} position={[-0.13, 0.85, 0]} castShadow>
              <boxGeometry args={[0.18, 0.85, 0.2]} />
              <meshStandardMaterial color={look.pants} />
            </mesh>
            <mesh ref={legR} position={[0.13, 0.85, 0]} castShadow>
              <boxGeometry args={[0.18, 0.85, 0.2]} />
              <meshStandardMaterial color={look.pants} />
            </mesh>
          </>
        )}
        {/* torso */}
        <mesh position={[0, 1.55, 0]} castShadow>
          <capsuleGeometry args={[0.27, 0.45, 4, 10]} />
          <meshStandardMaterial color={look.shirt} />
        </mesh>
        {look.dress && !seated && (
          <mesh position={[0, 1.05, 0]} castShadow>
            <coneGeometry args={[0.42, 0.8, 12]} />
            <meshStandardMaterial color={look.shirt} />
          </mesh>
        )}
        {look.coat && (
          <mesh position={[0, 1.3, 0]} castShadow>
            <cylinderGeometry args={[0.31, 0.36, 1.05, 12, 1, true]} />
            <meshStandardMaterial color="#ffffff" side={THREE.DoubleSide} />
          </mesh>
        )}
        {/* arms */}
        {[-1, 1].map((side) => (
          <group key={side} ref={side < 0 ? armL : armR} position={[side * 0.36, 1.85, 0]}>
            <mesh position={[0, -0.33, 0]} castShadow>
              <capsuleGeometry args={[0.075, 0.5, 4, 8]} />
              <meshStandardMaterial color={look.coat ? "#ffffff" : look.shirt} />
            </mesh>
            <mesh position={[0, -0.68, 0]}>
              <sphereGeometry args={[0.08, 8, 8]} />
              <meshStandardMaterial color={look.skin} />
            </mesh>
          </group>
        ))}
        {/* head */}
        <mesh position={[0, 2.18, 0]} castShadow>
          <sphereGeometry args={[0.24, 16, 16]} />
          <meshStandardMaterial color={look.skin} />
        </mesh>
        <mesh position={[0, 2.27, -0.03]}>
          <sphereGeometry args={[0.25, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={look.hair} />
        </mesh>
        {/* eyes */}
        {[-0.08, 0.08].map((x) => (
          <mesh key={x} position={[x, 2.2, 0.22]}>
            <sphereGeometry args={[0.03, 6, 6]} />
            <meshStandardMaterial color="#1b1b1b" />
          </mesh>
        ))}
        {look.coat && (
          <mesh position={[0, 1.6, 0.27]} rotation={[0.2, 0, 0]}>
            <torusGeometry args={[0.13, 0.015, 6, 16, Math.PI]} />
            <meshStandardMaterial color="#2a2a2a" />
          </mesh>
        )}
        {look.cane && !seated && (
          <mesh position={[0.48, 0.6, 0.15]} rotation={[0, 0, -0.1]}>
            <cylinderGeometry args={[0.025, 0.025, 1.2, 6]} />
            <meshStandardMaterial color="#5b3a1e" />
          </mesh>
        )}
      </group>
      </group>
    </group>
  );
}

/** Name tag drawn on a canvas and shown as a sprite: always faces the camera,
 *  scales with distance, and lives inside the 3D scene (so it never
 *  covers the chat or other panels). */
function NameTag({ position, name, age, role, highlight, onClick, onHover }: {
  position: [number, number, number]; name: string; age: string; role: string;
  highlight: boolean; onClick: () => void; onHover: (h: boolean) => void;
}) {
  const W = 512, H = 220;
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    const r = 28, x = 8, y = 30, w = W - 16, h = H - 40;
    ctx.fillStyle = highlight ? "#e8f1fc" : "rgba(255,255,255,0.96)";
    ctx.strokeStyle = "#1f5fbf";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
    ctx.font = "44px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("💬", W - 6, 50);
    ctx.textAlign = "center";
    ctx.fillStyle = "#163d73";
    ctx.font = "bold 50px Inter, system-ui, sans-serif";
    ctx.fillText(name, W / 2, 96, w - 40);
    ctx.fillStyle = "#7d8fa8";
    ctx.font = "34px Inter, system-ui, sans-serif";
    ctx.fillText(age, W / 2, 140, w - 40);
    ctx.fillStyle = "#5d6f8a";
    ctx.font = "34px Inter, system-ui, sans-serif";
    ctx.fillText(role, W / 2, 184, w - 40);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [name, age, role, highlight]);
  useEffect(() => () => texture.dispose(), [texture]);
  const k = highlight ? 3.6 : 3.2; // world units: tags shrink with distance, grow as you approach
  return (
    <sprite
      position={position}
      scale={[k, (k * H) / W, 1]}
      renderOrder={10}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerOver={(e) => { e.stopPropagation(); onHover(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { onHover(false); document.body.style.cursor = "auto"; }}
    >
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}

/** A character you can talk to: idles, faces the visitor, shows a name tag + 💬. */
export function Npc({
  position, look, name, age, role, onTalk, rotation = 0, active,
}: {
  position: [number, number, number]; look: Look; name: string; age: string; role: string;
  onTalk: () => void; rotation?: number; active: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <group
        onClick={(e) => { e.stopPropagation(); onTalk(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = "auto"; }}
      >
        <Person look={look} />
        {/* invisible, larger hit area */}
        <mesh position={[0, 1.2, 0]} visible={false}>
          <cylinderGeometry args={[0.6, 0.6, 2.6, 8]} />
        </mesh>
      </group>
      <NameTag
        position={[0, 2.5 * (look.scale ?? 1) + 1.1, 0]} name={name} age={age} role={role}
        highlight={hover || active} onClick={onTalk} onHover={setHover}
      />
    </group>
  );
}

/** Background people walking between waypoints (not interactive). */
export function Walker({ look, path, speed = 1.3, offset = 0 }: { look: Look; path: [number, number][]; speed?: number; offset?: number }) {
  const ref = useRef<THREE.Group>(null);
  const walk = useRef(1);
  const idx = useRef(offset % path.length);
  const pos = useRef(new THREE.Vector3(path[idx.current][0], 0, path[idx.current][1]));
  useFrame((_, dt) => {
    const target = path[(idx.current + 1) % path.length];
    const tx = target[0] - pos.current.x, tz = target[1] - pos.current.z;
    const d = Math.hypot(tx, tz);
    if (d < 0.2) idx.current = (idx.current + 1) % path.length;
    else {
      const step = Math.min(d, speed * dt);
      pos.current.x += (tx / d) * step;
      pos.current.z += (tz / d) * step;
      if (ref.current) {
        ref.current.position.copy(pos.current);
        ref.current.rotation.y = Math.atan2(tx, tz);
      }
    }
  });
  return (
    <group ref={ref} position={pos.current}>
      <Person look={look} walkRef={walk} />
    </group>
  );
}
