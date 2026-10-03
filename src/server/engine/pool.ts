import "server-only";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { root, workerScript } from "../paths";
import { LIMITS } from "./limits";
import type { WorkerReply, WorkerRequest, WorkerResult } from "./protocol";

export { LIMITS };

const useInlineEngine =
  process.env.FIGFLOW_ENGINE === "worker"
    ? false
    : process.env.FIGFLOW_ENGINE === "inline" ||
      process.env.NODE_ENV === "development" ||
      process.env.VERCEL === "1" ||
      process.env.NEXT_PHASE === "phase-production-build";

/**
 * The engine workers: one process per open upload (worker.ts), kept while it's
 * in use so its parsed file answers the next request quickly. At most
 * MAX_WORKERS run at once; an idle one is closed to make room, and a request
 * that runs past its time limit kills its worker (a file that hangs the
 * engine can't hang the site). One more is kept started with no file (the
 * spare), so a new upload doesn't wait for a process to start.
 */

const MAX_WORKERS = Math.max(1, Number(process.env.FIGFLOW_WORKERS ?? 2));
const SPARE = process.env.FIGFLOW_SPARE_WORKER !== "0";
/** A dev server's engine code changes as it runs: its spare is renewed every minute, so it runs the current code. */
const SPARE_MAX_AGE = process.env.NODE_ENV === "production" ? Infinity : 60_000;
const IDLE_MS = 5 * 60_000;
const HEAP_MB = Number(process.env.FIGFLOW_WORKER_HEAP_MB ?? 4096);

/** Which waiting request runs next: lower first, in arrival order (thumbnails wait for everything else). */
const PRIORITY = { open: 0, pick: 0, flow: 1, generate: 1, preview: 1, thumb: 2 } as const;

type Op = WorkerRequest["op"];
type Args<K extends Op> = Omit<Extract<WorkerRequest, { op: K }>, "id" | "op">;

class EngineWorker {
  private readonly proc: ChildProcessByStdio<Writable, Readable, Readable>;
  private readonly waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private seq = 0;
  private readonly queue: Array<{ priority: number; run: () => Promise<void> }> = [];
  private pumping = false;
  private stderr = "";
  readonly ready: Promise<void>;
  opened: Promise<WorkerResult["open"]> | null = null;
  lastUsed = Date.now();
  active = 0;
  dead = false;

  readonly born = Date.now();

  /** `key`: the upload whose file it has open ("" for the spare). */
  constructor(public key: string) {
    this.proc = spawn(process.execPath, [`--max-old-space-size=${HEAP_MB}`, "--import", "tsx", workerScript], {
      cwd: root,
      env: { ...process.env, NODE_OPTIONS: "" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let readyResolve!: () => void;
    this.ready = new Promise((resolve) => (readyResolve = resolve));
    createInterface({ input: this.proc.stdout }).on("line", (line) => {
      let reply: WorkerReply;
      try {
        reply = JSON.parse(line) as WorkerReply;
      } catch {
        return;
      }
      if (reply.id === 0) return readyResolve();
      const w = this.waiting.get(reply.id);
      if (!w) return;
      this.waiting.delete(reply.id);
      if (reply.ok) w.resolve(reply.result);
      else w.reject(new Error(reply.error));
    });
    this.proc.stderr.on("data", (d: Buffer) => {
      this.stderr = (this.stderr + d.toString()).slice(-4000);
    });
    this.proc.on("exit", (code, signal) => this.fail(new Error(this.stderr.trim().split("\n").pop() || `The engine stopped (${signal ?? `exit ${code}`}).`)));
    this.proc.on("error", (e) => this.fail(e));
  }

  /** One request, queued by priority; past `timeoutMs` the worker is killed. */
  call<K extends Op>(op: K, args: Args<K>, timeoutMs: number): Promise<WorkerResult[K]> {
    this.active++;
    const result = new Promise<WorkerResult[K]>((resolve, reject) => {
      this.queue.push({ priority: PRIORITY[op], run: () => this.send(op, args, timeoutMs).then(resolve, reject) });
      this.queue.sort((a, b) => a.priority - b.priority); // stable: arrival order within a priority
      void this.pump();
    });
    return result.finally(() => {
      this.active--;
      this.lastUsed = Date.now();
      wakeWaiters();
    });
  }

  /** Runs queued requests one at a time (the worker answers in order anyway). */
  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    while (this.queue.length) await this.queue.shift()!.run();
    this.pumping = false;
  }

  private async send<K extends Op>(op: K, args: Args<K>, timeoutMs: number): Promise<WorkerResult[K]> {
    await this.ready;
    if (this.dead) throw new Error("The engine stopped.");
    const id = ++this.seq;
    return new Promise<WorkerResult[K]>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`The engine took longer than ${Math.round(timeoutMs / 1000)} s and was stopped.`));
        this.kill();
      }, timeoutMs);
      this.waiting.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v as WorkerResult[K])),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.proc.stdin.write(`${JSON.stringify({ ...args, op, id })}\n`);
    });
  }

  kill() {
    if (!this.dead) this.proc.kill();
    this.fail(new Error("The engine was stopped."));
  }

  private fail(e: Error) {
    this.dead = true;
    for (const w of this.waiting.values()) w.reject(e);
    this.waiting.clear();
    if (state.workers.get(this.key) === this) state.workers.delete(this.key);
    if (state.spare === this) state.spare = null;
    wakeWaiters();
  }
}

// Kept on globalThis: the dev server reloads modules, but the processes live on.
type PoolState = { workers: Map<string, EngineWorker>; spare: EngineWorker | null; waiters: Array<() => void>; reaper: NodeJS.Timeout | null };
const g = globalThis as typeof globalThis & { __figflowPool?: PoolState };
const state: PoolState = (g.__figflowPool ??= { workers: new Map(), spare: null, waiters: [], reaper: null });

function wakeWaiters() {
  const waiters = state.waiters.splice(0);
  for (const w of waiters) w();
}

function startReaper() {
  if (useInlineEngine || state.reaper) return;
  if (state.reaper) clearInterval(state.reaper);
  state.reaper = setInterval(() => {
    const now = Date.now();
    for (const w of state.workers.values()) if (w.active === 0 && now - w.lastUsed > IDLE_MS) w.kill();
    if (state.spare && now - state.spare.born > SPARE_MAX_AGE) {
      state.spare.kill();
      warmEngine();
    }
  }, 60_000);
  state.reaper.unref?.();
}

/** A worker with `path` open for `key`: the running one, or a new one once there's room. */
async function workerFor(key: string, path: string): Promise<EngineWorker> {
  for (;;) {
    const known = state.workers.get(key);
    if (known && !known.dead) {
      await known.opened;
      return known;
    }
    if (state.workers.size < MAX_WORKERS) break;
    // Close the idle worker used longest ago, or wait for one to finish.
    const idle = [...state.workers.values()].filter((w) => w.active === 0).sort((a, b) => a.lastUsed - b.lastUsed)[0];
    if (idle) idle.kill();
    else await new Promise<void>((resolve) => state.waiters.push(resolve));
  }
  // The spare, when there is one: it's started already (or starting).
  const spare = state.spare && !state.spare.dead ? state.spare : null;
  state.spare = null;
  const w = spare ?? new EngineWorker(key);
  w.key = key;
  state.workers.set(key, w);
  // A spare for the next upload, started once this one's first requests are done with the CPU.
  setTimeout(warmEngine, 15_000).unref?.();
  w.opened = w.call("open", { path }, LIMITS.open);
  try {
    await w.opened;
  } catch (e) {
    w.kill();
    throw e;
  }
  return w;
}

/** Starts the spare worker if there isn't one (at server start, and after each is put to use). */
export function warmEngine() {
  if (useInlineEngine) return;
  startReaper();
  if (SPARE && (!state.spare || state.spare.dead)) state.spare = new EngineWorker("");
}

async function inline() {
  return import("./inline");
}

/** Runs one engine request on the design `path` (the upload `key`'s file). */
export async function engine<K extends Exclude<Op, "open">>(key: string, path: string, op: K, args: Args<K>): Promise<WorkerResult[K]> {
  if (useInlineEngine) return (await inline()).inlineEngine(key, path, op, args);
  startReaper();
  const w = await workerFor(key, path);
  return w.call(op, args, LIMITS[op]);
}

/** Opens the design (parsing it) and returns its pages. */
export async function openDesign(key: string, path: string): Promise<WorkerResult["open"]> {
  if (useInlineEngine) return (await inline()).inlineOpenDesign(key, path);
  startReaper();
  const w = await workerFor(key, path);
  return w.opened!;
}

/** Stops the upload's worker, if it has one (before its files are deleted). */
export function closeDesign(key: string) {
  if (useInlineEngine) void inline().then((m) => m.inlineCloseDesign(key));
  else state.workers.get(key)?.kill();
}
