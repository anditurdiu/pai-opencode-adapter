/**
 * Agent Type Registry — Auto-Generated from PAI Discovery
 *
 * Maps PAI agent type references to their OpenCode equivalents.
 * All agent names match PAI's PascalCase convention.
 *
 * Auto-generated mappings:
 * - Lowercase aliases from discovered agent names (Architect → architect)
 * - Hyphenated aliases for compound names (ClaudeResearcher → claude-researcher)
 * - Static aliases for PAI subagent_types without Context.md files
 * - Legacy aliases for backward compatibility
 *
 * AGENT_PERMISSIONS is derived from the actual permission objects in
 * definitions.ts — no manually maintained parallel data structure.
 *
 * @module lib/agent-type-registry
 */

import { AGENT_NAMES, PAI_AGENT_REGISTRY } from "../agents/definitions.js";
import type { AgentPermission } from "../agents/definitions.js";
import { fileLog } from "../lib/file-logger.js";

// ── Session → Agent Type Mapping ──────────────────────────

const sessionAgentTypes = new Map<string, string>();

export function registerSubagentType(sessionId: string, agentType: string): void {
	sessionAgentTypes.set(sessionId, agentType);
}

export function getSubagentType(sessionId: string): string | null {
	return sessionAgentTypes.get(sessionId) ?? null;
}

export function isRegisteredSubagent(sessionId: string): boolean {
	return sessionAgentTypes.has(sessionId);
}

export function clearSubagentType(sessionId: string): void {
	sessionAgentTypes.delete(sessionId);
}

// ── PAI Agent Type Mapping (auto-generated) ───────────────

/**
 * Build the agent type map dynamically from discovered agent names.
 * Adds lowercase and hyphenated aliases, plus static aliases for
 * PAI subagent_types that don't have Context.md files.
 */
function buildAgentTypeMap(): Record<string, string> {
	const map: Record<string, string> = {};

	// Auto-generate from discovered agent names
	for (const name of AGENT_NAMES) {
		// Lowercase: "Architect" → "architect"
		map[name.toLowerCase()] = name;

		// Hyphenated: "ClaudeResearcher" → "claude-researcher"
		const hyphenated = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
		if (hyphenated !== name.toLowerCase()) {
			map[hyphenated] = name;
		}
	}

	// OpenCode built-in aliases
	map["general"] = "Engineer";

	// PAI subagent_types without Context.md files (from PAIAGENTSYSTEM.md)
	// These are Claude Code built-ins or PAI phantom agents.
	map["general-purpose"] = "GeneralPurpose";
	map["pentester"] = "Pentester";
	map["Pentester"] = "Pentester";
	map["Plan"] = "Plan";
	map["Explore"] = "explore"; // Map PAI's PascalCase name to OpenCode's built-in (Issue #1)

	// Manual aliases for agents whose PascalCase doesn't hyphenate cleanly
	map["ui-reviewer"] = "UIReviewer";

	// Legacy aliases from old adapter names (backward compat)
	map["research"] = "GeminiResearcher";
	map["research-claude"] = "ClaudeResearcher";
	map["explorer"] = "GeminiResearcher";
	map["intern"] = "CodexResearcher";
	map["thinker"] = "Architect";
	map["researcher"] = "GeminiResearcher";
	map["researchagent"] = "GeminiResearcher";
	map["codeexplorer"] = "GeminiResearcher";
	map["code-explorer"] = "GeminiResearcher";
	map["codeengineer"] = "Engineer";
	map["code-engineer"] = "Engineer";
	map["implementer"] = "Engineer";
	map["analyst"] = "Architect";
	map["reasoner"] = "Architect";
	map["planner"] = "Architect";

	fileLog(
		`[agent-type-registry] Built agent type map: ${Object.keys(map).length} entries from ${AGENT_NAMES.length} discovered agents`,
		"debug",
	);

	return map;
}

export const PAI_TO_OPENCODE_AGENT_MAP: Record<string, string> = buildAgentTypeMap();

export function resolveAgentType(paiType: string): string {
	const normalized = paiType.toLowerCase().trim();
	return PAI_TO_OPENCODE_AGENT_MAP[normalized] ?? paiType;
}

// ── Agent Permission Profiles (derived from definitions) ──

export interface AgentPermissionProfile {
	canBash: boolean;
	canCurl: boolean;
	canEdit: boolean;
	canWebfetch: boolean;
	canTask: boolean;
	canSkill: boolean;
	taskTargets: string[];
	notes: string[];
}

/**
 * Derive an AgentPermissionProfile from the actual permission object.
 * This ensures AGENT_PERMISSIONS can never diverge from the enforcement
 * permissions in definitions.ts (fixes Issue #3: Architect canCurl).
 */
function derivePermissionProfile(name: string, perm: AgentPermission, description: string): AgentPermissionProfile {
	const canBash = perm.bash === "allow";
	const canEdit = perm.edit === "allow";
	const canWebfetch = perm.webfetch === "allow";

	// Derive canCurl from actual bash permission rules
	let canCurl = false;
	if (perm.bash === "allow") {
		canCurl = true; // Full bash access = curl allowed
	} else if (typeof perm.bash === "object") {
		canCurl = Object.entries(perm.bash).some(
			([pattern, val]) => pattern.startsWith("curl") && val === "allow",
		);
	}

	const canTask = perm.task !== "deny";
	const canSkill = perm.skill === "allow";

	// Extract task targets from permission object
	const taskTargets: string[] = [];
	if (typeof perm.task === "object") {
		for (const [target, val] of Object.entries(perm.task)) {
			if (target !== "*" && val === "allow") {
				taskTargets.push(target);
			}
		}
	}

	// Generate notes from permissions and description
	const notes: string[] = [];
	if (description) {
		notes.push(description);
	}
	if (canBash && canEdit) {
		notes.push("Full bash and file edit access");
		notes.push("Primary workhorse for implementation tasks");
	} else {
		if (!canBash && canWebfetch && canCurl) {
			notes.push("Use webfetch for URL fetching (preferred over curl)");
		}
		if (!canEdit) {
			notes.push("Cannot edit files — return results to parent agent");
		}
	}

	return { canBash, canCurl, canEdit, canWebfetch, canTask, canSkill, taskTargets, notes };
}

/**
 * Build AGENT_PERMISSIONS by deriving from each agent's actual
 * permission definitions. No manually maintained parallel structure.
 */
function buildAgentPermissions(): Record<string, AgentPermissionProfile> {
	const permissions: Record<string, AgentPermissionProfile> = {};
	for (const [name, entry] of Object.entries(PAI_AGENT_REGISTRY)) {
		permissions[name] = derivePermissionProfile(name, entry.permission, entry.defaults.description);
	}

	fileLog(
		`[agent-type-registry] Derived permission profiles for ${Object.keys(permissions).length} agents`,
		"debug",
	);

	return permissions;
}

export const AGENT_PERMISSIONS: Record<string, AgentPermissionProfile> = buildAgentPermissions();

export function getAgentPermissions(agentType: string): AgentPermissionProfile | null {
	return AGENT_PERMISSIONS[agentType] ?? AGENT_PERMISSIONS[resolveAgentType(agentType)] ?? null;
}

export function formatPermissionSummary(agentType: string): string | null {
	const profile = getAgentPermissions(agentType);
	if (!profile) return null;

	const resolved = resolveAgentType(agentType);
	const lines: string[] = [];
	lines.push(`## OpenCode Adaptation Notes (${resolved} agent)`);
	lines.push("");
	lines.push("You are running as a subagent with the following permissions:");
	lines.push("");
	lines.push("### Available Tools");
	lines.push("| Tool | Available | Notes |");
	lines.push("|------|-----------|-------|");
	lines.push(`| bash | ${profile.canBash ? "✅" : "❌"} | ${profile.canBash ? "Full access" : "Deny (except grep/rg/git)"} |`);
	lines.push(`| curl | ${profile.canCurl ? "✅" : "❌"} | ${profile.canCurl ? "HTTP requests allowed" : "Not available — use webfetch if available"} |`);
	lines.push(`| edit | ${profile.canEdit ? "✅" : "❌"} | ${profile.canEdit ? "Can modify files" : "Read-only — return results to parent"} |`);
	lines.push(`| webfetch | ${profile.canWebfetch ? "✅" : "❌"} | ${profile.canWebfetch ? "Preferred for URL fetching" : "Not available"} |`);
	lines.push(`| task (spawn) | ${profile.canTask ? "✅" : "❌"} | ${profile.canTask ? `Can spawn: ${profile.taskTargets.join(", ")}` : "Cannot spawn sub-agents"} |`);
	lines.push(`| skill (load) | ${profile.canSkill ? "✅" : "❌"} | Skills always available |`);
	lines.push("");

	if (profile.notes.length > 0) {
		lines.push("### Guidelines");
		for (const note of profile.notes) {
			lines.push(`- ${note}`);
		}
		lines.push("");
	}

	if (!profile.canBash && profile.canWebfetch) {
		lines.push("### Curl → WebFetch Translation");
		lines.push("Skill instructions that say `curl <URL>` should use the `webfetch` tool instead:");
		lines.push("- `curl -s https://example.com` → use `webfetch({ url: 'https://example.com' })`");
		lines.push("");
	}

	if (!profile.canTask) {
		lines.push("### No Sub-Agent Spawning");
		lines.push("You cannot spawn sub-agents via the Task tool. Perform the work directly.");
		lines.push("");
	}

	return lines.join("\n");
}
