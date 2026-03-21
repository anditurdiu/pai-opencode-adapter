#!/usr/bin/env bun
/**
 * generate-opencode-config.ts
 *
 * Generates OpenCode-native configuration files (agents, themes, commands)
 * from the PAI adapter source templates. This script is called by install.sh
 * to deploy PAI-native agents, themes, and commands into OpenCode's config.
 *
 * Usage: bun run src/generators/generate-opencode-config.ts [--dry-run]
 */

import { join } from "node:path";
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";

const HOME = process.env.HOME!;
const DRY_RUN = process.argv.includes("--dry-run");

// Source directories (in repo)
const REPO_DIR = join(import.meta.dir, "..", "..");
const SRC_AGENTS = join(REPO_DIR, "src", "config", "agents");
const SRC_THEMES = join(REPO_DIR, "src", "config", "themes");
const SRC_COMMANDS = join(REPO_DIR, "src", "config", "commands");

// Target directories (OpenCode config)
const OPENCODE_CONFIG_DIR = join(HOME, ".config", "opencode");
const TARGET_AGENTS = join(OPENCODE_CONFIG_DIR, "agents");
const TARGET_THEMES = join(OPENCODE_CONFIG_DIR, "themes");
const TARGET_COMMANDS = join(OPENCODE_CONFIG_DIR, "commands");

interface DeployResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    if (DRY_RUN) {
      console.log(`  [dry-run] Would create directory: ${dir}`);
    } else {
      mkdirSync(dir, { recursive: true });
      console.log(`  ✓ Created directory: ${dir}`);
    }
  }
}

function deployFiles(srcDir: string, targetDir: string, extension: string): DeployResult {
  const result: DeployResult = { created: [], skipped: [], errors: [] };

  if (!existsSync(srcDir)) {
    console.log(`  ⚠ Source directory not found: ${srcDir}`);
    return result;
  }

  ensureDir(targetDir);

  const files = readdirSync(srcDir).filter((f) => f.endsWith(extension));

  for (const file of files) {
    const src = join(srcDir, file);
    const target = join(targetDir, file);

    try {
      if (DRY_RUN) {
        console.log(`  [dry-run] Would copy: ${file} → ${target}`);
        result.created.push(target);
      } else {
        copyFileSync(src, target);
        console.log(`  ✓ Deployed: ${file} → ${target}`);
        result.created.push(target);
      }
    } catch (err) {
      const msg = `Failed to deploy ${file}: ${String(err)}`;
      console.error(`  ✗ ${msg}`);
      result.errors.push(msg);
    }
  }

  return result;
}

function main(): void {
  console.log("\n  PAI OpenCode Config Generator");
  console.log("  ─────────────────────────────\n");

  if (DRY_RUN) {
    console.log("  [DRY RUN MODE — no files will be written]\n");
  }

  // Deploy agents
  console.log("  Agents:");
  const agentResult = deployFiles(SRC_AGENTS, TARGET_AGENTS, ".md");

  // Deploy themes
  console.log("\n  Themes:");
  const themeResult = deployFiles(SRC_THEMES, TARGET_THEMES, ".json");

  // Deploy commands
  console.log("\n  Commands:");
  const commandResult = deployFiles(SRC_COMMANDS, TARGET_COMMANDS, ".md");

  // Summary
  const totalCreated =
    agentResult.created.length + themeResult.created.length + commandResult.created.length;
  const totalErrors =
    agentResult.errors.length + themeResult.errors.length + commandResult.errors.length;

  console.log("\n  Summary:");
  console.log(`  ✓ ${agentResult.created.length} agents deployed`);
  console.log(`  ✓ ${themeResult.created.length} themes deployed`);
  console.log(`  ✓ ${commandResult.created.length} commands deployed`);

  if (totalErrors > 0) {
    console.log(`  ✗ ${totalErrors} errors`);
    process.exit(1);
  }

  console.log(`\n  Total: ${totalCreated} files deployed\n`);
}

main();
