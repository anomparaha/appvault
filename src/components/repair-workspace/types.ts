export interface WordAnalysis {
  index: number;
  rawWord: string;
  isValidBip39: boolean;
  isPlaceholder?: boolean;
  suggestions: string[];
}

export interface TargetAddressMatch {
  positionIndex: number;
  word: string;
  phrase: string;
  matchedAddress: string;
  chainFamily: string;
}

export interface PositionCandidateGroup {
  positionIndex: number;
  candidateCount: number;
  sampleWords: string[];
}

export interface SlotCandidateWord {
  word: string;
  positionIndex: number;
  fullPhrase: string;
}

export interface MnemonicRepairResult {
  totalWords: number;
  isLengthValid: boolean;
  hasInvalidWords: boolean;
  isChecksumValid: boolean;
  isSingleWordMissing?: boolean;
  isDualWordMissing?: boolean;
  missingWordIndex?: number | null;
  missingWordIndices?: number[];
  candidateValidWords?: string[];
  words: WordAnalysis[];
  autoRepairedPhrases: string[];
  targetMatch?: TargetAddressMatch | null;
  positionCandidates?: PositionCandidateGroup[];
  allSlotCandidates?: SlotCandidateWord[];
  dualWordCombinationsTested?: number;
  dualWordSolutionsCount?: number;
  detectedLanguage?: string;
  isTranspositionDetected?: boolean;
  transposedIndices?: [number, number] | null;
}


export interface SessionStats {
  sessionId: string;
  status: "running" | "paused" | "completed" | "cancelled";
  currentIndex: number;
  totalCombinations: number;
  percent: number;
  solutionsCount: number;
  speedCps: number;
  etaSeconds: number | null;
  targetMatch?: TargetAddressMatch | null;
  recentSolutions: string[];
}

export interface ParsedSolution {
  phrase: string;
  diffIndices: number[];
  slotLabel: string;
  solvedWords: string;
  words: string[];
}
