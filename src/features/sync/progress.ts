import type { TransferProgress } from '../../sync';

const PERCENT = 100;

/** 传输进度（0 – 100） */
export function progressPercent({ done, total }: TransferProgress): number {
  return total === 0 ? 0 : Math.round((done / total) * PERCENT);
}
