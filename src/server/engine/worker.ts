/**
 * Engine worker process: parses .fig files in an isolated child process (see pool.ts).
 * On Vercel, the inline runner is used instead.
 */
import { createInterface } from "node:readline";
import { EngineRunner } from "./runner";
import type { WorkerReply, WorkerRequest } from "./protocol";

const send = process.stdout.write.bind(process.stdout);
const toStderr = (...args: unknown[]) => void process.stderr.write(`${args.map((a) => (a instanceof Error ? a.stack : String(a))).join(" ")}\n`);
console.log = console.info = console.warn = console.debug = toStderr;

const runner = new EngineRunner();
let queue = Promise.resolve();
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  queue = queue.then(async () => {
    let req: WorkerRequest;
    try {
      req = JSON.parse(line) as WorkerRequest;
    } catch {
      return;
    }
    let reply: WorkerReply;
    try {
      reply = { id: req.id, ok: true, result: await runner.handle(req) };
    } catch (e) {
      toStderr(e);
      reply = { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    send(`${JSON.stringify(reply)}\n`);
  });
});
lines.on("close", () => process.exit(0));
send(`${JSON.stringify({ id: 0, ok: true, result: "ready" })}\n`);
