import { promises as fs } from "node:fs";
import path from "node:path";

export async function collectDirectoryFiles(localDir, toDir = "", filters = []) {
  const excluded = new Set(filters);
  const files = [];

  async function collect(currentDir, currentToDir) {
    for (const entry of await fs.readdir(currentDir, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;

      const localPath = path.join(currentDir, entry.name);
      const toPath = `${currentToDir}${entry.name}`;
      const isDirectory = entry.isDirectory() || (entry.isSymbolicLink() && (await fs.stat(localPath)).isDirectory());
      if (isDirectory) {
        await collect(localPath, `${toPath}/`);
      } else {
        files.push({ localPath, toPath });
      }
    }
  }

  await collect(localDir, toDir);
  return files;
}

export async function addDirectoryFilesToZips(zips, localDir, toDir = "", filters = [], addFile) {
  for (const { localPath, toPath } of await collectDirectoryFiles(localDir, toDir, filters)) {
    const content = await fs.readFile(localPath);
    await Promise.all(zips.map((zip) => addFile(zip, toPath, content)));
  }
}
