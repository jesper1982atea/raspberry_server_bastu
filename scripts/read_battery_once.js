#!/usr/bin/env node
"use strict";

// Reads BM2 battery voltage once by spawning a Python script.
// Prints only the voltage to stdout on success (e.g., "12.45").

const { spawn } = require("child_process");

const DEFAULT_PYTHON = "/home/jesper/bm2-battery-monitor/.venv/bin/python";
const DEFAULT_SCRIPT = "/home/jesper/bm2-battery-monitor/bm2_python/voltage_once.py";

function run(timeoutMs = 70_000, opts = {}) {
  const PYTHON = opts.python || process.env.BM2_PYTHON || DEFAULT_PYTHON;
  const SCRIPT = opts.script || process.env.BM2_SCRIPT || DEFAULT_SCRIPT;

  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON, [SCRIPT], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let done = false;

    const t = setTimeout(() => {
      if (done) return;
      done = true;
      try { proc.kill("SIGKILL"); } catch {}
      reject(new Error("Timeout from Python voltage script"));
    }, timeoutMs);

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("close", () => {
      clearTimeout(t);
      const out = stdout.trim();
      if (!out) return reject(new Error(`No output. Stderr: ${stderr.trim()}`));
      if (out.toLowerCase().includes("failed to connect")) return reject(new Error(out));
      const v = parseFloat(out);
      if (Number.isNaN(v)) return reject(new Error(`Parse error: "${out}"`));
      resolve(v);
    });

    proc.on("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

if (require.main === module) {
  const timeoutMs = Number(process.env.BM2_TIMEOUT_MS || 70_000);
  run(timeoutMs)
    .then((v) => {
      console.log(v.toFixed(2));
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { run };

