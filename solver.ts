/**
 * Optimal solver for N-puzzle using A* algorithm with Manhattan distance heuristic.
 */

export type Board = number[][];

export interface State {
  board: Board;
  emptyPos: [number, number];
  moves: string[];
  g: number; // cost from start
  h: number; // heuristic cost to goal
}

export function getManhattanDistance(board: Board, goal: Board): number {
  let distance = 0;
  const size = board.length;
  const goalPositions: { [key: number]: [number, number] } = {};

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      goalPositions[goal[r][c]] = [r, c];
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const val = board[r][c];
      if (val !== 0) {
        const [gr, gc] = goalPositions[val];
        distance += Math.abs(r - gr) + Math.abs(c - gc);
      }
    }
  }
  return distance;
}

export function isGoal(board: Board, goal: Board): boolean {
  return JSON.stringify(board) === JSON.stringify(goal);
}

export function getNeighbors(state: State): State[] {
  const neighbors: State[] = [];
  const [r, c] = state.emptyPos;
  const size = state.board.length;

  const directions: [number, number, string][] = [
    [-1, 0, 'up'],
    [1, 0, 'down'],
    [0, -1, 'left'],
    [0, 1, 'right'],
  ];

  for (const [dr, dc, dir] of directions) {
    const nr = r + dr;
    const nc = c + dc;

    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      const newBoard = state.board.map(row => [...row]);
      newBoard[r][c] = newBoard[nr][nc];
      newBoard[nr][nc] = 0;

      neighbors.push({
        board: newBoard,
        emptyPos: [nr, nc],
        moves: [...state.moves, dir],
        g: state.g + 1,
        h: 0, // will be calculated
      });
    }
  }

  return neighbors;
}

/**
 * A* Solver
 * Note: For 4x4 and larger, A* can be slow without a more advanced heuristic or IDA*.
 * We'll limit the search for performance.
 */
export async function solvePuzzle(initialBoard: Board, goalBoard: Board): Promise<string[] | null> {
  const size = initialBoard.length;
  // Simple A* implementation
  const startEmptyPos = findEmpty(initialBoard);
  const startState: State = {
    board: initialBoard,
    emptyPos: startEmptyPos,
    moves: [],
    g: 0,
    h: getManhattanDistance(initialBoard, goalBoard),
  };

  const openSet: State[] = [startState];
  const closedSet = new Set<string>();

  // Use a simple priority queue (array sort for now, can optimize if needed)
  let iterations = 0;
  const MAX_ITERATIONS = size === 3 ? 10000 : 2000; // Limit search for larger puzzles

  while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
    iterations++;
    
    // Sort by f = g + h
    openSet.sort((a, b) => (a.g + a.h) - (b.g + b.h));
    const current = openSet.shift()!;

    if (isGoal(current.board, goalBoard)) {
      return current.moves;
    }

    const boardStr = JSON.stringify(current.board);
    if (closedSet.has(boardStr)) continue;
    closedSet.add(boardStr);

    for (const neighbor of getNeighbors(current)) {
      if (!closedSet.has(JSON.stringify(neighbor.board))) {
        neighbor.h = getManhattanDistance(neighbor.board, goalBoard);
        openSet.push(neighbor);
      }
    }
    
    // Yield to UI thread occasionally
    if (iterations % 500 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return null;
}

export function findEmpty(board: Board): [number, number] {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (board[r][c] === 0) return [r, c];
    }
  }
  return [0, 0];
}

export function generateGoal(size: number): Board {
  const board: Board = [];
  let val = 1;
  for (let r = 0; r < size; r++) {
    const row: number[] = [];
    for (let c = 0; c < size; c++) {
      if (r === size - 1 && c === size - 1) {
        row.push(0);
      } else {
        row.push(val++);
      }
    }
    board.push(row);
  }
  return board;
}

export function isSolvable(board: Board): boolean {
  const flat = board.flat().filter(x => x !== 0);
  let inversions = 0;
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[i] > flat[j]) inversions++;
    }
  }

  const size = board.length;
  if (size % 2 !== 0) {
    return inversions % 2 === 0;
  } else {
    const emptyPos = findEmpty(board);
    const rowFromBottom = size - emptyPos[0];
    if (rowFromBottom % 2 === 0) {
      return inversions % 2 !== 0;
    } else {
      return inversions % 2 === 0;
    }
  }
}

export interface ShuffleResult {
  board: Board;
  shuffleMoves: string[];
}

export function shuffleBoard(size: number, difficulty: 'low' | 'medium' | 'hard' = 'medium'): ShuffleResult {
  let board = generateGoal(size);
  let [r, c] = [size - 1, size - 1];
  const shuffleMoves: string[] = [];
  
  const moveCounts = {
    low: size * 4,
    medium: size * 10,
    hard: size * 25
  };
  
  const moves = moveCounts[difficulty];
  let lastMove: string | null = null;

  for (let i = 0; i < moves; i++) {
    const directions: [number, number, string][] = [
      [-1, 0, 'up'],
      [1, 0, 'down'],
      [0, -1, 'left'],
      [0, 1, 'right'],
    ];

    const validMoves = directions.filter(([dr, dc, dir]) => {
      const nr = r + dr;
      const nc = c + dc;
      const isUndo = (dir === 'up' && lastMove === 'down') ||
                     (dir === 'down' && lastMove === 'up') ||
                     (dir === 'left' && lastMove === 'right') ||
                     (dir === 'right' && lastMove === 'left');
      return nr >= 0 && nr < size && nc >= 0 && nc < size && !isUndo;
    });

    const [dr, dc, dir] = validMoves[Math.floor(Math.random() * validMoves.length)];
    const nr = r + dr;
    const nc = c + dc;

    board[r][c] = board[nr][nc];
    board[nr][nc] = 0;
    r = nr;
    c = nc;
    lastMove = dir;
    
    // The move to SOLVE this is the opposite of the move we just made
    // If we moved the empty space 'up' (by moving a tile 'down'), 
    // the solve move is to move that same tile 'up' (moving empty space 'down').
    // But it's easier to just store the direction the TILE moved.
    // In our logic: board[r][c] = board[nr][nc] means the tile at (nr, nc) moved to (r, c).
    // If (nr, nc) is below (r, c), the tile moved 'up'.
    let tileMove = '';
    if (dr === 1) tileMove = 'up';
    else if (dr === -1) tileMove = 'down';
    else if (dc === 1) tileMove = 'left';
    else if (dc === -1) tileMove = 'right';
    shuffleMoves.unshift(tileMove);
  }

  if (isGoal(board, generateGoal(size))) {
    return shuffleBoard(size, difficulty);
  }

  return { board, shuffleMoves };
}
