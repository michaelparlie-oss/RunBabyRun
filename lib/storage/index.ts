import fs from "node:fs/promises";
import path from "node:path";

/**
 * Per-runner document store. Every key belongs to exactly one owner (a Strava athlete id, or "sys");
 * callers pass the owner from the verified session, never from user input.
 * Backends: Netlify Blobs on Netlify (no setup, no extra cost) and JSON files in .data/ for local
 * development. Tests use the in-memory store. docs/netlify-database.md has a Postgres backend to
 * switch to when the number of runners grows.
 */
export interface DocStore {
  kind: string;
  get<T>(owner: string, key: string): Promise<T | null>;
  set(owner: string, key: string, value: unknown): Promise<void>;
  /** Create only if absent. Returns true when this call created it. */
  setIfNew(owner: string, key: string, value: unknown): Promise<boolean>;
  del(owner: string, key: string): Promise<void>;
  delAll(owner: string): Promise<void>;
}

const SAFE = /^[A-Za-z0-9_.-]+$/;
function check(owner: string, key: string) {
  if (!SAFE.test(owner) || !SAFE.test(key)) throw new Error("Invalid storage key");
}

export function memoryStore(): DocStore {
  const m = new Map<string, string>();
  const k = (o: string, key: string) => (check(o, key), `${o}/${key}`);
  return {
    kind: "memory",
    async get(o, key) { const v = m.get(k(o, key)); return v == null ? null : JSON.parse(v); },
    async set(o, key, value) { m.set(k(o, key), JSON.stringify(value)); },
    async setIfNew(o, key, value) { if (m.has(k(o, key))) return false; m.set(k(o, key), JSON.stringify(value)); return true; },
    async del(o, key) { m.delete(k(o, key)); },
    async delAll(o) { check(o, "x"); for (const key of [...m.keys()]) if (key.startsWith(`${o}/`)) m.delete(key); },
  };
}

export function fileStore(dir = path.join(/*turbopackIgnore: true*/ process.cwd(), ".data")): DocStore {
  const f = (o: string, key: string) => (check(o, key), path.join(dir, o, `${key}.json`));
  return {
    kind: "file",
    async get(o, key) { try { return JSON.parse(await fs.readFile(f(o, key), "utf8")); } catch { return null; } },
    async set(o, key, value) { await fs.mkdir(path.dirname(f(o, key)), { recursive: true }); await fs.writeFile(f(o, key), JSON.stringify(value)); },
    async setIfNew(o, key, value) {
      await fs.mkdir(path.dirname(f(o, key)), { recursive: true });
      try { await fs.writeFile(f(o, key), JSON.stringify(value), { flag: "wx" }); return true; } catch { return false; }
    },
    async del(o, key) { await fs.rm(f(o, key), { force: true }); },
    async delAll(o) { check(o, "x"); await fs.rm(path.join(dir, o), { recursive: true, force: true }); },
  };
}

async function blobStore(): Promise<DocStore> {
  const { getStore } = await import("@netlify/blobs");
  const store = () => getStore({ name: "runbabyrun", consistency: "strong" });
  const k = (o: string, key: string) => (check(o, key), `${o}/${key}`);
  return {
    kind: "netlify-blobs",
    async get(o, key) { return (await store().get(k(o, key), { type: "json" })) ?? null; },
    async set(o, key, value) { await store().setJSON(k(o, key), value); },
    async setIfNew(o, key, value) { return (await store().setJSON(k(o, key), value, { onlyIfNew: true })).modified; },
    async del(o, key) { await store().delete(k(o, key)); },
    async delAll(o) { check(o, "x"); const { blobs } = await store().list({ prefix: `${o}/` }); await Promise.all(blobs.map((b) => store().delete(b.key))); },
  };
}

const g = globalThis as unknown as { __rbrStore?: Promise<DocStore> };
export function setStoreForTests(s: DocStore | null) { g.__rbrStore = s ? Promise.resolve(s) : undefined; }

export function getStore(): Promise<DocStore> {
  if (!g.__rbrStore) {
    g.__rbrStore = (async () => {
      const onNetlify = process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT || process.env.SITE_ID || process.env.DEPLOY_ID || process.env.AWS_LAMBDA_FUNCTION_NAME;
      if (onNetlify || process.env.STORAGE === "blobs") return blobStore();
      return fileStore();
    })().catch((e) => { g.__rbrStore = undefined; throw e; });
  }
  return g.__rbrStore;
}
