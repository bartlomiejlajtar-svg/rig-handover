import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Fixtures live in a temp dir; runs/ is read-only and never touched here.
let runsDir: string;

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error !== undefined ? { error } : {}) });

const normal = [
  line('2026-10-28T02:00:00+01:00', 'lane/sync', 'ok', 'ops'),
  line('2026-10-28T01:30:00+01:00', 'fixtures/refresh', 'retry', 'lane', 'upstream 503'),
  line('2026-10-28T01:31:00+01:00', 'fixtures/refresh', 'ok', 'lane'),
  line('2026-10-28T03:00:00+01:00', 'digest/render', 'fail', null, 'boom'),
  line('2026-10-28T01:00:00+01:00', 'notes/backup', 'ok', 'ops'),
].join('\n');

const withBadLine = [
  line('2026-10-27T01:00:00+01:00', 'lane/sync', 'ok', 'ops'),
  'this is not json{',
  line('2026-10-27T02:00:00+01:00', 'notes/backup', 'fail', 'ops', 'quota exceeded'),
].join('\n');

const config = (dir: string) => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: dir,
});

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), normal + '\n');
  writeFileSync(join(runsDir, '2026-10-27.jsonl'), withBadLine + '\n');
  writeFileSync(join(runsDir, '2026-10-26.jsonl'), '');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night (HTML)', () => {
  it('200 for a normal night, with one row per job in job-name order', async () => {
    const res = await createApp(config(runsDir)).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    const jobs = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup'];
    for (const job of jobs) expect(html).toContain(`<td>${job}</td>`);
    const positions = jobs.map((job) => html.indexOf(`<td>${job}</td>`));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html).not.toContain('did not parse');
  });

  it('404 for a night with no file', async () => {
    const res = await createApp(config(runsDir)).request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for this night');
  });

  it('empty night says "nothing ran"', async () => {
    const res = await createApp(config(runsDir)).request('/digest/2026-10-26');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
  });

  it('night with a bad line reports it and still shows the good lines', async () => {
    const res = await createApp(config(runsDir)).request('/digest/2026-10-27');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 line did not parse');
    expect(html).toContain('<td>lane/sync</td>');
    expect(html).toContain('<td>notes/backup</td>');
    expect(html).toContain('quota exceeded');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 for a normal night, rows in the same order as the page', async () => {
    const app = createApp(config(runsDir));
    const body = (await (await app.request('/api/digest/2026-10-28')).json()) as {
      night: string;
      rows: { job: string }[];
      badLines: number;
    };
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup']);
    expect(body.badLines).toBe(0);

    const html = await (await app.request('/digest/2026-10-28')).text();
    const pageOrder = body.rows.map((r) => html.indexOf(`<td>${r.job}</td>`));
    expect(pageOrder).toEqual([...pageOrder].sort((a, b) => a - b));
  });

  it('404 with an error for a night with no file', async () => {
    const res = await createApp(config(runsDir)).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log for 2026-01-01' });
  });

  it('empty night has rows []', async () => {
    const res = await createApp(config(runsDir)).request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-10-26', rows: [], badLines: 0 });
  });

  it('night with a bad line has badLines 1 and keeps the good rows', async () => {
    const res = await createApp(config(runsDir)).request('/api/digest/2026-10-27');
    const body = (await res.json()) as { rows: { job: string; lastError: string | null }[]; badLines: number };
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'notes/backup']);
    expect(body.rows.find((r) => r.job === 'notes/backup')?.lastError).toBe('quota exceeded');
  });
});
