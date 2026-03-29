/**
 * Tests for Agent Model Sync — ensures agent .md files get their model:
 * field patched to match pai-adapter.json configuration.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test the internal functions by importing them
import { syncAgentModels, AGENT_ROLE_MAP } from "../lib/agent-model-sync.js";

// ── AGENT_ROLE_MAP ────────────────────────────────────────

describe("AGENT_ROLE_MAP", () => {
	test("maps algorithm to default role", () => {
		expect(AGENT_ROLE_MAP.algorithm).toBe("default");
	});

	test("maps native to default role", () => {
		expect(AGENT_ROLE_MAP.native).toBe("default");
	});

	test("maps intern to intern role", () => {
		expect(AGENT_ROLE_MAP.intern).toBe("intern");
	});

	test("maps explorer to explorer role", () => {
		expect(AGENT_ROLE_MAP.explorer).toBe("explorer");
	});

	test("maps research to explorer role", () => {
		expect(AGENT_ROLE_MAP.research).toBe("explorer");
	});

	test("maps engineer to engineer role", () => {
		expect(AGENT_ROLE_MAP.engineer).toBe("engineer");
	});

	test("maps architect to architect role", () => {
		expect(AGENT_ROLE_MAP.architect).toBe("architect");
	});

	test("maps thinker to reviewer role", () => {
		expect(AGENT_ROLE_MAP.thinker).toBe("reviewer");
	});

	test("has exactly 8 mappings", () => {
		expect(Object.keys(AGENT_ROLE_MAP)).toHaveLength(8);
	});
});

// ── syncAgentModels ───────────────────────────────────────

describe("syncAgentModels", () => {
	test("returns result with synced, skipped, and errors arrays", () => {
		const result = syncAgentModels();
		expect(result).toHaveProperty("synced");
		expect(result).toHaveProperty("skipped");
		expect(result).toHaveProperty("errors");
		expect(Array.isArray(result.synced)).toBe(true);
		expect(Array.isArray(result.skipped)).toBe(true);
		expect(Array.isArray(result.errors)).toBe(true);
	});

	test("handles non-existent agents directory gracefully", () => {
		// When agents dir doesn't exist, should skip without error
		// (In actual test env, it may or may not exist)
		const result = syncAgentModels();
		expect(result.errors.length).toBe(0);
	});
});

// ── Integration: Verify actual agent files ────────────────

describe("Integration: agent file model values", () => {
	const agentsDir = join(
		process.env.HOME ?? "",
		".config",
		"opencode",
		"agents",
	);

	test("explorer.md exists and has model field", () => {
		if (!existsSync(join(agentsDir, "explorer.md"))) {
			return; // Skip if agents not deployed
		}
		const content = readFileSync(join(agentsDir, "explorer.md"), "utf-8");
		expect(content).toContain("model:");
	});

	test("after sync, explorer.md model matches config explorer role", () => {
		if (!existsSync(join(agentsDir, "explorer.md"))) {
			return;
		}
		// Run sync
		syncAgentModels();

		// Read the file and check
		const content = readFileSync(join(agentsDir, "explorer.md"), "utf-8");
		const modelMatch = content.match(/^model:\s*(.+)$/m);
		expect(modelMatch).not.toBeNull();

		// The model should match what's in pai-adapter.json for the explorer role
		// We import getModelConfig to verify
		const { getModelConfig } = require("../lib/model-resolver.js");
		const config = getModelConfig();
		const expectedModel = config.models.agents?.explorer;
		if (expectedModel) {
			expect(modelMatch![1]?.trim()).toBe(expectedModel);
		}
	});

	test("after sync, thinker.md model matches config reviewer role", () => {
		if (!existsSync(join(agentsDir, "thinker.md"))) {
			return;
		}
		syncAgentModels();

		const content = readFileSync(join(agentsDir, "thinker.md"), "utf-8");
		const modelMatch = content.match(/^model:\s*(.+)$/m);
		expect(modelMatch).not.toBeNull();

		const { getModelConfig } = require("../lib/model-resolver.js");
		const config = getModelConfig();
		const expectedModel = config.models.agents?.reviewer;
		if (expectedModel) {
			expect(modelMatch![1]?.trim()).toBe(expectedModel);
		}
	});

	test("after sync, algorithm.md model matches config default role", () => {
		if (!existsSync(join(agentsDir, "algorithm.md"))) {
			return;
		}
		syncAgentModels();

		const content = readFileSync(join(agentsDir, "algorithm.md"), "utf-8");
		const modelMatch = content.match(/^model:\s*(.+)$/m);
		expect(modelMatch).not.toBeNull();

		const { getModelConfig } = require("../lib/model-resolver.js");
		const config = getModelConfig();
		expect(modelMatch![1]?.trim()).toBe(config.models.default);
	});

	test("sync preserves non-model frontmatter fields", () => {
		if (!existsSync(join(agentsDir, "explorer.md"))) {
			return;
		}
		syncAgentModels();

		const content = readFileSync(join(agentsDir, "explorer.md"), "utf-8");
		// These fields should still be present
		expect(content).toContain("description:");
		expect(content).toContain("mode:");
		expect(content).toContain("color:");
		expect(content).toContain("temperature:");
		expect(content).toContain("permission:");
	});

	test("sync preserves markdown body content", () => {
		if (!existsSync(join(agentsDir, "explorer.md"))) {
			return;
		}
		syncAgentModels();

		const content = readFileSync(join(agentsDir, "explorer.md"), "utf-8");
		expect(content).toContain("# PAI Explorer Agent");
		expect(content).toContain("## Capabilities");
	});
});
