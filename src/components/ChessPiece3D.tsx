import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Mesh,
  Group,
  MeshStandardMaterial,
  MeshBasicMaterial,
  MathUtils,
  DoubleSide,
} from 'three';

interface ChessPiece3DProps {
  piece: string;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}

// 3D piece heights for visual hierarchy
const PIECE_HEIGHTS = {
  'K': 1.4, 'Q': 1.3, 'R': 1.0, 'B': 1.1, 'N': 1.1, 'P': 0.7,
  'k': 1.4, 'q': 1.3, 'r': 1.0, 'b': 1.1, 'n': 1.1, 'p': 0.7,
};

const WHITE_NEON = {
  base: '#e0f2fe',
  accent: '#c4b5fd',
  emissive: '#7dd3fc',
  glow: '#60a5fa',
  ring: '#38bdf8',
  selection: '#22d3ee',
} as const;

const BLACK_NEON = {
  base: '#0f172a',
  accent: '#f472b6',
  emissive: '#f472b6',
  glow: '#be123c',
  ring: '#fb7185',
  selection: '#f43f5e',
} as const;

export function ChessPiece3D({ piece, position, isSelected, onClick }: ChessPiece3DProps) {
  const groupRef = useRef<Group>(null);
  const glowRingRef = useRef<Mesh>(null);
  const glowMaterialRef = useRef<MeshBasicMaterial>(null);
  const isWhite = piece === piece.toUpperCase();
  const pieceType = piece.toLowerCase();

  const palette = useMemo(() => (isWhite ? WHITE_NEON : BLACK_NEON), [isWhite]);

  const baseMaterialProps = useMemo(
    () => ({
      color: palette.base,
      metalness: 0.85,
      roughness: 0.25,
      emissive: palette.emissive,
      emissiveIntensity: 0.6,
    }),
    [palette]
  );

  const accentMaterialProps = useMemo(
    () => ({
      color: palette.accent,
      metalness: 0.9,
      roughness: 0.15,
      emissive: palette.glow,
      emissiveIntensity: 0.8,
    }),
    [palette]
  );

  useFrame((state) => {
    if (groupRef.current) {
      if (isSelected) {
        groupRef.current.position.y = PIECE_HEIGHTS[piece] + 0.3 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
        groupRef.current.rotation.y = state.clock.elapsedTime * 0.5;
      } else {
        groupRef.current.position.y = PIECE_HEIGHTS[piece];
        groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      }

      groupRef.current.traverse((child) => {
        if ((child as Mesh).isMesh) {
          const mesh = child as Mesh;
          const material = mesh.material;

          const updateMaterial = (mat: MeshStandardMaterial) => {
            if (!mat.isMeshStandardMaterial) return;
            const base = isWhite ? 0.55 : 0.65;
            const pulse = Math.sin(state.clock.elapsedTime * 2 + (isWhite ? 0 : Math.PI / 2)) * 0.12;
            const selectedBoost = isSelected ? 0.9 : 0;
            mat.emissiveIntensity = MathUtils.lerp(
              mat.emissiveIntensity ?? base,
              base + pulse + selectedBoost,
              0.08
            );
          };

          if (Array.isArray(material)) {
            material.forEach((mat) => updateMaterial(mat as MeshStandardMaterial));
          } else if ((material as MeshStandardMaterial)?.isMeshStandardMaterial) {
            updateMaterial(material as MeshStandardMaterial);
          }
        }
      });
    }

    if (glowRingRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.05;
      glowRingRef.current.scale.setScalar(scale);
    }

    if (glowMaterialRef.current) {
      const baseOpacity = isSelected ? 0.75 : 0.45;
      glowMaterialRef.current.opacity = baseOpacity + Math.sin(state.clock.elapsedTime * 2.5) * 0.1;
    }
  });

  const renderPieceGeometry = () => {
    switch (pieceType) {
      case 'k': // King
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.6, 0]}>
              <cylinderGeometry args={[0.4, 0.5, 0.3, 12]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Body */}
            <mesh position={[0, -0.2, 0]}>
              <cylinderGeometry args={[0.35, 0.4, 0.6, 12]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 0.2, 0]}>
              <sphereGeometry args={[0.25, 12, 8]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
            {/* Crown cross */}
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[0.05, 0.3, 0.05]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
            <mesh position={[0, 0.4, 0]}>
              <boxGeometry args={[0.3, 0.05, 0.05]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
          </group>
        );

      case 'q': // Queen
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.6, 0]}>
              <cylinderGeometry args={[0.4, 0.45, 0.3, 12]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Body */}
            <mesh position={[0, -0.15, 0]}>
              <cylinderGeometry args={[0.3, 0.4, 0.7, 12]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Crown */}
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[0.15, 0.3, 0.3, 8]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
            {/* Crown spikes */}
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <mesh
                key={i}
                position={[
                  Math.cos(i * Math.PI / 4) * 0.25,
                  0.6,
                  Math.sin(i * Math.PI / 4) * 0.25
                ]}
              >
                <coneGeometry args={[0.03, 0.15, 4]} />
                <meshStandardMaterial {...accentMaterialProps} />
              </mesh>
            ))}
          </group>
        );

      case 'r': // Rook
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.4, 0]}>
              <cylinderGeometry args={[0.35, 0.4, 0.3, 8]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Tower */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.6, 0.8, 0.6]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Battlements */}
            <mesh position={[0.15, 0.5, 0.15]}>
              <boxGeometry args={[0.1, 0.2, 0.1]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
            <mesh position={[-0.15, 0.5, 0.15]}>
              <boxGeometry args={[0.1, 0.2, 0.1]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
            <mesh position={[0.15, 0.5, -0.15]}>
              <boxGeometry args={[0.1, 0.2, 0.1]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
            <mesh position={[-0.15, 0.5, -0.15]}>
              <boxGeometry args={[0.1, 0.2, 0.1]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
          </group>
        );

      case 'b': // Bishop
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.5, 0]}>
              <cylinderGeometry args={[0.3, 0.35, 0.3, 12]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Body */}
            <mesh position={[0, -0.1, 0]}>
              <cylinderGeometry args={[0.15, 0.3, 0.6, 12]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 0.3, 0]}>
              <sphereGeometry args={[0.2, 12, 8]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
            {/* Mitre */}
            <mesh position={[0, 0.5, 0]} rotation={[0, 0, Math.PI / 6]}>
              <coneGeometry args={[0.1, 0.25, 6]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
          </group>
        );

      case 'n': // Knight
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.5, 0]}>
              <cylinderGeometry args={[0.3, 0.35, 0.3, 12]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Horse body */}
            <mesh position={[0, -0.1, 0.1]}>
              <boxGeometry args={[0.4, 0.6, 0.5]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Horse head */}
            <mesh position={[0, 0.2, -0.2]} rotation={[-0.3, 0, 0]}>
              <boxGeometry args={[0.3, 0.4, 0.6]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
            {/* Ears */}
            <mesh position={[-0.1, 0.45, -0.4]}>
              <coneGeometry args={[0.05, 0.15, 4]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
            <mesh position={[0.1, 0.45, -0.4]}>
              <coneGeometry args={[0.05, 0.15, 4]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
          </group>
        );

      case 'p': // Pawn
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.3, 0]}>
              <cylinderGeometry args={[0.2, 0.25, 0.2, 12]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Body */}
            <mesh position={[0, 0, 0]}>
              <cylinderGeometry args={[0.15, 0.2, 0.4, 12]} />
              <meshStandardMaterial {...baseMaterialProps} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 0.25, 0]}>
              <sphereGeometry args={[0.15, 12, 8]} />
              <meshStandardMaterial {...accentMaterialProps} />
            </mesh>
          </group>
        );

      default:
        return (
          <mesh>
            <sphereGeometry args={[0.2, 8, 6]} />
            <meshStandardMaterial {...baseMaterialProps} />
          </mesh>
        );
    }
  };

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={onClick}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'default';
      }}
    >
      {renderPieceGeometry()}

      {/* Ambient neon aura */}
      <mesh
        ref={glowRingRef}
        position={[0, -0.68, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <ringGeometry args={[0.2, 0.55, 64]} />
        <meshBasicMaterial
          ref={glowMaterialRef}
          color={palette.ring}
          transparent
          opacity={0.45}
          side={DoubleSide}
        />
      </mesh>

      {/* Selection glow effect */}
      {isSelected && (
        <mesh position={[0, -0.7, 0]}>
          <cylinderGeometry args={[0.65, 0.65, 0.08, 24]} />
          <meshStandardMaterial
            color={palette.selection}
            emissive={palette.selection}
            emissiveIntensity={1.5}
            metalness={0.4}
            roughness={0.2}
            transparent
            opacity={0.85}
          />
        </mesh>
      )}

      {/* Subtle ambient lighting for the piece */}
      <pointLight
        position={[0, 1, 0]}
        intensity={0.45}
        color={palette.ring}
        distance={2}
      />
    </group>
  );
}