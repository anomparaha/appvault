/**
 * Balance scanning types.
 */

export interface ScanProgress {
  total: number;
  completed: number;
  funded: number;
  isScanning: boolean;
  currentLabel?: string;
}
