import fs from "node:fs/promises";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";
import type { D1BindingManifest } from "./manifest.js";
import { deploymentDir, type DeploymentRecord, type Store } from "./storage.js";

type SqliteDatabase = Database<sqlite3.Database, sqlite3.Statement>;
type SqlValue = string | number | boolean | null | Uint8Array;

const dbCache = new Map<string, Promise<SqliteDatabase>>();

const openDb = async (filename: string): Promise<SqliteDatabase> => {
  let cached = dbCache.get(filename);
  if (!cached) {
    cached = (async () => {
      await fs.mkdir(path.dirname(filename), { recursive: true });
      const db = await open({ filename, driver: sqlite3.Database });
      await db.exec("PRAGMA journal_mode = WAL;");
      await db.exec("PRAGMA foreign_keys = ON;");
      return db;
    })();
    dbCache.set(filename, cached);
  }
  return cached;
};

const bindingRoot = (store: Store, record: DeploymentRecord, kind: "kv" | "d1", binding: string): string =>
  path.join(store.dataDir, "bindings", record.owner, record.repo, record.environment, kind, binding);

const toBuffer = async (value: unknown): Promise<Buffer> => {
  if (typeof value === "string") return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ReadableStream) return Buffer.from(await new Response(value).arrayBuffer());
  return Buffer.from(String(value));
};

export class LocalKVNamespace {
  private db?: Promise<SqliteDatabase>;

  constructor(private readonly filename: string) {}

  private async database(): Promise<SqliteDatabase> {
    this.db ||= (async () => {
      const db = await openDb(this.filename);
      await db.exec(`
        CREATE TABLE IF NOT EXISTS kv_entries (
          key TEXT PRIMARY KEY,
          value BLOB NOT NULL,
          metadata TEXT,
          expires_at INTEGER,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      return db;
    })();
    return this.db;
  }

  async get(key: string, type: "text" | "json" | "arrayBuffer" = "text"): Promise<unknown> {
    const row = await (await this.database()).get<{ value: Buffer }>(
      "SELECT value FROM kv_entries WHERE key = ? AND (expires_at IS NULL OR expires_at > strftime('%s','now'))",
      key
    );
    if (!row) return null;
    if (type === "arrayBuffer") return row.value.buffer.slice(row.value.byteOffset, row.value.byteOffset + row.value.byteLength);
    const text = row.value.toString("utf8");
    return type === "json" ? JSON.parse(text) : text;
  }

  async getWithMetadata(key: string, type: "text" | "json" | "arrayBuffer" = "text"): Promise<{ value: unknown; metadata: unknown }> {
    const row = await (await this.database()).get<{ value: Buffer; metadata: string | null }>(
      "SELECT value, metadata FROM kv_entries WHERE key = ? AND (expires_at IS NULL OR expires_at > strftime('%s','now'))",
      key
    );
    if (!row) return { value: null, metadata: null };
    const value = type === "arrayBuffer" ? row.value.buffer.slice(row.value.byteOffset, row.value.byteOffset + row.value.byteLength) : row.value.toString("utf8");
    return {
      value: type === "json" && typeof value === "string" ? JSON.parse(value) : value,
      metadata: row.metadata ? JSON.parse(row.metadata) : null
    };
  }

  async put(
    key: string,
    value: unknown,
    options: { expiration?: number; expirationTtl?: number; metadata?: unknown } = {}
  ): Promise<void> {
    const expiresAt = options.expirationTtl
      ? Math.floor(Date.now() / 1000) + options.expirationTtl
      : options.expiration
        ? Math.floor(options.expiration)
        : null;
    await (await this.database()).run(
      `INSERT INTO kv_entries (key, value, metadata, expires_at, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         metadata = excluded.metadata,
         expires_at = excluded.expires_at,
         updated_at = CURRENT_TIMESTAMP`,
      key,
      await toBuffer(value),
      options.metadata === undefined ? null : JSON.stringify(options.metadata),
      expiresAt
    );
  }

  async delete(key: string): Promise<void> {
    await (await this.database()).run("DELETE FROM kv_entries WHERE key = ?", key);
  }

  async list(options: { prefix?: string; limit?: number; cursor?: string } = {}): Promise<{
    keys: Array<{ name: string; metadata: unknown }>;
    list_complete: boolean;
    cursor?: string;
  }> {
    const limit = Math.max(1, Math.min(options.limit || 1000, 1000));
    const offset = options.cursor ? Number.parseInt(options.cursor, 10) || 0 : 0;
    const prefix = options.prefix || "";
    const rows = await (await this.database()).all<{ key: string; metadata: string | null }[]>(
      `SELECT key, metadata FROM kv_entries
       WHERE key LIKE ? AND (expires_at IS NULL OR expires_at > strftime('%s','now'))
       ORDER BY key ASC LIMIT ? OFFSET ?`,
      `${prefix}%`,
      limit + 1,
      offset
    );
    const page = rows.slice(0, limit);
    return {
      keys: page.map((row) => ({ name: row.key, metadata: row.metadata ? JSON.parse(row.metadata) : null })),
      list_complete: rows.length <= limit,
      cursor: rows.length > limit ? String(offset + limit) : undefined
    };
  }
}

class LocalD1PreparedStatement {
  constructor(
    private readonly db: LocalD1Database,
    private readonly sql: string,
    private readonly params: SqlValue[] = []
  ) {}

  bind(...params: SqlValue[]): LocalD1PreparedStatement {
    return new LocalD1PreparedStatement(this.db, this.sql, params);
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: true; meta: Record<string, unknown> }> {
    const started = Date.now();
    const results = await this.db.database().then((database) => database.all<T[]>(this.sql, ...this.params));
    return { results, success: true, meta: { duration: Date.now() - started } };
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | unknown | null> {
    const row = await this.db.database().then((database) => database.get<T>(this.sql, ...this.params));
    if (!row) return null;
    return column ? (row as Record<string, unknown>)[column] : row;
  }

  async run(): Promise<{ success: true; meta: Record<string, unknown> }> {
    const started = Date.now();
    const result = await this.db.database().then((database) => database.run(this.sql, ...this.params));
    return {
      success: true,
      meta: {
        duration: Date.now() - started,
        changes: result.changes,
        last_row_id: result.lastID
      }
    };
  }

  async raw(): Promise<unknown[][]> {
    const rows = await this.db.database().then((database) => database.all<Record<string, unknown>[]>(this.sql, ...this.params));
    return rows.map((row) => Object.values(row));
  }
}

export class LocalD1Database {
  constructor(private readonly filename: string) {}

  async database(): Promise<SqliteDatabase> {
    return openDb(this.filename);
  }

  prepare(sql: string): LocalD1PreparedStatement {
    return new LocalD1PreparedStatement(this, sql);
  }

  async batch(statements: LocalD1PreparedStatement[]): Promise<Array<unknown>> {
    const results = [];
    await (await this.database()).exec("BEGIN");
    try {
      for (const statement of statements) {
        results.push(await statement.run());
      }
      await (await this.database()).exec("COMMIT");
      return results;
    } catch (error) {
      await (await this.database()).exec("ROLLBACK");
      throw error;
    }
  }
}

export const createRuntimeBindings = async (
  store: Store,
  record: DeploymentRecord,
  vars: Record<string, string>,
  secrets: Record<string, string>
): Promise<Record<string, unknown>> => {
  const bindings: Record<string, unknown> = { ...vars, ...secrets };
  for (const binding of record.bindings.kv) {
    bindings[binding] = new LocalKVNamespace(path.join(bindingRoot(store, record, "kv", binding), "kv.sqlite"));
  }
  for (const binding of record.bindings.d1) {
    bindings[binding.binding] = new LocalD1Database(path.join(bindingRoot(store, record, "d1", binding.binding), "db.sqlite"));
  }
  return bindings;
};

export const applyD1Migrations = async (store: Store, record: DeploymentRecord, sourceDir: string): Promise<void> => {
  for (const binding of record.bindings.d1) {
    if (!binding.migrations) continue;
    const migrationsDir = path.join(sourceDir, binding.migrations);
    let files: string[];
    try {
      files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const db = new LocalD1Database(path.join(bindingRoot(store, record, "d1", binding.binding), "db.sqlite"));
    await (await db.database()).exec(`
      CREATE TABLE IF NOT EXISTS _w7s_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    for (const file of files) {
      const database = await db.database();
      const alreadyApplied = await database.get("SELECT filename FROM _w7s_migrations WHERE filename = ?", file);
      if (alreadyApplied) continue;
      const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
      await database.exec("BEGIN");
      try {
        await database.exec(sql);
        await database.run("INSERT INTO _w7s_migrations (filename) VALUES (?)", file);
        await database.exec("COMMIT");
      } catch (error) {
        await database.exec("ROLLBACK");
        throw error;
      }
    }
  }
};

export const runtimeMetadataPath = (store: Store, record: DeploymentRecord): string =>
  path.join(deploymentDir(store, record), "runtime.json");
