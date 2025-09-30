import { forwardRef, useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, BoxGeometry, MeshLambertMaterial, Group } from "three";
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

  useFrame((state) => {
    if (squareRef.current) {
      // Subtle animation for selected/highlighted squares
      if (isSelected) {
        squareRef.current.position.y = 0.05 + Math.sin(state.clock.elapsedTime * 3) * 0.02;
      } else if (isPossibleMove) {
        squareRef.current.position.y = 0.02 + Math.sin(state.clock.elapsedTime * 2) * 0.01;
      } else {
        squareRef.current.position.y = 0;
      }
    }
  });

  const squareColor = isLight 
    ? (isSelected ? '#ffd700' : isLastMove ? '#ffeb3b' : isPossibleMove ? '#81c784' : '#f5f5dc')
    : (isSelected ? '#b8860b' : isLastMove ? '#fbc02d' : isPossibleMove ? '#66bb6a' : '#8b4513');

  const pieceColor = piece && piece === piece.toUpperCase() ? '#f8f8f8' : '#2c2c2c';

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
        <meshLambertMaterial color={squareColor} />
      </mesh>

      {/* Possible move indicator */}
      {isPossibleMove && !piece && (
        <mesh position={[0, 0.15, 0]}>
          <sphereGeometry args={[0.15, 8, 6]} />
          <meshLambertMaterial color="#4caf50" transparent opacity={0.7} />
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
          position={[-0.6, 0.2, 0]}
          fontSize={0.2}
          color="#666"
          anchorX="center"
          anchorY="middle"
          rotation={[-Math.PI / 2, 0, 0]}
        >
          {8 - y}
        </Text>
      )}
      {y === 7 && (
        <Text
          position={[0, 0.2, 0.6]}
          fontSize={0.2}
          color="#666"
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
            <mesh position={[0, -0.2, 0]}>
              <boxGeometry args={[8.5, 0.3, 8.5]} />
              <meshLambertMaterial color="#8b4513" />
            </mesh>

            {/* Border */}
            <mesh position={[0, -0.1, 0]}>
              <boxGeometry args={[9, 0.1, 9]} />
              <meshLambertMaterial color="#654321" />
            </mesh>
          </>
        )}

        {squares}
      </group>
    );
  }
);

ChessBoard3D.displayName = "ChessBoard3D";