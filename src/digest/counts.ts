import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';
import type { RunStatus } from './types.js';

export type NightCounts = Record<RunStatus, number>;

// Count parsed lines by status; bad and blank lines are not counted.
export function countLines(lines: string[]): NightCounts {
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const text of lines) {
    const l = parseLine(text);
    if (l) counts[l.status]++;
  }
  return counts;
}

// null when the night's file cannot be read.
export function nightCounts(runsDir: string, night: string): NightCounts | null {
  try {
    return countLines(readFileSync(join(runsDir, `${night}.jsonl`), 'utf8').split('\n'));
  } catch {
    return null;
  }
}
