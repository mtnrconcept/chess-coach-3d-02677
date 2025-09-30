/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Environment } from "@react-three/drei";
import { FbxChessSet } from "@/components/FbxChessSet";
import { Chess } from "chess.js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, RotateCcw, Flag, MessageCircle } from "lucide-react";
import { ChessBoard3D } from "@/components/ChessBoard3D";
import { GameTimer } from "@/components/GameTimer";
import { MoveHistory } from "@/components/MoveHistory";
import { CoachingPanel } from "@/components/CoachingPanel";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

function AnimatedCamera() {
  const cameraRef = useRef<any>(null);
  const controlsRef = useRef<any>(null);

  useFrame((state) => {
    const t = Math.min(state.clock.getElapsedTime(), 6);
    const angle = (t / 6) * Math.PI * 2;
    const radius = 8;
    if (cameraRef.current) {
      cameraRef.current.position.x = Math.sin(angle) * radius;
      cameraRef.current.position.z = Math.cos(angle) * radius;
      cameraRef.current.lookAt(0, 0, 0);
    }
    if (controlsRef.current) {
      controlsRef.current.enabled = t >= 6;
    }
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[8, 8, 8]} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        maxPolarAngle={Math.PI / 2.2}
        minPolarAngle={Math.PI / 6}
        maxDistance={15}
        minDistance={5}
      />
    </>
  );
}

export default function ChessGame() {
  const location = useLocation();
  const navigate = useNavigate();
  const gameState = location.state || {};
  
  const [chess] = useState(new Chess());
  const [gamePosition, setGamePosition] = useState(chess.fen());
  const [currentPlayer, setCurrentPlayer] = useState<'w' | 'b'>('w');
  const [gameStatus, setGameStatus] = useState<'playing' | 'checkmate' | 'draw' | 'resignation'>('playing');
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [moveHistory, setMoveHistory] = useState<any[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [coachingComment, setCoachingComment] = useState<string>("");
  
  // Timer states
  const [whiteTime, setWhiteTime] = useState(gameState.timeControl?.minutes * 60 || 300);
  const [blackTime, setBlackTime] = useState(gameState.timeControl?.minutes * 60 || 300);
  const [isWhiteTurn, setIsWhiteTurn] = useState(true);

  const boardRef = useRef<any>();

  useEffect(() => {
    if (!gameState.timeControl) {
      navigate("/");
      return;
    }
    
    toast.success(`Partie commencée : ${gameState.timeControl.time}`);
    
    if (gameState.coachingMode) {
      setCoachingComment("Excellente ouverture ! Commencez par contrôler le centre avec e4 ou d4.");
    }
  }, []);

  const handleSquareClick = async (square: string) => {
    if (gameStatus !== 'playing' || currentPlayer === 'b') return;

    try {
      if (selectedSquare === square) {
        // Deselect
        setSelectedSquare(null);
        setPossibleMoves([]);
        return;
      }

      if (selectedSquare && possibleMoves.includes(square)) {
        // Make move
        const move = chess.move({
          from: selectedSquare,
          to: square,
          promotion: 'q', // Auto-promotion to queen
        });

        if (move) {
          setGamePosition(chess.fen());
          setLastMove({ from: selectedSquare, to: square });
          setMoveHistory([...moveHistory, move]);
          setCurrentPlayer(chess.turn());
          setIsWhiteTurn(!isWhiteTurn);
          
          // Check game status
          if (chess.isCheckmate()) {
            setGameStatus('checkmate');
            toast.success(chess.turn() === 'b' ? "Échec et mat ! Vous gagnez !" : "Échec et mat ! L'ordinateur gagne !");
          } else if (chess.isDraw()) {
            setGameStatus('draw');
            toast.info("Partie nulle !");
          }

          // Coaching mode comment
          if (gameState.coachingMode) {
            analyzeMove(move);
          }

          // AI move after small delay
          if (!chess.isGameOver()) {
            setTimeout(() => makeAIMove(), 1000);
          }
        }
        
        setSelectedSquare(null);
        setPossibleMoves([]);
      } else {
        // Select square
        const piece = chess.get(square as any);
        if (piece && piece.color === currentPlayer) {
          setSelectedSquare(square);
          const moves = chess.moves({ square: square as any, verbose: true });
          setPossibleMoves(moves.map((move: any) => move.to));
        } else {
          setSelectedSquare(null);
          setPossibleMoves([]);
        }
      }
    } catch (error) {
      console.error('Move error:', error);
      setSelectedSquare(null);
      setPossibleMoves([]);
    }
  };

  const makeAIMove = () => {
    if (currentPlayer !== 'b' || chess.isGameOver()) return;

    setIsThinking(true);
    
    // Simple AI: random move (in real app, integrate Stockfish)
    setTimeout(() => {
      const possibleMoves = chess.moves();
      if (possibleMoves.length === 0) return;
      
      const randomMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
      const move = chess.move(randomMove);
      
      if (move) {
        setGamePosition(chess.fen());
        setLastMove({ from: move.from, to: move.to });
        setMoveHistory(prev => [...prev, move]);
        setCurrentPlayer(chess.turn());
        setIsWhiteTurn(!isWhiteTurn);
        
        // Check game status
        if (chess.isCheckmate()) {
          setGameStatus('checkmate');
          toast.error("Échec et mat ! L'ordinateur gagne !");
        } else if (chess.isDraw()) {
          setGameStatus('draw');
          toast.info("Partie nulle !");
        }

        if (gameState.coachingMode) {
          analyzeAIMove(move);
        }
      }
      
      setIsThinking(false);
    }, 1000 + Math.random() * 2000); // Random thinking time
  };

  const analyzeMove = async (move: any) => {
    if (!gameState.coachingMode) return;
    
    try {
      setCoachingComment("Analyse en cours...");
      
      // Determine game phase
      const moveCount = moveHistory.length + 1;
      let gamePhase: 'opening' | 'middlegame' | 'endgame' = 'opening';
      if (moveCount > 20) gamePhase = 'middlegame';
      if (chess.board().flat().filter(Boolean).length <= 10) gamePhase = 'endgame';

      const { data, error } = await supabase.functions.invoke('chess-coach', {
        body: {
          position: chess.fen(),
          lastMove: {
            from: move.from,
            to: move.to,
            san: move.san
          },
          gamePhase,
          moveCount
        }
      });

      if (error) {
        console.error('Error getting AI coaching:', error);
        setCoachingComment("Continuez à jouer, chaque coup est une leçon !");
      } else {
        setCoachingComment(data.coaching || "Bon coup ! Continuez ainsi.");
      }
    } catch (error) {
      console.error('Error analyzing move:', error);
      setCoachingComment("Excellente stratégie ! Poursuivez votre plan.");
    }
  };

  const analyzeAIMove = async (move: any) => {
    if (!gameState.coachingMode) return;
    
    try {
      const moveCount = moveHistory.length + 1;
      let gamePhase: 'opening' | 'middlegame' | 'endgame' = 'opening';
      if (moveCount > 20) gamePhase = 'middlegame';
      if (chess.board().flat().filter(Boolean).length <= 10) gamePhase = 'endgame';

      const { data, error } = await supabase.functions.invoke('chess-coach', {
        body: {
          position: chess.fen(),
          lastMove: {
            from: move.from,
            to: move.to,
            san: move.san
          },
          gamePhase,
          moveCount
        }
      });

      if (error) {
        console.error('Error getting AI coaching for AI move:', error);
        setCoachingComment("IA: L'ordinateur joue un coup solide.");
      } else {
        setCoachingComment(`IA: ${data.coaching || "L'ordinateur maintient la pression."}`);
      }
    } catch (error) {
      console.error('Error analyzing AI move:', error);
      setCoachingComment("IA: Coup intéressant de l'ordinateur !");
    }
  };

  const handleResign = () => {
    setGameStatus('resignation');
    toast.error("Vous abandonnez la partie.");
  };

  const handleNewGame = () => {
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Button variant="outline" onClick={() => navigate("/")} className="hover-lift">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          
          <div className="text-center">
            <h1 className="text-2xl font-bold text-chess-gold">
              {gameState.timeControl?.time} • {gameState.coachingMode ? "Mode Coaching" : gameState.eloLevel?.name}
            </h1>
            <div className="flex items-center gap-2 justify-center mt-1">
              <Badge variant={gameStatus === 'playing' ? "default" : "secondary"}>
                {gameStatus === 'playing' ? 'En cours' : 
                 gameStatus === 'checkmate' ? 'Échec et mat' :
                 gameStatus === 'draw' ? 'Nulle' : 'Abandon'}
              </Badge>
              {isThinking && (
                <Badge variant="outline" className="animate-pulse-gold">
                  <MessageCircle className="w-3 h-3 mr-1" />
                  IA réfléchit...
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleNewGame} className="hover-lift">
              <RotateCcw className="w-4 h-4 mr-2" />
              Nouvelle partie
            </Button>
            {gameStatus === 'playing' && (
              <Button variant="destructive" onClick={handleResign} className="hover-lift">
                <Flag className="w-4 h-4 mr-2" />
                Abandonner
              </Button>
            )}
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Timer and game info */}
          <div className="lg:col-span-1 space-y-4">
            <GameTimer
              whiteTime={whiteTime}
              blackTime={blackTime}
              isWhiteTurn={isWhiteTurn}
              gameStatus={gameStatus}
            />
            
            {gameState.coachingMode && (
              <CoachingPanel comment={coachingComment} />
            )}
            
            <MoveHistory moves={moveHistory} />
          </div>

          {/* 3D Chess Board */}
          <div className="lg:col-span-3">
            <Card className="p-4 gradient-card border-chess">
              <div className="aspect-square w-full max-w-2xl mx-auto">
                <Canvas shadows>
                  <AnimatedCamera />
                  <Environment preset="sunset" background />
                  <ambientLight intensity={0.3} />
                  <directionalLight
                    position={[10, 10, 5]}
                    intensity={1}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                  />
                  <FbxChessSet />
                  <ChessBoard3D
                    ref={boardRef}
                    position={gamePosition}
                    onSquareClick={handleSquareClick}
                    selectedSquare={selectedSquare}
                    possibleMoves={possibleMoves}
                    lastMove={lastMove}
                    hideBoard={false}
                  />
                </Canvas>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}