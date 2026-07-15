import fs from "node:fs/promises";
import path from "node:path";

export interface D1BindingManifest {
  binding: string;
  migrations?: string;
}

export interface W7SManifest {
  vars: string[];
  secrets: string[];
  bindings: {
    kv: string[];
    d1: D1BindingManifest[];
  };
}

const emptyManifest = (): W7SManifest => ({
  vars: [],
  secrets: [],
  bindings: {
    kv: [],
    d1: []
  }
});

const isBindingName = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);

const names = (value: unknown): string[] => (Array.isArray(value) ? value.filter(isBindingName) : []);

const d1Bindings = (value: unknown): D1BindingManifest[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (isBindingName(entry)) return { binding: entry };
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        if (!isBindingName(record.binding)) return undefined;
        return {
          binding: record.binding,
          migrations: typeof record.migrations === "string" && record.migrations.trim() ? record.migrations : undefined
        };
      }
      return undefined;
    })
    .filter((entry): entry is D1BindingManifest => Boolean(entry));
};

export const readManifest = async (sourceDir: string): Promise<W7SManifest> => {
  const manifestPath = path.join(sourceDir, "w7s.json");
  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyManifest();
    throw error;
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const bindings = parsed.bindings && typeof parsed.bindings === "object" ? (parsed.bindings as Record<string, unknown>) : {};

  return {
    vars: names(parsed.vars),
    secrets: names(parsed.secrets),
    bindings: {
      kv: names(bindings.kv),
      d1: d1Bindings(bindings.d1)
    }
  };
};

export const decodeHeaderBindings = (value: string | string[] | undefined): Record<string, string> => {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) return {};
  const parsed = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(parsed)) {
    if (isBindingName(key) && (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean")) {
      result[key] = String(entry);
    }
  }
  return result;
};
