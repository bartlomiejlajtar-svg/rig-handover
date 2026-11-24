// Plan morning-digest § 1. The contract every part of § 2 builds on: commit this first.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing at the edge.
export type RunLine = {
  at: string; // ISO 8601 with the log's own offset; never converted to UTC
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // null is kept; views show it as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // error of the latest line that had one, or null
  firstAt: string; // as written in the log, offset kept
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse: counted, never thrown
};

// null when runs/<night>.jsonl does not exist (the page answers 404).
// An empty file gives { rows: [], badLines: 0 } ("nothing ran").
export type ReadNight = (runsDir: string, night: string) => Night | null;
