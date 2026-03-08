/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  RotateCcw, 
  Lightbulb, 
  Timer,
  Hash,
  Cpu,
  Zap,
  Image as ImageIcon,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Video,
  Mic,
  MicOff,
  Upload,
  Download,
  Play,
  Pause,
  Volume2,
  VolumeX
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { 
  Board, 
  generateGoal, 
  shuffleBoard, 
  findEmpty, 
  solvePuzzle, 
  isGoal 
} from './solver';

const PUZZLE_IMAGES = [
  { name: 'Cute Cat', url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=1000&auto=format&fit=crop' },
  { name: 'Starry Night', url: 'https://images.unsplash.com/photo-1543857778-c4a1a3e0b2eb?q=80&w=1000&auto=format&fit=crop' },
  { name: 'The Kiss', url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?q=80&w=1000&auto=format&fit=crop' },
  { name: 'Mona Lisa', url: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?q=80&w=1000&auto=format&fit=crop' },
  { name: 'Great Wave', url: 'https://images.unsplash.com/photo-1580136579312-94651dfd596d?q=80&w=1000&auto=format&fit=crop' },
  { name: 'Fluffy Dog', url: 'https://images.unsplash.com/photo-1517849845537-4d257902454a?q=80&w=1000&auto=format&fit=crop' },
  { name: 'Baby Panda', url: 'https://images.unsplash.com/photo-1564349683136-77e08bef1ef1?q=80&w=1000&auto=format&fit=crop' },
  { name: 'Red Panda', url: 'https://images.unsplash.com/photo-1544239649-4238bd1ba45b?q=80&w=1000&auto=format&fit=crop' },
  { name: 'Koala', url: 'https://images.unsplash.com/photo-1526336028067-6484187f66b7?q=80&w=1000&auto=format&fit=crop' },
];

// Procedural Sound Engine
const playSound = (type: 'move' | 'click' | 'win' | 'start') => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'click') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'win') {
      osc.type = 'triangle';
      [523.25, 659.25, 783.99, 1046.50].forEach((f, i) => {
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.1);
      });
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'start') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    }
  } catch (e) {
    console.error('Audio error', e);
  }
};

const triggerHaptic = (type: 'light' | 'medium' | 'success') => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    if (type === 'light') navigator.vibrate(10);
    else if (type === 'medium') navigator.vibrate(20);
    else if (type === 'success') navigator.vibrate([50, 30, 50]);
  }
};

export default function App() {
  const [gameState, setGameState] = useState<'home' | 'playing' | 'won'>('home');
  const [difficulty, setDifficulty] = useState<'low' | 'medium' | 'hard'>('medium');
  const [gridSize, setGridSize] = useState(3);
  const [pendingGridSize, setPendingGridSize] = useState<number | null>(null);
  const [imageIndex, setImageIndex] = useState(() => Math.floor(Math.random() * PUZZLE_IMAGES.length));
  const [board, setBoard] = useState<Board>([]);
  const [goal, setGoal] = useState<Board>([]);
  const [moves, setMoves] = useState(0);
  const [time, setTime] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isWon, setIsWon] = useState(false);
  const [isSolving, setIsSolving] = useState(false);
  const [solvePath, setSolvePath] = useState<string[]>([]);
  const [solveIndex, setSolveIndex] = useState(0);
  const [hintPath, setHintPath] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showMagic, setShowMagic] = useState(false);
  const [currentShuffleMoves, setCurrentShuffleMoves] = useState<string[]>([]);
  const [bestTimes, setBestTimes] = useState<Record<string, number>>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // AI States
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiImage, setAiImage] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const solveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number, y: number } | null>(null);
  const liveSessionRef = useRef<any>(null);

  const currentImage = PUZZLE_IMAGES[imageIndex];

  // AI Functions
  const generateAiImage = async () => {
    if (!aiPrompt) return;
    setIsGeneratingImage(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts: [{ text: aiPrompt }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          setAiImage(imageUrl);
          // Add to puzzle images
          const newImg = { name: `AI: ${aiPrompt.slice(0, 10)}...`, url: imageUrl };
          PUZZLE_IMAGES.unshift(newImg);
          setImageIndex(0);
          initGame();
        }
      }
    } catch (e) {
      console.error('Image gen error', e);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const generateAiVideo = async () => {
    if (!aiPrompt) return;
    if (!(await (window as any).aistudio.hasSelectedApiKey())) {
      await (window as any).aistudio.openSelectKey();
      return;
    }
    setIsGeneratingVideo(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: aiPrompt,
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        operation = await ai.operations.getVideosOperation({ operation: operation });
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      const response = await fetch(downloadLink!, {
        method: 'GET',
        headers: { 'x-goog-api-key': process.env.API_KEY! },
      });
      const blob = await response.blob();
      setGeneratedVideoUrl(URL.createObjectURL(blob));
    } catch (e) {
      console.error('Video gen error', e);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const toggleLive = async () => {
    if (isLiveActive) {
      liveSessionRef.current?.close();
      setIsLiveActive(false);
      return;
    }

    setIsLiveActive(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const session = await ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: "You are a helpful puzzle assistant. Help the user solve their sliding puzzle.",
        },
        callbacks: {
          onmessage: (msg) => {
            if (msg.serverContent?.modelTurn?.parts[0]?.inlineData) {
              const base64 = msg.serverContent.modelTurn.parts[0].inlineData.data;
              try {
                const binary = atob(base64);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                const pcm = new Int16Array(bytes.buffer);
                const float32 = new Float32Array(pcm.length);
                for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i] / 32768;

                const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                const buffer = ctx.createBuffer(1, float32.length, 16000);
                buffer.getChannelData(0).set(float32);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.start();
              } catch (e) {
                console.error('Audio playback error', e);
              }
            }
          }
        }
      });
      liveSessionRef.current = session;
    } catch (e) {
      console.error('Live API error', e);
      setIsLiveActive(false);
    }
  };

  // Load best times
  useEffect(() => {
    const saved = localStorage.getItem('puzzle-pets-best-times');
    if (saved) {
      try {
        setBestTimes(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load best times', e);
      }
    }
  }, []);

  // Save best times
  const updateBestTime = useCallback((s: number) => {
    const key = `${gridSize}-${difficulty}`;
    const currentBest = bestTimes[key];
    if (!currentBest || s < currentBest) {
      const newBest = { ...bestTimes, [key]: s };
      setBestTimes(newBest);
      localStorage.setItem('puzzle-pets-best-times', JSON.stringify(newBest));
    }
  }, [gridSize, difficulty, bestTimes]);

  // Initialize game
  const initGame = useCallback((size: number = gridSize, diff: 'low' | 'medium' | 'hard' = difficulty) => {
    const newGoal = generateGoal(size);
    const { board: newBoard, shuffleMoves } = shuffleBoard(size, diff);
    setGoal(newGoal);
    setBoard(newBoard);
    setCurrentShuffleMoves(shuffleMoves);
    setMoves(0);
    setTime(0);
    setIsActive(true); // Start timer immediately
    setIsWon(false);
    setIsSolving(false);
    setSolvePath([]);
    setSolveIndex(0);
    setHintPath([]);
    if (timerRef.current) clearInterval(timerRef.current);
    if (solveIntervalRef.current) clearInterval(solveIntervalRef.current);
    if (soundEnabled) playSound('start');
  }, [gridSize, difficulty, soundEnabled]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Timer logic - FIXED: Ensure it starts correctly and doesn't flicker
  useEffect(() => {
    if (gameState === 'playing' && isActive && !isWon && !isSolving) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, isActive, isWon, isSolving]);

  const handleMove = useCallback((r: number, c: number) => {
    if (isWon || isSolving) return;

    const [er, ec] = findEmpty(board);
    const isAdjacent = (Math.abs(r - er) === 1 && c === ec) || (Math.abs(c - ec) === 1 && r === er);

    if (isAdjacent) {
      if (soundEnabled) playSound('move');
      triggerHaptic('light');
      
      const newBoard = board.map(row => [...row]);
      newBoard[er][ec] = board[r][c];
      newBoard[r][c] = 0;
      setBoard(newBoard);
      setMoves(prev => prev + 1);
      if (!isActive) setIsActive(true);

      if (isGoal(newBoard, goal)) {
        setIsWon(true);
        setGameState('won');
        setIsActive(false);
        updateBestTime(time + 1); // Use current time
        if (soundEnabled) playSound('win');
        triggerHaptic('success');
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#ff69b4', '#3b82f6', '#f59e0b']
        });
      }
    }
  }, [board, goal, isActive, isWon, isSolving, soundEnabled, time, updateBestTime]);

  // Swipe logic
  const onTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const y = 'touches' in e ? e.touches[0].clientY : e.clientY;
    touchStartRef.current = { x, y };
  };

  const onTouchEnd = (e: React.TouchEvent | React.MouseEvent) => {
    if (!touchStartRef.current) return;
    const x = 'changedTouches' in e ? e.changedTouches[0].clientX : e.clientX;
    const y = 'changedTouches' in e ? e.changedTouches[0].clientY : e.clientY;
    
    const dx = x - touchStartRef.current.x;
    const dy = y - touchStartRef.current.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) > 30) {
      const [er, ec] = findEmpty(board);
      let targetR = er;
      let targetC = ec;

      if (absX > absY) {
        // Horizontal swipe
        if (dx > 0) targetC = ec - 1; // Swipe Right -> move tile from left
        else targetC = ec + 1; // Swipe Left -> move tile from right
      } else {
        // Vertical swipe
        if (dy > 0) targetR = er - 1; // Swipe Down -> move tile from up
        else targetR = er + 1; // Swipe Up -> move tile from down
      }

      if (targetR >= 0 && targetR < gridSize && targetC >= 0 && targetC < gridSize) {
        handleMove(targetR, targetC);
      }
    }
    touchStartRef.current = null;
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isWon || isSolving) return;
      const [er, ec] = findEmpty(board);
      let targetR = er;
      let targetC = ec;

      if (e.key === 'ArrowUp') targetR = er + 1;
      else if (e.key === 'ArrowDown') targetR = er - 1;
      else if (e.key === 'ArrowLeft') targetC = ec + 1;
      else if (e.key === 'ArrowRight') targetC = ec - 1;
      else return;

      if (targetR >= 0 && targetR < gridSize && targetC >= 0 && targetC < gridSize) {
        handleMove(targetR, targetC);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [board, handleMove, isWon, isSolving, gridSize]);

  const getHint = async () => {
    if (isSolving || isWon) return;
    const path = await solvePuzzle(board, goal);
    if (path && path.length > 0) {
      setHintPath(path);
      setTimeout(() => setHintPath([]), 2000);
    }
  };

  const startAutoSolve = async () => {
    if (isSolving || isWon) return;
    setIsSolving(true);
    
    // Try A* first for small grids
    let path: string[] | null = null;
    if (gridSize === 3) {
      path = await solvePuzzle(board, goal);
    }
    
    // Fallback to shuffle moves if A* fails or grid is large
    if (!path) {
      path = currentShuffleMoves;
    }

    if (path && path.length > 0) {
      setSolvePath(path);
      setSolveIndex(0);
      
      let currentIndex = 0;
      solveIntervalRef.current = setInterval(() => {
        if (currentIndex >= path!.length) {
          if (solveIntervalRef.current) clearInterval(solveIntervalRef.current);
          setIsSolving(false);
          setIsWon(true);
          setGameState('won');
          confetti({ particleCount: 100, spread: 60, origin: { y: 0.6 } });
          return;
        }

        const move = path![currentIndex];
        setBoard(prev => {
          const [er, ec] = findEmpty(prev);
          let tr = er, tc = ec;
          if (move === 'up') tr = er + 1;
          else if (move === 'down') tr = er - 1;
          else if (move === 'left') tc = ec + 1;
          else if (move === 'right') tc = ec - 1;

          if (tr < 0 || tr >= gridSize || tc < 0 || tc >= gridSize) return prev;

          const newBoard = prev.map(row => [...row]);
          newBoard[er][ec] = newBoard[tr][tc];
          newBoard[tr][tc] = 0;
          return newBoard;
        });
        
        setMoves(prev => prev + 1);
        setSolveIndex(prev => prev + 1);
        currentIndex++;
      }, 150);
    } else {
      setIsSolving(false);
      alert("Could not find a solution path.");
    }
  };

  const formatFullTime = (s: number) => {
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    
    const parts = [];
    if (hrs > 0) parts.push(`${hrs} ${hrs === 1 ? 'hour' : 'hours'}`);
    if (mins > 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs} ${secs === 1 ? 'second' : 'seconds'}`);
    
    return parts.join(', ');
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTileStyle = (val: number) => {
    if (val === 0) return {};
    const size = gridSize;
    const originalPos = val - 1;
    const r = Math.floor(originalPos / size);
    const c = originalPos % size;
    
    const percentage = 100 / (size - 1);
    return {
      backgroundImage: `url(${currentImage.url})`,
      backgroundSize: `${size * 100}% ${size * 100}%`,
      backgroundPosition: `${c * percentage}% ${r * percentage}%`,
      backgroundRepeat: 'no-repeat',
    };
  };

  return (
    <div 
      className="min-h-screen bg-[#f8fafc] text-[#1a1a1a] font-sans selection:bg-pink-100 p-4 md:p-8 flex flex-col items-center transition-all duration-700 relative overflow-x-hidden"
    >
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-pink-200/20 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-violet-200/20 blur-[120px] rounded-full" />
      </div>

      {/* Magic Modal */}
      <AnimatePresence>
        {showMagic && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black tracking-tighter flex items-center gap-2">
                  <Sparkles className="text-violet-500" /> MAGIC STUDIO
                </h2>
                <button onClick={() => setShowMagic(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <RotateCcw size={20} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">AI Prompt</label>
                  <textarea 
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Describe your custom puzzle image..."
                    className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-violet-500 outline-none transition-all text-sm min-h-[100px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={generateAiImage}
                    disabled={isGeneratingImage || !aiPrompt}
                    className="flex flex-col items-center gap-2 p-4 bg-violet-50 rounded-2xl border border-violet-100 hover:bg-violet-100 transition-all disabled:opacity-50"
                  >
                    {isGeneratingImage ? <Cpu className="animate-spin text-violet-500" /> : <ImageIcon className="text-violet-500" />}
                    <span className="text-[10px] font-black uppercase tracking-widest">Gen Image</span>
                  </button>
                  <button 
                    onClick={generateAiVideo}
                    disabled={isGeneratingVideo || !aiPrompt}
                    className="flex flex-col items-center gap-2 p-4 bg-pink-50 rounded-2xl border border-pink-100 hover:bg-pink-100 transition-all disabled:opacity-50"
                  >
                    {isGeneratingVideo ? <Cpu className="animate-spin text-pink-500" /> : <Video className="text-pink-500" />}
                    <span className="text-[10px] font-black uppercase tracking-widest">Gen Video</span>
                  </button>
                </div>

                <button 
                  onClick={toggleLive}
                  className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${isLiveActive ? 'bg-red-500 text-white' : 'bg-black text-white'}`}
                >
                  {isLiveActive ? <MicOff size={20} /> : <Mic size={20} />}
                  {isLiveActive ? 'Stop Voice Assistant' : 'Start Voice Assistant'}
                </button>

                {generatedVideoUrl && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Generated Video</label>
                    <video src={generatedVideoUrl} controls className="w-full rounded-2xl shadow-lg" />
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {gameState === 'home' && (
          <motion.div 
            key="home"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md flex flex-col items-center justify-center min-h-[80vh] gap-8"
          >
            <div className="text-center">
              <motion.h1 
                className="text-5xl font-black tracking-tighter bg-gradient-to-r from-pink-500 to-violet-600 bg-clip-text text-transparent mb-2"
              >
                IMAGE PUZZLE
              </motion.h1>
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">The Ultimate Sliding Challenge</p>
            </div>

            <div className="w-full bg-white/60 backdrop-blur-md rounded-3xl border border-white/50 p-6 shadow-xl space-y-6">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Best Time</label>
                <span className="text-xs font-bold text-pink-500">
                  {bestTimes[`${gridSize}-${difficulty}`] ? formatTime(bestTimes[`${gridSize}-${difficulty}`]) : '--:--'}
                </span>
              </div>
              
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 block">Select Grid Size</label>
                <div className="flex gap-2">
                  {[3, 4, 5, 6].map(s => (
                    <button
                      key={s}
                      onClick={() => { setGridSize(s); if (soundEnabled) playSound('click'); }}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${gridSize === s ? 'bg-black text-white shadow-lg scale-105' : 'bg-white/50 hover:bg-white'}`}
                    >
                      {s}x{s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 block">Difficulty</label>
                <div className="flex gap-2">
                  {(['low', 'medium', 'hard'] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => { setDifficulty(d); if (soundEnabled) playSound('click'); }}
                      className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${difficulty === d ? 'bg-pink-500 text-white shadow-lg scale-105' : 'bg-white/50 hover:bg-white text-gray-400'}`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => { initGame(gridSize, difficulty); setGameState('playing'); }}
                  className="flex-[2] py-4 bg-gradient-to-r from-pink-500 to-violet-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  Play Now
                </button>
                <button 
                  onClick={() => { setSoundEnabled(!soundEnabled); if (!soundEnabled) playSound('click'); }}
                  className="flex-1 py-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 flex items-center justify-center hover:bg-white transition-all"
                >
                  {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
              </div>
              
              <button 
                onClick={() => setShowMagic(true)}
                className="w-full py-3 bg-violet-100 text-violet-600 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-violet-200 transition-all"
              >
                <Sparkles size={16} /> AI Magic Studio
              </button>
            </div>
          </motion.div>
        )}

        {gameState === 'playing' && (
          <motion.div 
            key="playing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-md flex flex-col items-center"
          >
            {/* Header */}
            <header className="w-full mb-6 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <motion.h1 
                  onClick={() => setGameState('home')}
                  className="text-3xl font-black tracking-tighter bg-gradient-to-r from-pink-500 to-violet-600 bg-clip-text text-transparent cursor-pointer"
                >
                  IMAGE PUZZLE
                </motion.h1>
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 bg-white/50 backdrop-blur-sm rounded-full border border-white/50 shadow-sm hover:bg-white transition-colors"
                >
                  <Settings size={20} className="text-gray-600" />
                </button>
              </div>
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Difficulty: <span className="text-pink-500">{difficulty}</span></p>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Grid: {gridSize}x{gridSize}</p>
              </div>
            </header>

            {/* Settings Panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="w-full mb-6 overflow-hidden bg-white/60 backdrop-blur-md rounded-3xl border border-white/50 p-6 shadow-xl"
                >
                  <div className="space-y-6">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 block">Difficulty</label>
                      <div className="flex gap-2">
                        {(['low', 'medium', 'hard'] as const).map(d => (
                          <button
                            key={d}
                            onClick={() => { setDifficulty(d); initGame(gridSize, d); }}
                            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${difficulty === d ? 'bg-pink-500 text-white' : 'bg-white/50 hover:bg-white text-gray-400'}`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3 block">Choose Animal</label>
                      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        {PUZZLE_IMAGES.map((img, idx) => (
                          <button
                            key={img.name}
                            onClick={() => { setImageIndex(idx); initGame(); }}
                            className={`flex-shrink-0 w-16 h-16 rounded-xl border-2 transition-all overflow-hidden ${imageIndex === idx ? 'border-pink-500 scale-110' : 'border-transparent opacity-60'}`}
                          >
                            <img src={img.url} alt={img.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Grid Size Selector */}
            <div className="w-full mb-4 bg-white/40 backdrop-blur-sm p-1.5 rounded-2xl border border-white/50 flex gap-2">
              {[3, 4, 5, 6].map(s => (
                <button
                  key={s}
                  onClick={() => setPendingGridSize(s)}
                  className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${gridSize === s ? 'bg-black text-white shadow-lg scale-105' : 'bg-white/50 hover:bg-white text-gray-500'}`}
                >
                  {s}x{s}
                </button>
              ))}
            </div>

            {/* Confirmation Popup */}
            <AnimatePresence>
              {pendingGridSize !== null && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
                >
                  <div className="bg-white rounded-3xl p-8 max-w-xs w-full shadow-2xl text-center">
                    <h3 className="text-xl font-black mb-2">Change Grid Size?</h3>
                    <p className="text-gray-500 text-sm mb-6">This will reset your current progress.</p>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => setPendingGridSize(null)}
                        className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-sm"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          const s = pendingGridSize!;
                          setGridSize(s);
                          initGame(s);
                          setPendingGridSize(null);
                        }}
                        className="flex-1 py-3 bg-black text-white rounded-xl font-bold text-sm"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Stats */}
            <div className="w-full grid grid-cols-2 gap-3 mb-6">
              <div className="bg-white/60 backdrop-blur-sm p-3 rounded-2xl border border-white/50 shadow-sm flex items-center gap-3">
                <div className="p-2 bg-pink-50 rounded-xl text-pink-500"><Timer size={18} /></div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-black text-gray-400">Time</p>
                  <p className="text-lg font-mono font-bold">{formatTime(time)}</p>
                </div>
              </div>
              <div className="bg-white/60 backdrop-blur-sm p-3 rounded-2xl border border-white/50 shadow-sm flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl text-blue-500"><Hash size={18} /></div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-black text-gray-400">Moves</p>
                  <p className="text-lg font-mono font-bold">{moves}</p>
                </div>
              </div>
            </div>

            {/* Game Board */}
            <div 
              className="relative group"
              onMouseDown={onTouchStart}
              onMouseUp={onTouchEnd}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              <motion.div 
                layout
                className="bg-white/40 backdrop-blur-md p-2 rounded-[2rem] shadow-2xl border border-white/50 relative overflow-hidden"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
                  gap: '4px',
                  width: 'min(90vw, 400px)',
                  aspectRatio: '1/1'
                }}
              >
                <AnimatePresence mode="popLayout">
                  {board.map((row, r) => 
                    row.map((val, c) => (
                      <motion.button
                        key={`${val}-${r}-${c}`}
                        layoutId={val === 0 ? 'empty' : `tile-${val}`}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        transition={{ 
                          type: 'spring', 
                          stiffness: 500, 
                          damping: 40,
                          mass: 1,
                          opacity: { duration: 0.2 }
                        }}
                        onClick={() => handleMove(r, c)}
                        disabled={val === 0 || isSolving || isWon}
                        className={`
                          relative flex items-center justify-center rounded-lg overflow-hidden transition-all
                          ${val === 0 ? 'bg-transparent' : 'bg-gray-100 shadow-sm'}
                          ${hintPath[0] === 'up' && r === findEmpty(board)[0] + 1 && c === findEmpty(board)[1] ? 'ring-4 ring-pink-400 z-10' : ''}
                          ${hintPath[0] === 'down' && r === findEmpty(board)[0] - 1 && c === findEmpty(board)[1] ? 'ring-4 ring-pink-400 z-10' : ''}
                          ${hintPath[0] === 'left' && r === findEmpty(board)[0] && c === findEmpty(board)[1] + 1 ? 'ring-4 ring-pink-400 z-10' : ''}
                          ${hintPath[0] === 'right' && r === findEmpty(board)[0] && c === findEmpty(board)[1] - 1 ? 'ring-4 ring-pink-400 z-10' : ''}
                        `}
                        style={getTileStyle(val)}
                      >
                        {val !== 0 && (
                          <div className="absolute inset-0 flex items-end justify-end p-1 bg-black/5 hover:bg-transparent transition-colors">
                            <span className="text-white font-black text-xs md:text-sm drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.8)] opacity-90">{val}</span>
                          </div>
                        )}
                        {val === 0 && isWon && (
                          <div 
                            className="w-full h-full" 
                            style={{
                              backgroundImage: `url(${currentImage.url})`,
                              backgroundSize: `${gridSize * 100}% ${gridSize * 100}%`,
                              backgroundPosition: `100% 100%`,
                              backgroundRepeat: 'no-repeat',
                            }}
                          />
                        )}
                      </motion.button>
                    ))
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Solving Overlay */}
              <AnimatePresence>
                {isSolving && (
                  <motion.div 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-black text-white px-5 py-2 rounded-full flex items-center gap-3 shadow-2xl"
                  >
                    <Cpu size={16} className="animate-pulse text-pink-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest">AI Solving: {solveIndex}/{solvePath.length}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Controls */}
            <div className="w-full grid grid-cols-3 gap-3 mt-8">
              <button
                onClick={() => initGame()}
                className="flex flex-col items-center justify-center gap-1 p-3 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 hover:bg-white transition-all group"
              >
                <RotateCcw size={18} className="text-gray-400 group-hover:rotate-[-45deg] transition-transform" />
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Reset</span>
              </button>
              <button
                onClick={getHint}
                disabled={isSolving || isWon}
                className="flex flex-col items-center justify-center gap-1 p-3 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 hover:bg-white transition-all disabled:opacity-50 group"
              >
                <Lightbulb size={18} className="text-pink-500 group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Hint</span>
              </button>
              <button
                onClick={startAutoSolve}
                disabled={isSolving || isWon}
                className="flex flex-col items-center justify-center gap-1 p-3 bg-pink-500 rounded-2xl hover:bg-pink-600 transition-all disabled:opacity-50 group shadow-lg shadow-pink-200"
              >
                <Zap size={18} className="text-white group-hover:scale-110 transition-transform" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white">Auto</span>
              </button>
            </div>
          </motion.div>
        )}

        {gameState === 'won' && (
          <motion.div 
            key="won"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="w-full max-w-md flex flex-col items-center justify-center min-h-[80vh] text-center"
          >
            <div className="relative mb-8">
              <motion.div 
                initial={{ rotate: -10, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                className="w-48 h-48 rounded-3xl overflow-hidden shadow-2xl border-4 border-white relative z-10"
              >
                <img src={currentImage.url} alt="Completed" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </motion.div>
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 }}
                className="absolute -top-4 -right-4 w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg z-20"
              >
                <Trophy size={24} className="text-white" />
              </motion.div>
            </div>
            
            <h2 className="text-4xl font-black mb-2">CONGRATULATIONS!</h2>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mb-8">You've mastered the {gridSize}x{gridSize} grid!</p>
            
            <div className="w-full bg-white/60 backdrop-blur-md rounded-3xl border border-white/50 p-8 shadow-xl space-y-6 mb-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Time</p>
                  <p className="text-xl font-bold">{formatFullTime(time)}</p>
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Moves</p>
                  <p className="text-xl font-bold">{moves} moves</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Difficulty</p>
                  <p className="text-xl font-bold uppercase tracking-widest">{difficulty}</p>
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-pink-400">Best Time</p>
                  <p className="text-xl font-bold">{bestTimes[`${gridSize}-${difficulty}`] ? formatTime(bestTimes[`${gridSize}-${difficulty}`]) : '--:--'}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col w-full gap-3">
              <button 
                onClick={() => { initGame(); setGameState('playing'); }}
                className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Try Again
              </button>
              <button 
                onClick={() => setGameState('home')}
                className="w-full py-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-white/50 font-black uppercase tracking-widest hover:bg-white transition-all"
              >
                Main Menu
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
