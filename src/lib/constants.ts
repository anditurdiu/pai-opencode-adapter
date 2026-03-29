/**
 * PAI-OpenCode Adapter - Shared Constants
 *
 * All paths use process.env.HOME for portability across systems.
 * No hardcoded absolute paths (except /tmp/ for logs).
 */

import * as path from "path";

// Get home directory safely
const HOME = process.env.HOME || "~";

// ============================================================================
// PAI Directory Paths (using $HOME-relative paths)
// ============================================================================

/**
 * Base PAI directory (~/.claude/)
 */
export const PAI_DIR = path.join(HOME, ".claude");

/**
 * PAI hooks directory (~/.claude/hooks/)
 */
export const PAI_HOOKS_DIR = path.join(PAI_DIR, "hooks");

/**
 * PAI agents directory (~/.claude/agents/)
 * Legacy path — PAI previously stored agent definitions here with YAML frontmatter.
 * Note: NOT ~/.claude/PAI/agents/ - this is the correct legacy path
 */
export const PAI_AGENTS_DIR = path.join(PAI_DIR, "agents");

/**
 * PAI agents directory — new format (~/.claude/skills/Agents/)
 * Current PAI stores agent context files here (e.g., ArchitectContext.md).
 * These use markdown headings + **Role**: format instead of YAML frontmatter.
 * The adapter checks this path first, falling back to PAI_AGENTS_DIR.
 */
export const PAI_AGENTS_NEW_DIR = path.join(PAI_DIR, "skills", "Agents");

/**
 * PAI TELOS directory (~/.claude/PAI/USER/TELOS/)
 * Note: NOT ~/.claude/PAI/TELOS/ - this is the correct path
 */
export const PAI_TELOS_DIR = path.join(PAI_DIR, "PAI", "USER", "TELOS");

/**
 * PAI algorithm directory (~/.claude/PAI/Algorithm/)
 */
export const PAI_ALGORITHM_DIR = path.join(PAI_DIR, "PAI", "Algorithm");

/**
 * PAI memory directory (~/.claude/PAI/USER/MEMORY/)
 */
export const PAI_MEMORY_DIR = path.join(PAI_DIR, "PAI", "USER", "MEMORY");

// ============================================================================
// OpenCode Directory Paths
// ============================================================================

/**
 * XDG-style OpenCode configuration directory (~/.config/opencode/)
 * This is where opencode.json and plugin-specific configs live.
 */
export const OPENCODE_CONFIG_DIR = path.join(HOME, ".config", "opencode");

/**
 * OpenCode main config file path (~/.config/opencode/opencode.json)
 */
export const OPENCODE_CONFIG_PATH = path.join(OPENCODE_CONFIG_DIR, "opencode.json");

/**
 * PAI adapter config file path (~/.config/opencode/pai-adapter.json)
 * Plugin-specific config, separate from opencode.json.
 * Follows the same pattern as oh-my-opencode.json.
 */
export const PAI_ADAPTER_CONFIG_PATH = path.join(OPENCODE_CONFIG_DIR, "pai-adapter.json");

/**
 * Legacy OpenCode data directory (~/.opencode/)
 * Used for state, logs, plugins — NOT for configuration.
 */
export const OPENCODE_DIR = path.join(HOME, ".opencode");

/**
 * OpenCode state directory
 */
export const OPENCODE_STATE_DIR = path.join(OPENCODE_DIR, "state");

// ============================================================================
// Log Paths
// ============================================================================

/**
 * Debug log path (using /tmp/ - acceptable exception)
 */
export const LOG_PATH = "/tmp/pai-opencode-debug.log";

/**
 * Audit log path (using /tmp/ - acceptable exception)
 */
export const AUDIT_LOG_PATH = "/tmp/pai-opencode-audit.log";

// ============================================================================
// Timing Constants
// ============================================================================

/**
 * Message deduplication TTL in milliseconds
 */
export const MESSAGE_DEDUP_TTL_MS = 5000;

/**
 * State cache TTL in milliseconds (30 minutes)
 */
export const STATE_CACHE_TTL_MS = 1800000;

// ============================================================================
// Context Budget Constants
// ============================================================================

/**
 * Context budget ratio (0.8 = 80% of context window)
 */
export const CONTEXT_BUDGET_RATIO = 0.8;

// ============================================================================
// Compaction Markers
// ============================================================================

/**
 * Survival context marker for compaction
 */
export const COMPACTION_SURVIVAL_MARKER = "<!-- PAI_SURVIVAL_CONTEXT -->";

// ============================================================================
// Version Information
// ============================================================================

/**
 * Current adapter version
 */
export const ADAPTER_VERSION = "0.2.0";
