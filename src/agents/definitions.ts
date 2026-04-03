/**
 * Agent Definitions — Auto-Discovered from PAI
 *
 * Agent definitions loaded directly from PAI's source of truth:
 *   ~/.claude/skills/Agents/{AgentName}Context.md
 *
 * No adapter-only agents. Every agent registered here corresponds to
 * a PAI Context.md file. If PAI doesn't define it, it doesn't exist here.
 *
 * Auto-discovery: On startup, we scan the Agents directory for *Context.md
 * files and build the registry dynamically. When PAI adds, removes, or
 * renames agents, the adapter picks up changes on next startup.
 *
 * Permissions and defaults for known agents come from KNOWN_AGENT_PROFILES.
 * Newly discovered agents get conservative defaults (read-only, no edit,
 * restricted bash, webfetch allowed).
 *
 * @module agents/definitions
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fileLog } from "../lib/file-logger.js";
import { getPAIDir } from "../lib/paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILTIN_PROMPTS_DIR = join(__dirname, "prompts");

const PHANTOM_PROMPT_FILES: Record<string, string> = {
	GeneralPurpose: "general-purpose.md",
	Plan: "plan.md",
	Pentester: "pentester.md",
};

// ── Types ─────────────────────────────────────────────────

export type PermissionValue = "allow" | "deny" | Record<string, "allow" | "deny">;

export interface AgentPermission {
	read?: PermissionValue;
	edit?: PermissionValue;
	bash?: PermissionValue;
	task?: PermissionValue;
	skill?: PermissionValue;
	webfetch?: PermissionValue;
	question?: PermissionValue;
	external_directory?: PermissionValue;
	[key: string]: PermissionValue | undefined;
}

export interface AgentDefaults {
	description: string;
	color: string;
	temperature: number;
	steps: number;
	mode: "subagent" | "primary" | "all";
}

export interface AgentDefinition {
	prompt: string;
	permission: AgentPermission;
	defaults: AgentDefaults;
}

export interface PAIAgentEntry {
	contextFile: string;
	permission: AgentPermission;
	defaults: AgentDefaults;
}

// ── Common Permission Templates ───────────────────────────
// Shared bash rule sets to reduce duplication across known agent profiles.

const READONLY_GIT_BASH: Record<string, "allow" | "deny"> = {
	"*": "deny",
	"grep *": "allow",
	"rg *": "allow",
	"git status*": "allow",
	"git log*": "allow",
	"git show*": "allow",
	"git diff*": "allow",
	"git blame*": "allow",
	"git branch*": "allow",
	"git rev-parse*": "allow",
	"git -C *": "allow",
};

const RESEARCHER_BASH: Record<string, "allow" | "deny"> = {
	...READONLY_GIT_BASH,
	"curl *": "allow",
};

const BASE_EXTERNAL_DIR: Record<string, "allow" | "deny"> = {
	"~/.claude/**": "allow",
	"~/.config/opencode/**": "allow",
};

// Explicit read permission that preserves OpenCode's default .env deny rules.
// Using read: "allow" (string) as an agent permission overrides the global default
// deny for *.env and *.env.* files. This object form re-applies those denies
// explicitly so agents cannot accidentally read .env files.
const ENV_SAFE_READ: Record<string, "allow" | "deny"> = {
	"*": "allow",
	"*.env": "deny",
	"*.env.*": "deny",
	"*.env.example": "allow",
};

// ── Default Profiles for Unknown Agents ───────────────────

const DEFAULT_PERMISSION: AgentPermission = {
	read: { ...ENV_SAFE_READ },
	edit: "deny",
	bash: { ...READONLY_GIT_BASH },
	task: "deny",
	skill: "allow",
	webfetch: "allow",
	question: "deny",
	external_directory: { ...BASE_EXTERNAL_DIR },
};

const DEFAULT_DEFAULTS: AgentDefaults = {
	description: "",
	color: "#6B7280",
	temperature: 0.2,
	steps: 40,
	mode: "subagent",
};

// ── Known Agent Profiles ──────────────────────────────────
// Permission and default configurations for known PAI agents.
// New agents discovered via Context.md files but not listed here
// get conservative defaults (read-only, no edit, restricted bash).

const KNOWN_AGENT_PROFILES: Record<string, { permission: AgentPermission; defaults: AgentDefaults }> = {
	Architect: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: { ...READONLY_GIT_BASH },
			task: { "*": "deny", "Engineer": "allow", "GeminiResearcher": "allow", "ClaudeResearcher": "allow", "QATester": "allow" },
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "System design and architecture agent. Plans technical approaches, reviews designs, evaluates tradeoffs, and creates implementation specs.",
			color: "#6366F1",
			temperature: 0.3,
			steps: 50,
			mode: "subagent",
		},
	},

	Artist: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: "deny",
			task: "deny",
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Visual content creator. Generates illustrations, diagrams, infographics, and thumbnails using multiple rendering backends.",
			color: "#EC4899",
			temperature: 0.5,
			steps: 30,
			mode: "subagent",
		},
	},

	ClaudeResearcher: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: { ...RESEARCHER_BASH },
			task: { "*": "deny", "Engineer": "allow", "QATester": "allow", "CodexResearcher": "allow" },
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Academic researcher using Claude's WebSearch. Multi-query decomposition, parallel search execution, scholarly source synthesis.",
			color: "#8B5CF6",
			temperature: 0.2,
			steps: 40,
			mode: "subagent",
		},
	},

	CodexResearcher: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: { ...RESEARCHER_BASH },
			task: { "*": "deny", "Engineer": "allow", "ClaudeResearcher": "allow", "GeminiResearcher": "allow" },
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Technical archaeologist researcher. Consults multiple AI models, TypeScript-focused with live web search.",
			color: "#06B6D4",
			temperature: 0.2,
			steps: 40,
			mode: "subagent",
		},
	},

	Designer: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: { "*": "deny", "grep *": "allow", "rg *": "allow", "git status*": "allow", "git log*": "allow", "git diff*": "allow" },
			task: { "*": "deny", "Engineer": "allow", "QATester": "allow" },
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "UX/UI design specialist. Creates user-centered, accessible, scalable design solutions.",
			color: "#F43F5E",
			temperature: 0.4,
			steps: 30,
			mode: "subagent",
		},
	},

	Engineer: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "allow",
			bash: "allow",
			task: { "*": "deny", "Architect": "allow", "ClaudeResearcher": "allow", "GeminiResearcher": "allow", "QATester": "allow", "CodexResearcher": "allow" },
			skill: "allow",
			webfetch: "deny",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Senior engineering leader for strategic implementation. TDD, comprehensive planning, constitutional compliance.",
			color: "#F97316",
			temperature: 0.2,
			steps: 60,
			mode: "subagent",
		},
	},

	GeminiResearcher: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: { ...RESEARCHER_BASH },
			task: { "*": "deny", "Engineer": "allow", "ClaudeResearcher": "allow", "CodexResearcher": "allow" },
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Multi-perspective researcher using Google Gemini. Breaks complex queries into variations, launches parallel investigations.",
			color: "#A855F7",
			temperature: 0.2,
			steps: 40,
			mode: "subagent",
		},
	},

	GrokResearcher: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: { ...RESEARCHER_BASH },
			task: { "*": "deny", "Engineer": "allow", "ClaudeResearcher": "allow", "GeminiResearcher": "allow" },
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Contrarian, fact-based researcher using xAI Grok. Unbiased analysis, long-term truth over short-term trends.",
			color: "#EF4444",
			temperature: 0.2,
			steps: 40,
			mode: "subagent",
		},
	},

	PerplexityResearcher: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: { ...RESEARCHER_BASH },
			task: { "*": "deny", "Engineer": "allow", "ClaudeResearcher": "allow", "GeminiResearcher": "allow" },
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Investigative analyst using Perplexity API. Triple-checks sources, connects disparate information, journalistic rigor.",
			color: "#14B8A6",
			temperature: 0.2,
			steps: 40,
			mode: "subagent",
		},
	},

	QATester: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: { "*": "deny", "grep *": "allow", "rg *": "allow", "npx playwright*": "allow", "bun test*": "allow", "npm test*": "allow" },
			task: "deny",
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "QA validation agent. Verifies functionality using browser automation. Gate 4 of Five Completion Gates.",
			color: "#22C55E",
			temperature: 0.1,
			steps: 30,
			mode: "subagent",
		},
	},
	GeneralPurpose: {
		permission: { ...DEFAULT_PERMISSION },
		defaults: {
			description: "General purpose subagent for parallel work with task-specific prompts. Used by PAI for custom agents composed via ComposeAgent.",
			color: "#6B7280",
			temperature: 0.2,
			steps: 40,
			mode: "subagent",
		},
	},
	Plan: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: { ...READONLY_GIT_BASH },
			task: "deny",
			skill: "allow",
			webfetch: "deny",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Implementation planning agent. Analyzes codebase and creates structured plans for execution.",
			color: "#3B82F6",
			temperature: 0.2,
			steps: 30,
			mode: "subagent",
		},
	},
	Pentester: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "allow", // Rook needs edit per his Pentester.md permissions
			bash: "allow",
			task: "deny", // Simplified per PAI rules
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Offensive security specialist. Performs vulnerability assessments, penetration testing, security audits with professional methodology and ethical boundaries.",
			color: "#EF4444",
			temperature: 0.2,
			steps: 40,
			mode: "subagent",
		},
	},

	BrowserAgent: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: "allow", // Needs full bash for playwright-cli commands
			task: "deny",
			skill: "allow",
			webfetch: "deny", // Uses playwright-cli directly, not webfetch
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "Parallel headless browser automation agent using Playwright CLI. Navigates pages, interacts with elements, extracts data, and captures screenshots.",
			color: "#06B6D4", // cyan per PAI definition
			temperature: 0.2,
			steps: 40,
			mode: "subagent",
		},
	},

	UIReviewer: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "deny",
			bash: "allow", // Needs full bash for playwright-cli commands
			task: "deny",
			skill: "allow",
			webfetch: "deny", // Uses playwright-cli directly, not webfetch
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "User story validation agent using Playwright CLI. Executes structured stories (URL + steps + assertions) and returns PASS/FAIL reports.",
			color: "#F97316", // orange per PAI definition
			temperature: 0.1,
			steps: 40,
			mode: "subagent",
		},
	},

	Algorithm: {
		permission: {
			read: { ...ENV_SAFE_READ },
			edit: "allow",
			bash: "allow",
			task: "allow", // Algorithm orchestrates — needs full task spawning
			skill: "allow",
			webfetch: "allow",
			question: "deny",
			external_directory: { ...BASE_EXTERNAL_DIR },
		},
		defaults: {
			description: "ISC expert and Algorithm phase orchestrator. Creates and evolves Ideal State Criteria, recommends capabilities, drives verification toward euphoric surprise.",
			color: "#3B82F6", // blue per PAI definition
			temperature: 0.3,
			steps: 60,
			mode: "subagent",
		},
	},
};

// ── Auto-Discovery ────────────────────────────────────────

const PHANTOM_AGENTS = ["GeneralPurpose", "Plan"]; // Pentester is now a "known" agent via Pentester.md

function getPaiAgentsDir(): string {
	return join(getPAIDir(), "skills", "Agents");
}

// Agent-name-to-Context.md mapping
// Relative filenames resolve against skills/Agents/; absolute paths (from getPAIDir) resolve as-is.
function buildAgentContextMap(): Record<string, string> {
	const paiAgentsDef = join(getPAIDir(), "agents"); // ~/.claude/agents/
	return {
		Architect: "ArchitectContext.md",
		Artist: "ArtistContext.md",
		ClaudeResearcher: "ClaudeResearcherContext.md",
		CodexResearcher: "CodexResearcherContext.md",
		Designer: "DesignerContext.md",
		Engineer: "EngineerContext.md",
		GeminiResearcher: "GeminiResearcherContext.md",
		GrokResearcher: "GrokResearcherContext.md",
		PerplexityResearcher: "PerplexityResearcherContext.md",
		QATester: "QATesterContext.md",
		// Named agents without *Context.md files — use absolute paths via getPAIDir()
		Pentester: join(paiAgentsDef, "Pentester.md"),
		BrowserAgent: join(paiAgentsDef, "BrowserAgent.md"),
		UIReviewer: join(paiAgentsDef, "UIReviewer.md"),
		Algorithm: join(paiAgentsDef, "Algorithm.md"),
	};
}
const AGENT_CONTEXT_MAP = buildAgentContextMap();

/**
 * Scan PAI's Agents directory for *Context.md files and build the
 * agent registry dynamically.
 */
export function discoverPAIAgents(): Record<string, PAIAgentEntry> {
	const registry: Record<string, PAIAgentEntry> = {};
	const agentsDir = getPaiAgentsDir();

	// 1. Scan for Context.md files
	try {
		if (existsSync(agentsDir)) {
			readdirSync(agentsDir)
				.filter((f) => f.endsWith("Context.md"))
				.forEach((file) => {
					const name = file.replace("Context.md", "");
					const known = KNOWN_AGENT_PROFILES[name];
					registry[name] = {
						contextFile: file,
						permission: known?.permission ?? { ...DEFAULT_PERMISSION },
						defaults: known?.defaults ?? { ...DEFAULT_DEFAULTS },
					};
				});
		}
	} catch (err) {
		fileLog(`[definitions] Failed to scan PAI agents dir: ${err}`, "warn");
	}

	// 2. Add known named agents that don't follow the *Context.md convention
	for (const [name, contextFile] of Object.entries(AGENT_CONTEXT_MAP)) {
		if (!registry[name]) {
			const known = KNOWN_AGENT_PROFILES[name];
			registry[name] = {
				contextFile,
				permission: known?.permission ?? { ...DEFAULT_PERMISSION },
				defaults: known?.defaults ?? { ...DEFAULT_DEFAULTS },
			};
		}
	}

	// 3. Add remaining phantom agents
	for (const name of PHANTOM_AGENTS) {
		if (!registry[name]) {
			const known = KNOWN_AGENT_PROFILES[name];
			registry[name] = {
				contextFile: "",
				permission: known?.permission ?? { ...DEFAULT_PERMISSION },
				defaults: known?.defaults ?? { ...DEFAULT_DEFAULTS },
			};
		}
	}
	return registry;
}


// ── Prompt Resolution ─────────────────────────────────────

let promptCache: Map<string, string> | null = null;

function readPaiContext(filename: string): string | null {
	if (!filename) return null;
	// Support both absolute paths (for named agents) and relative paths in Agents dir
	const filePath = filename.startsWith("/") ? filename : join(getPaiAgentsDir(), filename);
	try {
		if (!existsSync(filePath)) return null;
		return readFileSync(filePath, "utf-8");
	} catch (err) {
		fileLog(`[definitions] Failed to read PAI context ${filename}: ${err}`, "warn");
		return null;
	}
}

function resolveAllPrompts(registry: Record<string, PAIAgentEntry>): Map<string, string> {
	if (promptCache) return promptCache;

	promptCache = new Map();
	for (const [name, entry] of Object.entries(registry)) {
		const content = readPaiContext(entry.contextFile);
		if (content) {
			promptCache.set(name, content);
			fileLog(`[definitions] Loaded prompt for "${name}" from PAI ${entry.contextFile}`, "debug");
		} else if (!entry.contextFile) {
			const promptFile = PHANTOM_PROMPT_FILES[name];
			let loaded = false;
			if (promptFile) {
				const fullPath = join(BUILTIN_PROMPTS_DIR, promptFile);
				try {
					if (existsSync(fullPath)) {
						promptCache.set(name, readFileSync(fullPath, "utf-8"));
						loaded = true;
					}
				} catch {
					fileLog(`[definitions] Failed to read builtin prompt ${promptFile}`, "warn");
				}
			}
			if (!loaded) {
				promptCache.set(name, `# ${name} Agent\n\nYou are the ${name} agent, a specialized built-in component of the PAI infrastructure.`);
			}
		} else {
			fileLog(`[definitions] PAI context file missing for "${name}": ${entry.contextFile}`, "warn");
		}
	}
	return promptCache;
}

export function clearPromptCache(): void {
	promptCache = null;
}

// ── Initialization ────────────────────────────────────────

const PAI_AGENT_REGISTRY = discoverPAIAgents();

export const AGENT_NAMES = Object.keys(PAI_AGENT_REGISTRY) as ReadonlyArray<string>;

export const AGENT_DEFINITIONS: Record<string, AgentDefinition> = (() => {
	const defs: Record<string, AgentDefinition> = {};
	const prompts = resolveAllPrompts(PAI_AGENT_REGISTRY);
	for (const [name, entry] of Object.entries(PAI_AGENT_REGISTRY)) {
		const prompt = prompts.get(name) ?? `# ${name} Agent\n\nPAI context file not found. Using minimal prompt.`;
		defs[name] = {
			prompt,
			permission: entry.permission,
			defaults: entry.defaults,
		};
	}
	return defs;
})();

export { PAI_AGENT_REGISTRY };
