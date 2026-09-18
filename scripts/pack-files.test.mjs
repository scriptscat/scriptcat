import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";
import os from "node:os";
import { addDirectoryFilesToZips, collectDirectoryFiles } from "./pack-files.mjs";

const tmpDirs = [];

afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe("pack 文件清单", () => {
  it("单次遍历收集嵌套文件并过滤指定名称", async () => {
    const root = path.join(os.tmpdir(), `pack-files-${Math.random().toString(36).slice(2)}`);
    tmpDirs.push(root);
    mkdirSync(path.join(root, "nested"), { recursive: true });
    writeFileSync(path.join(root, "manifest.json"), "root manifest");
    writeFileSync(path.join(root, "app.js"), "root app");
    writeFileSync(path.join(root, "nested", "app.js"), "nested app");
    writeFileSync(path.join(root, "nested", "manifest.json"), "nested manifest");
    writeFileSync(path.join(root, "nested", "asset.bin"), Buffer.from([0, 255, 128, 1]));

    const files = await collectDirectoryFiles(root, "", ["manifest.json"]);

    expect(files.map(({ toPath }) => toPath).sort()).toEqual(["app.js", "nested/app.js", "nested/asset.bin"]);
    expect(files.every(({ localPath }) => !localPath.endsWith("manifest.json"))).toBe(true);
    expect(
      Object.fromEntries(
        await Promise.all(files.map(async ({ localPath, toPath }) => [toPath, await readFile(localPath)]))
      )
    ).toEqual({
      "app.js": Buffer.from("root app"),
      "nested/app.js": Buffer.from("nested app"),
      "nested/asset.bin": Buffer.from([0, 255, 128, 1]),
    });

    const archives = [[], []];
    await addDirectoryFilesToZips(archives, root, "", ["manifest.json"], async (archive, toPath, content) => {
      archive.push([toPath, Buffer.from(content)]);
    });
    expect(archives).toEqual([
      [
        ["app.js", Buffer.from("root app")],
        ["nested/app.js", Buffer.from("nested app")],
        ["nested/asset.bin", Buffer.from([0, 255, 128, 1])],
      ],
      [
        ["app.js", Buffer.from("root app")],
        ["nested/app.js", Buffer.from("nested app")],
        ["nested/asset.bin", Buffer.from([0, 255, 128, 1])],
      ],
    ]);
  });
});
