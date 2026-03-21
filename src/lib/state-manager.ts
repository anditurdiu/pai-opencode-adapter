import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileLog } from "./file-logger.js";

const DEFAULT_STORAGE_DIR = join(process.env.HOME || "~", ".opencode", "pai-state");
const STATE_CACHE_TTL_MS = 1800000;

interface CachedEntry<T> {
  state: T;
  timestamp: number;
}

export class StateManager<T> {
  private storageDir: string;
  private namespace: string;
  private cache: Map<string, CachedEntry<T>>;

  constructor(storageDir?: string, namespace?: string) {
    this.storageDir = storageDir || DEFAULT_STORAGE_DIR;
    this.namespace = namespace || "";
    this.cache = new Map<string, CachedEntry<T>>();
    this.ensureStorageDir();
  }

  /**
   * Build the filename for a session, applying namespace prefix if set.
   * With namespace "context": session "abc" -> "context--abc.json"
   * Without namespace: session "abc" -> "abc.json"
   */
  private fileKey(sessionId: string): string {
    return this.namespace ? `${this.namespace}--${sessionId}` : sessionId;
  }

  private ensureStorageDir(): void {
    try {
      if (!existsSync(this.storageDir)) {
        mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (error) {
      fileLog(`Failed to create storage directory: ${error}`, "error");
    }
  }

  get(sessionId: string): T | undefined {
    try {
      const cached = this.cache.get(sessionId);

      if (cached) {
        if (Date.now() - cached.timestamp < STATE_CACHE_TTL_MS) {
          return cached.state;
        }
        this.cache.delete(sessionId);
        this.deleteFromDisk(sessionId);
        return undefined;
      }

      const state = this.loadFromDisk(sessionId);
      if (state !== undefined) {
        this.cache.set(sessionId, { state, timestamp: Date.now() });
      }

      return state;
    } catch (error) {
      fileLog(`StateManager.get failed for session ${sessionId}: ${error}`, "error");
      return undefined;
    }
  }

  set(sessionId: string, state: T): void {
    try {
      this.cache.set(sessionId, { state, timestamp: Date.now() });
      this.persistToDisk(sessionId, state);
    } catch (error) {
      fileLog(`StateManager.set failed for session ${sessionId}: ${error}`, "error");
    }
  }

  delete(sessionId: string): void {
    try {
      this.cache.delete(sessionId);
      this.deleteFromDisk(sessionId);
    } catch (error) {
      fileLog(`StateManager.delete failed for session ${sessionId}: ${error}`, "error");
    }
  }

  getAll(): Map<string, T> {
    const result = new Map<string, T>();

    for (const [sessionId, cached] of this.cache.entries()) {
      if (Date.now() - cached.timestamp < STATE_CACHE_TTL_MS) {
        result.set(sessionId, cached.state);
      } else {
        this.cache.delete(sessionId);
        this.deleteFromDisk(sessionId);
      }
    }

    return result;
  }

  private persistToDisk(sessionId: string, state: T): void {
    const filePath = join(this.storageDir, `${this.fileKey(sessionId)}.json`);
    const tempPath = `${filePath}.tmp`;

    try {
      writeFileSync(tempPath, JSON.stringify({ state, timestamp: Date.now() }, null, 2));
      renameSync(tempPath, filePath);
    } catch (error) {
      try {
        if (existsSync(tempPath)) {
          rmSync(tempPath);
        }
      } catch {
      }
      throw error;
    }
  }

  private loadFromDisk(sessionId: string): T | undefined {
    const filePath = join(this.storageDir, `${this.fileKey(sessionId)}.json`);

    try {
      if (!existsSync(filePath)) {
        return undefined;
      }

      const data = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);

      return parsed.state as T;
    } catch (error) {
      fileLog(`Failed to load state from disk for ${sessionId}: ${error}`, "warn");
      return undefined;
    }
  }

  private deleteFromDisk(sessionId: string): void {
    const filePath = join(this.storageDir, `${this.fileKey(sessionId)}.json`);

    try {
      if (existsSync(filePath)) {
        rmSync(filePath);
      }
    } catch (error) {
      fileLog(`Failed to delete state file for ${sessionId}: ${error}`, "warn");
    }
  }
}
