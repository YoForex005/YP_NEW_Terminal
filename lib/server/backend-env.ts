import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const resolveRepoRoot = (): string => {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === "frontend" ? path.dirname(cwd) : cwd;
};

const loadEnvFileValue = (envPath: string, key: string): string | undefined => {
  if (!existsSync(envPath)) {
    return undefined;
  }

  const raw = readFileSync(envPath, "utf8");
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const [entryKey, ...rest] = trimmed.split("=");
    if (entryKey.trim() !== key) {
      continue;
    }
    const value = rest.join("=").trim();
    if (!value) {
      return undefined;
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1).trim();
    }
    return value;
  }

  return undefined;
};

export const resolveBackendEnvValue = (key: string): string | undefined => {
  const direct = process.env[key]?.trim();
  if (direct) {
    return direct;
  }

  const repoRoot = resolveRepoRoot();
  const envPaths = [
    path.join(repoRoot, "backend c++", ".env.local"),
    path.join(repoRoot, "backend c++", ".env"),
  ];

  for (const envPath of envPaths) {
    const value = loadEnvFileValue(envPath, key);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return undefined;
};
