import { forwardRef, useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, MeshStandardMaterial, Group, MathUtils, DoubleSide } from "three";
import { Text } from "@react-three/drei";
import { Chess } from "chess.js";
import { ChessPiece3D } from "./ChessPiece3D";

interface ChessBoard3DProps {
  position: string;
  onSquareClick: (square: string) => void;
  selectedSquare: string | null;
  possibleMoves: string[];
  lastMove: { from: string; to: string } | null;
  visible?: boolean;
  hideBoard?: boolean;
}

// 3D piece heights for visual hierarchy - moved to ChessPiece3D component

const NEON_THEME = {
  lightSquare: "#15042e",
  darkSquare: "#020617",
  lightEmissive: "#6d28d9",
  darkEmissive: "#22d3ee",
  moveEmissive: "#06b6d4",
  selectedEmissive: "#f472b6",
  lastMoveEmissive: "#f97316",
};

function ChessSquare({
  x,
  y,
  isLight,
  isSelected, 
  isPossibleMove, 
  isLastMove, 
  piece, 
  square,
  onClick 
}: {
  x: number;
  y: number;
  isLight: boolean;
  isSelected: boolean;
  isPossibleMove: boolean;
  isLastMove: boolean;
  piece: string | null;
  square: string;
  onClick: () => void;
}) {
  const squareRef = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const glowRingRef = useRef<Mesh>(null);

  const emissiveColor = useMemo(() => {
    if (isSelected) {
      return NEON_THEME.selectedEmissive;
    }
    if (isPossibleMove) {
      return NEON_THEME.moveEmissive;
    }
    if (isLastMove) {
      return NEON_THEME.lastMoveEmissive;
    }
    return isLight ? NEON_THEME.lightEmissive : NEON_THEME.darkEmissive;
  }, [isLight, isLastMove, isPossibleMove, isSelected]);

  const ringColor = useMemo(() => {
    if (isSelected) {
      return "#f472b6";
    }
    if (isPossibleMove) {
      return "#22d3ee";
    }
    if (isLastMove) {
      return "#f97316";
    }
    return isLight ? "#7c3aed" : "#0ea5e9";
  }, [isLight, isLastMove, isPossibleMove, isSelected]);

  useFrame((state) => {
    if (squareRef.current) {
      const basePulse = Math.sin(state.clock.elapsedTime * 2) * 0.02;
      if (isSelected) {
        squareRef.current.position.y = 0.08 + basePulse;
      } else if (isPossibleMove) {
        squareRef.current.position.y = 0.04 + basePulse * 0.6;
      } else if (hovered) {
        squareRef.current.position.y = 0.02 + basePulse * 0.3;
      } else {
        squareRef.current.position.y = 0;
      }
    }

    if (materialRef.current) {
      const basePulse = 0.25 + Math.sin(state.clock.elapsedTime * 1.8) * 0.05;
      let targetIntensity = hovered ? 0.4 : basePulse;

      if (isPossibleMove) {
        targetIntensity = 0.85 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
      }

      if (isLastMove) {
        targetIntensity = 0.7;
      }

      if (isSelected) {
        targetIntensity = 1.25 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
      }

      materialRef.current.emissiveIntensity = MathUtils.lerp(
        materialRef.current.emissiveIntensity ?? targetIntensity,
        targetIntensity,
        0.12
      );
    }

    if (glowRingRef.current) {
      const baseScale = isSelected ? 1.15 : isPossibleMove ? 1.08 : 1.02;
      const pulse = Math.sin(state.clock.elapsedTime * 4) * 0.05;
      glowRingRef.current.scale.setScalar(baseScale + pulse);
      glowRingRef.current.visible = isSelected || isPossibleMove || isLastMove;
    }
  });

  const squareColor = isLight ? NEON_THEME.lightSquare : NEON_THEME.darkSquare;
  const pieceColor = piece && piece === piece.toUpperCase() ? "#f8f8f8" : "#2c2c2c";

  return (
    <group position={[x - 3.5, 0, y - 3.5]}>
      {/* Square */}
      <mesh
        ref={squareRef}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        scale={hovered ? 1.05 : 1}
      >
        <boxGeometry args={[0.9, 0.1, 0.9]} />
        <meshStandardMaterial
          ref={materialRef}
          color={squareColor}
          emissive={emissiveColor}
          emissiveIntensity={isSelected ? 1.2 : 0.35}
          metalness={0.6}
          roughness={0.35}
        />
      </mesh>

      {/* Neon glow ring */}
      <mesh
        ref={glowRingRef}
        position={[0, 0.08, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        visible={isSelected || isPossibleMove || isLastMove}
      >
        <ringGeometry args={[0.28, 0.44, 48]} />
        <meshBasicMaterial color={ringColor} transparent opacity={0.55} side={DoubleSide} />
      </mesh>

      {/* Possible move indicator */}
      {isPossibleMove && !piece && (
        <mesh position={[0, 0.15, 0]}>
          <sphereGeometry args={[0.15, 8, 6]} />
          <meshStandardMaterial
            color="#0ea5e9"
            emissive="#22d3ee"
            emissiveIntensity={1.4}
            metalness={0.8}
            roughness={0.1}
            transparent
            opacity={0.85}
          />
        </mesh>
      )}

      {/* 3D Chess Piece */}
      {piece && (
        <ChessPiece3D
          piece={piece === piece.toUpperCase() ? piece.toUpperCase() : piece.toLowerCase()}
          position={[0, 0, 0]}
          isSelected={isSelected}
          onClick={onClick}
        />
      )}

      {/* Square label */}
      {x === 0 && (
        <Text
          position={[-0.6, 0.22, 0]}
          fontSize={0.2}
          color="#a855f7"
          anchorX="center"
          anchorY="middle"
          rotation={[-Math.PI / 2, 0, 0]}
          >
          {8 - y}
        </Text>
      )}
      {y === 7 && (
        <Text
          position={[0, 0.22, 0.6]}
          fontSize={0.2}
          color="#22d3ee"
          anchorX="center"
          anchorY="middle"
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {String.fromCharCode(97 + x)}
        </Text>
      )}
    </group>
  );
}

export const ChessBoard3D = forwardRef<Group, ChessBoard3DProps>(
  ({ position, onSquareClick, selectedSquare, possibleMoves, lastMove, visible = true, hideBoard = false }, ref) => {
    const groupRef = useRef<Group>(null);
    
    // Parse FEN position
    const chess = useMemo(() => {
      const game = new Chess();
      try {
        game.load(position);
      } catch {
        // Fallback to starting position
      }
      return game;
    }, [position]);

    const board = chess.board();

    const squares = [];
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const square = String.fromCharCode(97 + file) + (8 - rank);
        const piece = board[rank][file];
        const isLight = (rank + file) % 2 === 0;
        const isSelected = selectedSquare === square;
        const isPossibleMove = possibleMoves.includes(square);
        const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);

        squares.push(
          <ChessSquare
            key={square}
            x={file}
            y={rank}
            isLight={isLight}
            isSelected={isSelected}
            isPossibleMove={isPossibleMove}
            isLastMove={!!isLastMove}
            piece={piece ? (piece.color === 'w' ? piece.type.toUpperCase() : piece.type.toLowerCase()) : null}
            square={square}
            onClick={() => onSquareClick(square)}
          />
        );
      }
    }

    return (
      <group ref={ref || groupRef} visible={visible}>
        {!hideBoard && (
          <>
            {/* Board base */}
            <mesh position={[0, -0.35, 0]}>
              <boxGeometry args={[9.5, 0.5, 9.5]} />
              <meshStandardMaterial
                color="#020617"
                metalness={0.8}
                roughness={0.2}
                emissive="#1e1b4b"
                emissiveIntensity={0.45}
              />
            </mesh>

            {/* Neon frame */}
            <mesh position={[0, -0.1, 0]}>
              <boxGeometry args={[10, 0.12, 10]} />
              <meshStandardMaterial
                color="#0b1120"
                metalness={0.95}
                roughness={0.15}
                emissive="#22d3ee"
                emissiveIntensity={0.9}
              />
            </mesh>

            {/* Floating border glow */}
            <mesh position={[0, 0.25, 0]}>
              <boxGeometry args={[8.9, 0.02, 8.9]} />
              <meshStandardMaterial
                color="#111827"
                metalness={0.6}
                roughness={0.3}
                emissive="#7c3aed"
                emissiveIntensity={0.6}
              />
            </mesh>

            <pointLight position={[4, 3, 4]} intensity={0.55} color="#22d3ee" distance={10} />
            <pointLight position={[-4, 3, -4]} intensity={0.5} color="#f472b6" distance={10} />
          </>
        )}

        {squares}
      </group>
    );
  }
);

ChessBoard3D.displayName = "ChessBoard3D";