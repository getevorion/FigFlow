import "server-only";
import { EngineRunner } from "./runner";
import type { WorkerRequest, WorkerResult } from "./protocol";
import { LIMITS } from "./limits";

type Op = WorkerRequest["op"];
type Args<K extends Op> = Omit<Extract<WorkerRequest, { op: K }>, "id" | "op">;

const PRIORITY = { open: 0, pick: 0, flow: 1, generate: 1, preview: 1, thumb: 2 } as const;

class InlineWorker {
  readonly runner = new EngineRunner();
  opened: Promise<WorkerResult["open"]> | null = null;
  lastUsed = Date.now();
  active = 0;
  private readonly queue: Array<{ priority: number; run: () => Promise<void> }> = [];
  private pumping = false;

  constructor(public key: string) {}

  call<K extends Op>(op: K, args: Args<K>, timeoutMs: number): Promise<WorkerResult[K]> {
    this.active++;
    const result = new Promise<WorkerResult[K]>((resolve, reject) => {
      this.queue.push({ priority: PRIORITY[op], run: () => this.withTimeout(op, args, timeoutMs).then(resolve, reject) });
      this.queue.sort((a, b) => a.priority - b.priority);
      void this.pump();
    });
    return result.finally(() => {
      this.active--;
      this.lastUsed = Date.now();
    });
  }

  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    while (this.queue.length) await this.queue.shift()!.run();
    this.pumping = false;
  }

  private withTimeout<K extends Op>(op: K, args: Args<K>, timeoutMs: number): Promise<WorkerResult[K]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`The engine took longer than ${Math.round(timeoutMs / 1000)} s and was stopped.`)), timeoutMs);
      this.runner
        .handle({ ...args, op, id: 0 } as WorkerRequest)
        .then((v) => (clearTimeout(timer), resolve(v as WorkerResult[K])))
        .catch((e) => (clearTimeout(timer), reject(e)));
    });
  }

  kill() {
    this.runner.close();
  }
}

type InlineState = { workers: Map<string, InlineWorker> };
const g = globalThis as typeof globalThis & { __figflowInline?: InlineState };
const state: InlineState = (g.__figflowInline ??= { workers: new Map() });

async function workerFor(key: string, path: string): Promise<InlineWorker> {
  let w = state.workers.get(key);
  if (!w) {
    w = new InlineWorker(key);
    state.workers.set(key, w);
    w.opened = w.call("open", { path }, LIMITS.open);
    await w.opened;
  }
  return w;
}

export async function inlineEngine<K extends Exclude<Op, "open">>(key: string, path: string, op: K, args: Args<K>): Promise<WorkerResult[K]> {
  const w = await workerFor(key, path);
  return w.call(op, args, LIMITS[op]);
}

export async function inlineOpenDesign(key: string, path: string): Promise<WorkerResult["open"]> {
  const w = await workerFor(key, path);
  return w.opened!;
}

export function inlineCloseDesign(key: string) {
  state.workers.get(key)?.kill();
  state.workers.delete(key);
}
