# ADR-005: File-Based Logging (No console.log)

## Status

Accepted

## Context

The adapter runs as an OpenCode plugin inside the OpenCode CLI TUI. We needed to decide how to log debug information, errors, and operational messages.

**Options considered:**

1. **console.log** — Standard JavaScript logging
   - Pros: Simple, built-in, familiar
   - Cons: Corrupts OpenCode TUI, visible to user, interleaved with chat output

2. **File-based logging** — Append to log file
   - Pros: Never interferes with TUI, persistent, searchable, user-controllable
   - Cons: Disk I/O (minimal), log rotation needed (handled by OS for `/tmp`)

3. **Syslog** — System logging facility
   - Pros: Centralized, rotatable, configurable
   - Cons: Platform-specific (not consistent across macOS/Linux), overkill for CLI plugin

4. **No logging** — Silent operation
   - Pros: Zero overhead
   - Cons: Impossible to debug issues, poor user experience

**Key constraint:**

OpenCode's TUI is sensitive to stdout/stderr output. Any `console.log()` call corrupts the display, making the CLI unusable until redraw. This is unacceptable for a plugin.

## Decision

We chose **file-based logging to `/tmp/pai-opencode-debug.log`** — never `console.log`.

**Implementation:**

```typescript
// src/lib/file-logger.ts
const LOG_PATH = "/tmp/pai-opencode-debug.log";

export function fileLog(
  message: string,
  level: "info" | "warn" | "error" | "debug" = "info"
): void {
  const timestamp = new Date().toISOString();
  const levelPrefix = level.toUpperCase().padEnd(5, " ");
  const logLine = `[${timestamp}] [${levelPrefix}] ${message}\n`;
  appendFileSync(LOG_PATH, logLine);
}
```

**Usage:**

```typescript
import { fileLog } from "../lib/file-logger.js";

fileLog("[security-validator] blocked tool: rm -rf /", "warn");
```

**Log format:**

```
[2026-03-21T10:30:00.000Z] [INFO ] [context-loader] session started: sess_abc123
[2026-03-21T10:30:01.000Z] [WARN] [security-validator] blocked tool: rm -rf /
[2026-03-21T10:30:02.000Z] [ERROR] [voice] ElevenLabs API error: 401 Unauthorized
[2026-03-21T10:30:03.000Z] [DEBUG] [dedup-cache] duplicate detected: session=sess_abc123
```

**Log location:**

- **Path:** `/tmp/pai-opencode-debug.log`
- **Rotation:** Handled by OS ( `/tmp` is cleared on reboot)
- **Permissions:** World-readable (default umask)
- **Size:** Unbounded (but typically <10MB per day)

**User access:**

```bash
# View in real-time
tail -f /tmp/pai-opencode-debug.log

# Search for errors
grep ERROR /tmp/pai-opencode-debug.log

# Clear log
> /tmp/pai-opencode-debug.log
```

**Rationale:**

1. **TUI safety** — Never corrupts OpenCode display
2. **Persistence** — Logs survive process restarts (useful for debugging)
3. **Simplicity** — Single file, no dependencies, no configuration
4. **User control** — Users can view, search, clear logs at will

## Consequences

**Positive:**

- **TUI integrity** — OpenCode display never corrupted by logging
- **Debugging** — Full history available for post-mortem analysis
- **Performance** — Minimal overhead (append-only, synchronous, buffered by OS)
- **Portability** — Works on macOS and Linux without configuration

**Negative:**

- **Disk usage** — Log grows unbounded (mitigated by `/tmp` auto-cleanup on reboot)
- **No log levels at runtime** — All levels logged; no dynamic filtering (acceptable for CLI plugin)
- **Single file** — Concurrent sessions append to same file (acceptable; timestamps distinguish entries)

**Follow-ups:**

- Zero `console.log()` calls in any source file (enforced by code review)
- All handlers wrapped in try-catch with `fileLog()` in catch blocks
- README documents log location and troubleshooting commands
- Installer creates log file with appropriate permissions

---

*This ADR ensures the adapter is a good citizen in the OpenCode TUI environment.*
