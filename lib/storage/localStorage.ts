import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const localStorageProvider = {
  readText(path: string) {
    const resolved = resolve(path);
    if (!existsSync(resolved)) return null;
    return readFileSync(resolved, "utf8");
  },
  writeText(path: string, content: string) {
    const resolved = resolve(path);
    mkdirSync(dirname(resolved), { recursive: true });
    writeFileSync(resolved, content);
    return resolved;
  }
};
