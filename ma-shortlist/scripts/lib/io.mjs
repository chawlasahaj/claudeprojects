import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// --name value / --flag  ->  { name: "value", flag: true }
export function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[name] = true;
    else {
      out[name] = next;
      i++;
    }
  }
  return out;
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    if (fallback !== undefined && e.code === "ENOENT") return fallback;
    throw e;
  }
}

export function writeJson(file, value, { pretty = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, pretty ? 2 : 0) + "\n");
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch with retries on network errors, 429 and 5xx.
export async function fetchRetry(url, opts = {}, tries = 5) {
  let wait = 2000;
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (i >= tries || (res.status !== 429 && res.status < 500)) {
        throw new Error(`${res.status} ${res.statusText} for ${url}`);
      }
    } catch (e) {
      if (i >= tries || /^\d{3} /.test(e.message)) throw e;
    }
    await sleep(wait);
    wait *= 2;
  }
}

export const today = () => new Date().toISOString().slice(0, 10);
