import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import { Mesh, Group, BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry } from 'three';

interface ChessPiece3DProps {
  piece: string;
  position: [number, number, number];
  isSelected: boolean;
  onClick: () => void;
}

// 3D piece heights for visual hierarchy
const PIECE_HEIGHTS = {
  'K': 1.4, 'Q': 1.3, 'R': 1.0, 'B': 1.1, 'N': 1.1, 'P': 0.7,
  'k': 1.4, 'q': 1.3, 'r': 1.0, 'b': 1.1, 'n': 1.1, 'p': 0.7
};

export function ChessPiece3D({ piece, position, isSelected, onClick }: ChessPiece3DProps) {
  const groupRef = useRef<Group>(null);
  const isWhite = piece === piece.toUpperCase();
  const pieceType = piece.toLowerCase();
  
  useFrame((state) => {
    if (groupRef.current) {
      if (isSelected) {
        groupRef.current.position.y = PIECE_HEIGHTS[piece] + 0.3 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
        groupRef.current.rotation.y = state.clock.elapsedTime * 0.5;
      } else {
        groupRef.current.position.y = PIECE_HEIGHTS[piece];
        groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.1;
      }
    }
  });

  const baseColor = isWhite ? '#f8f8f8' : '#2c2c2c';
  const accentColor = isWhite ? '#e8e8e8' : '#1c1c1c';

  const renderPieceGeometry = () => {
    switch (pieceType) {
      case 'k': // King
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.6, 0]}>
              <cylinderGeometry args={[0.4, 0.5, 0.3, 12]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Body */}
            <mesh position={[0, -0.2, 0]}>
              <cylinderGeometry args={[0.35, 0.4, 0.6, 12]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 0.2, 0]}>
              <sphereGeometry args={[0.25, 12, 8]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Crown cross */}
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[0.05, 0.3, 0.05]} />
              <meshLambertMaterial color={accentColor} />
            </mesh>
            <mesh position={[0, 0.4, 0]}>
              <boxGeometry args={[0.3, 0.05, 0.05]} />
              <meshLambertMaterial color={accentColor} />
            </mesh>
          </group>
        );
      
      case 'q': // Queen
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.6, 0]}>
              <cylinderGeometry args={[0.4, 0.45, 0.3, 12]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Body */}
            <mesh position={[0, -0.15, 0]}>
              <cylinderGeometry args={[0.3, 0.4, 0.7, 12]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Crown */}
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[0.15, 0.3, 0.3, 8]} />
              <meshLambertMaterial color={baseColor} />
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
                <meshLambertMaterial color={accentColor} />
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
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Tower */}
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[0.6, 0.8, 0.6]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Battlements */}
            <mesh position={[0.15, 0.5, 0.15]}>
              <boxGeometry args={[0.1, 0.2, 0.1]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            <mesh position={[-0.15, 0.5, 0.15]}>
              <boxGeometry args={[0.1, 0.2, 0.1]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            <mesh position={[0.15, 0.5, -0.15]}>
              <boxGeometry args={[0.1, 0.2, 0.1]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            <mesh position={[-0.15, 0.5, -0.15]}>
              <boxGeometry args={[0.1, 0.2, 0.1]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
          </group>
        );
      
      case 'b': // Bishop
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.5, 0]}>
              <cylinderGeometry args={[0.3, 0.35, 0.3, 12]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Body */}
            <mesh position={[0, -0.1, 0]}>
              <cylinderGeometry args={[0.15, 0.3, 0.6, 12]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 0.3, 0]}>
              <sphereGeometry args={[0.2, 12, 8]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Mitre */}
            <mesh position={[0, 0.5, 0]} rotation={[0, 0, Math.PI / 6]}>
              <coneGeometry args={[0.1, 0.25, 6]} />
              <meshLambertMaterial color={accentColor} />
            </mesh>
          </group>
        );
      
      case 'n': // Knight
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.5, 0]}>
              <cylinderGeometry args={[0.3, 0.35, 0.3, 12]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Horse body */}
            <mesh position={[0, -0.1, 0.1]}>
              <boxGeometry args={[0.4, 0.6, 0.5]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Horse head */}
            <mesh position={[0, 0.2, -0.2]} rotation={[-0.3, 0, 0]}>
              <boxGeometry args={[0.3, 0.4, 0.6]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Ears */}
            <mesh position={[-0.1, 0.45, -0.4]}>
              <coneGeometry args={[0.05, 0.15, 4]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            <mesh position={[0.1, 0.45, -0.4]}>
              <coneGeometry args={[0.05, 0.15, 4]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
          </group>
        );
      
      case 'p': // Pawn
        return (
          <group>
            {/* Base */}
            <mesh position={[0, -0.3, 0]}>
              <cylinderGeometry args={[0.2, 0.25, 0.2, 12]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Body */}
            <mesh position={[0, 0, 0]}>
              <cylinderGeometry args={[0.15, 0.2, 0.4, 12]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 0.25, 0]}>
              <sphereGeometry args={[0.15, 12, 8]} />
              <meshLambertMaterial color={baseColor} />
            </mesh>
          </group>
        );
      
      default:
        return (
          <mesh>
            <sphereGeometry args={[0.2, 8, 6]} />
            <meshLambertMaterial color={baseColor} />
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
      
      {/* Selection glow effect */}
      {isSelected && (
        <mesh position={[0, -0.7, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.05, 16]} />
          <meshLambertMaterial 
            color="#ffd700" 
            transparent 
            opacity={0.6}
            emissive="#ffd700"
            emissiveIntensity={0.3}
          />
        </mesh>
      )}
      
      {/* Subtle ambient lighting for the piece */}
      <pointLight 
        position={[0, 1, 0]} 
        intensity={0.3} 
        color={isWhite ? "#ffffff" : "#cccccc"} 
        distance={2}
      />
    </group>
  );
}