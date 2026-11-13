import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// H-06 / D-042. Vercel compiles api/index.ts with @vercel/node, which emits the function as CommonJS
// only when the tsconfig nearest the entry says so. The root tsconfig (module ESNext, for Vite) must
// not reach the function, or the deployed /var/task/api/index.js keeps `import` statements and Node
// fails with "Cannot use import statement outside a module". This suite compiles the function the
// way the build does, with api/tsconfig.json, and checks the output is CJS and loads under plain node.

const repo = fileURLToPath(new URL("..", import.meta.url));
const apiDir = path.join(repo, "api");

function compileFunction(outDir: string) {
  const configPath = path.join(apiDir, "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  expect(read.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, apiDir, undefined, configPath);
  expect(parsed.errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);

  const options: ts.CompilerOptions = { ...parsed.options, outDir, rootDir: repo };
  const program = ts.createProgram([path.join(apiDir, "index.ts")], options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  expect(diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))).toEqual([]);
  const emit = program.emit();
  expect(emit.emitSkipped).toBe(false);
}

// A line that starts with import/export is ESM syntax. require() and exports.x = ... are CJS.
const ESM_LINE = /^\s*(import\s[^(]|export\s)/m;

describe("api/index.ts compiles to CommonJS (H-06)", () => {
  it("the function tsconfig asks for CommonJS, not ESNext", () => {
    const read = ts.readConfigFile(path.join(apiDir, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, apiDir, undefined, path.join(apiDir, "tsconfig.json"));
    expect(parsed.options.module).toBe(ts.ModuleKind.CommonJS);
    expect(parsed.options.noEmit).toBeFalsy();
  });

  it("emits api/index.js with require() and no import/export statements, through the whole src/ graph", () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-cjs-"));
    try {
      compileFunction(outDir);
      const entry = fs.readFileSync(path.join(outDir, "api", "index.js"), "utf8");
      expect(entry).not.toMatch(ESM_LINE);
      expect(entry).toMatch(/require\("\.\.\/src\/app"\)/);

      const emitted = walkJs(outDir);
      expect(emitted.length).toBeGreaterThan(5);
      for (const file of emitted) {
        expect(fs.readFileSync(file, "utf8"), file).not.toMatch(ESM_LINE);
      }
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("the compiled entry loads under plain node as CJS and exports the Express app as default", () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "vercel-cjs-"));
    try {
      compileFunction(outDir);
      const entry = path.join(outDir, "api", "index.js");
      // Plain node, no tsx, no vitest. NODE_PATH lets the emitted files find the repo's node_modules.
      // Loading must not listen or start timers, so the child exits by itself; the timeout guards a hang.
      const script = `const m = require(process.argv[1]); if (typeof m.default !== "function") { console.error("no default function"); process.exit(3); } console.log("LOADED_OK");`;
      const res = spawnSync(process.execPath, ["-e", script, entry], {
        encoding: "utf8",
        timeout: 30_000,
        env: {
          PATH: process.env.PATH,
          NODE_PATH: path.join(repo, "node_modules"),
          // Placeholder: the client connects lazily, so loading needs a URL, not a database.
          DATABASE_URL: "postgresql://user:password@127.0.0.1:1/unused",
        },
      });
      expect(res.error).toBeUndefined();
      expect(res.stderr).not.toMatch(/Cannot use import statement|Failed to load the ES module/);
      expect(res.status, res.stderr).toBe(0);
      expect(res.stdout).toContain("LOADED_OK");
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});

function walkJs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(p));
    else if (entry.name.endsWith(".js")) out.push(p);
  }
  return out;
}
