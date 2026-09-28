/**
 * Runtime 插件存储控制器。
 *
 * 职责：
 * - 解析 Runtime 私有的插件代码目录，不向 Flutter Facade 暴露路径。
 * - 测量安装与缓存占用，并在独占插件租约下清理缓存。
 *
 * 注意：
 * - 调用前统一等待 PluginManager 初始化，避免重新扫描开发项目或安装目录。
 * - 缓存清理失败返回稳定的逐项终态；参数和插件身份错误仍抛出公开 Runtime 错误。
 */
import { lstat, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { measureInstallationTree, retainedArtifactPath } from "./plugin-installation-usage.js";
import {
  PluginManagerError,
  type InstalledPluginSnapshot,
  type PluginCacheClearItem,
  type PluginCacheClearResult,
  type PluginCacheUsage,
  type PluginCodeDirectory,
  type PluginInstallationUsage,
} from "./plugin-manager-contract.js";
import { exists, isMissingPath, isPluginId } from "./plugin-manager-files.js";
import type { PluginOperationCoordinator } from "./plugin-operation-coordinator.js";

interface PluginManagerStorageOptions {
  readonly cacheClearTimeoutMs: number;
  readonly dataRoot: string;
  readonly developmentProjectRoot: (pluginId: string) => string | undefined;
  readonly initialize: () => Promise<void>;
  readonly installedSnapshots: () => readonly InstalledPluginSnapshot[];
  readonly operations: PluginOperationCoordinator;
  readonly snapshots: () => readonly InstalledPluginSnapshot[];
}

/** Path-safe storage capabilities used by the PluginManager public facade. */
export class PluginManagerStorage {
  readonly #cacheClearTimeoutMs: number;
  readonly #dataRoot: string;
  readonly #developmentProjectRoot: (pluginId: string) => string | undefined;
  readonly #initialize: () => Promise<void>;
  readonly #installedSnapshots: () => readonly InstalledPluginSnapshot[];
  readonly #operations: PluginOperationCoordinator;
  readonly #snapshots: () => readonly InstalledPluginSnapshot[];

  constructor(options: PluginManagerStorageOptions) {
    this.#cacheClearTimeoutMs = options.cacheClearTimeoutMs;
    this.#dataRoot = options.dataRoot;
    this.#developmentProjectRoot = options.developmentProjectRoot;
    this.#initialize = options.initialize;
    this.#installedSnapshots = options.installedSnapshots;
    this.#operations = options.operations;
    this.#snapshots = options.snapshots;
  }

  async resolveCodeDirectory(pluginId: string): Promise<PluginCodeDirectory> {
    await this.#initialize();
    if (!isPluginId(pluginId)) throw new PluginManagerError("invalid_request");
    const developmentRoot = this.#developmentProjectRoot(pluginId);
    if (developmentRoot !== undefined) {
      return Object.freeze({
        directory: developmentRoot,
        kind: "development",
      } satisfies PluginCodeDirectory);
    }
    const snapshot = this.#installedSnapshots().find((item) => item.id === pluginId);
    if (snapshot === undefined) throw new PluginManagerError("plugin_not_found");
    const version = snapshot.activeVersion ?? snapshot.pendingVersion;
    if (version === null) throw new PluginManagerError("plugin_load_failed");
    const directory = resolve(
      this.#dataRoot,
      "plugins",
      pluginId,
      "versions",
      version,
    );
    if (await exists(directory)) {
      return Object.freeze({ directory, kind: "installed" } satisfies PluginCodeDirectory);
    }
    const archive = await retainedArtifactPath(this.#dataRoot, pluginId, version);
    if (await exists(archive)) {
      return Object.freeze({
        directory: resolve(this.#dataRoot, "plugin-archives", pluginId),
        kind: "archive",
      } satisfies PluginCodeDirectory);
    }
    throw new PluginManagerError("plugin_load_failed");
  }

  async listCacheUsage(pluginId?: string): Promise<readonly PluginCacheUsage[]> {
    await this.#initialize();
    const selected = this.#snapshots().filter((snapshot) =>
      pluginId === undefined || snapshot.id === pluginId
    );
    return Object.freeze(await Promise.all(selected.map(async (snapshot) =>
      Object.freeze({
        bytes: await this.#cacheBytes(snapshot.id),
        pluginId: snapshot.id,
      } satisfies PluginCacheUsage)
    )));
  }

  async measureInstallationUsage(
    pluginId: string,
    scope: "archive" | "data",
  ): Promise<PluginInstallationUsage> {
    await this.#initialize();
    if (
      !isPluginId(pluginId) ||
      (scope !== "archive" && scope !== "data")
    ) {
      throw new PluginManagerError("invalid_request");
    }
    const snapshot = this.#installedSnapshots().find((item) => item.id === pluginId);
    if (snapshot === undefined) throw new PluginManagerError("plugin_not_found");
    const version = snapshot.activeVersion ?? snapshot.pendingVersion;
    if (version === null) throw new PluginManagerError("plugin_load_failed");
    const versionRoot = resolve(
      this.#dataRoot,
      "plugins",
      pluginId,
      "versions",
      version,
    );
    const root = scope === "archive"
      ? await retainedArtifactPath(this.#dataRoot, pluginId, version)
      : versionRoot;
    const result = await measureInstallationTree(root);
    return Object.freeze({
      bytes: result.bytes,
      fileCount: result.fileCount,
      pluginId,
      scope,
      version,
    } satisfies PluginInstallationUsage);
  }

  async clearPluginCache(
    pluginId: string,
    signal?: AbortSignal,
    deadlineUnixMs?: string,
  ): Promise<PluginCacheClearResult> {
    await this.#initialize();
    if (!isPluginId(pluginId)) throw new PluginManagerError("invalid_request");
    if (!this.#snapshots().some((item) => item.id === pluginId)) {
      throw new PluginManagerError("plugin_not_found");
    }
    const cancellation = signal ?? new AbortController().signal;
    const deadline = deadlineUnixMs ?? String(Date.now() + this.#cacheClearTimeoutMs);
    return Object.freeze({
      items: Object.freeze([await this.#clearCache(pluginId, cancellation, deadline)]),
    } satisfies PluginCacheClearResult);
  }

  async clearAllPluginCaches(
    signal?: AbortSignal,
    deadlineUnixMs?: string,
  ): Promise<PluginCacheClearResult> {
    await this.#initialize();
    const pluginIds = this.#snapshots().map((item) => item.id);
    const cancellation = signal ?? new AbortController().signal;
    const deadline = deadlineUnixMs ?? String(Date.now() + this.#cacheClearTimeoutMs);
    return Object.freeze({
      items: Object.freeze(await Promise.all(pluginIds.map((pluginId) =>
        this.#clearCache(pluginId, cancellation, deadline)
      ))),
    } satisfies PluginCacheClearResult);
  }

  /** Clears cache only after current source/resource calls have released shared leases. */
  async #clearCache(
    pluginId: string,
    signal: AbortSignal,
    deadlineUnixMs: string,
  ): Promise<PluginCacheClearItem> {
    let release: (() => void) | undefined;
    let bytesBefore = 0;
    try {
      release = await this.#operations.acquireCacheClear(pluginId, signal, deadlineUnixMs);
      bytesBefore = await this.#cacheBytes(pluginId);
      const cacheDir = this.#cacheDirectory(pluginId);
      let entries: string[];
      try {
        entries = await readdir(cacheDir);
      } catch (error) {
        if (!isMissingPath(error)) throw error;
        entries = [];
      }
      await Promise.all(
        entries.map((entry) => rm(resolve(cacheDir, entry), { force: true, recursive: true })),
      );
      return Object.freeze({
        bytesBefore,
        bytesRemaining: await this.#cacheBytes(pluginId),
        pluginId,
        status: "cleared",
      } satisfies PluginCacheClearItem);
    } catch {
      let bytesRemaining = bytesBefore;
      try {
        bytesRemaining = await this.#cacheBytes(pluginId);
      } catch {
        // The terminal status remains useful even if the failed directory cannot be read.
      }
      return Object.freeze({
        bytesBefore,
        bytesRemaining,
        pluginId,
        status: "failed",
      } satisfies PluginCacheClearItem);
    } finally {
      release?.();
    }
  }

  async #cacheBytes(pluginId: string): Promise<number> {
    const root = this.#cacheDirectory(pluginId);
    try {
      return await this.#cacheBytesAt(root);
    } catch (error) {
      if (isMissingPath(error)) return 0;
      throw error;
    }
  }

  async #cacheBytesAt(path: string): Promise<number> {
    const metadata = await lstat(path);
    if (!metadata.isDirectory()) return metadata.size;
    const entries = await readdir(path, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      total += await this.#cacheBytesAt(resolve(path, entry.name));
      if (!Number.isSafeInteger(total)) throw new PluginManagerError("plugin_load_failed");
    }
    return total;
  }

  #cacheDirectory(pluginId: string): string {
    return resolve(this.#dataRoot, "plugin-cache", pluginId);
  }
}
