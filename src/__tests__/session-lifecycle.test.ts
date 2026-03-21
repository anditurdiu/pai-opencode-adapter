import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
	onLifecycleSessionStart,
	onLifecycleMessage,
	onLifecycleSessionEnd,
	getSessionState,
	getAllSessionStates,
	clearAllSessionStates,
	getSessionLogsDir,
	getMemorySessionsDir,
	type LifecycleSessionState,
} from "../handlers/session-lifecycle.js";

const HOME = process.env.HOME || "~";
const TEST_SESSION_ID_A = "test-sess-a-12345";
const TEST_SESSION_ID_B = "test-sess-b-67890";
const LOGS_DIR = path.join(HOME, ".opencode", "logs", "sessions");
const MEMORY_DIR = path.join(HOME, ".claude", "MEMORY", "sessions");

function cleanupTestFiles(): void {
	for (const sessionId of [TEST_SESSION_ID_A, TEST_SESSION_ID_B]) {
		const logPath = path.join(LOGS_DIR, `${sessionId}.jsonl`);
		try {
			if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
		} catch {}
	}
	try {
		const files = fs.readdirSync(MEMORY_DIR);
		for (const f of files) {
			if (f.includes(TEST_SESSION_ID_A) || f.includes(TEST_SESSION_ID_B)) {
				fs.unlinkSync(path.join(MEMORY_DIR, f));
			}
		}
	} catch {}
}

describe("Session Lifecycle Handler", () => {
	beforeEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	afterEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	test("exports direct lifecycle functions", () => {
		expect(typeof onLifecycleSessionStart).toBe("function");
		expect(typeof onLifecycleMessage).toBe("function");
		expect(typeof onLifecycleSessionEnd).toBe("function");
	});

	test("returns correct paths for logs and memory directories", () => {
		expect(getSessionLogsDir()).toBe(LOGS_DIR);
		expect(getMemorySessionsDir()).toBe(MEMORY_DIR);
	});
});

describe("Full Session Lifecycle", () => {
	beforeEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	afterEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	test("tracks session from start through messages to end", () => {
		onLifecycleSessionStart(TEST_SESSION_ID_A, "claude-sonnet");

		let state = getSessionState(TEST_SESSION_ID_A);
		expect(state).toBeDefined();
		expect(state?.sessionId).toBe(TEST_SESSION_ID_A);
		expect(state?.status).toBe("active");
		expect(state?.messageCount).toBe(0);

		onLifecycleMessage(TEST_SESSION_ID_A);
		onLifecycleMessage(TEST_SESSION_ID_A);
		onLifecycleMessage(TEST_SESSION_ID_A);

		state = getSessionState(TEST_SESSION_ID_A);
		expect(state?.messageCount).toBe(3);

		onLifecycleSessionEnd(TEST_SESSION_ID_A);

		state = getSessionState(TEST_SESSION_ID_A);
		expect(state?.status).toBe("completed");

		const logPath = path.join(LOGS_DIR, `${TEST_SESSION_ID_A}.jsonl`);
		expect(fs.existsSync(logPath)).toBe(true);

		const logContent = fs.readFileSync(logPath, "utf-8");
		const lines = logContent.trim().split("\n");
		expect(lines.length).toBeGreaterThanOrEqual(2);

		const startEntry = JSON.parse(lines[0] ?? "{}");
		expect(startEntry.type).toBe("SESSION_START");
		expect(startEntry.sessionId).toBe(TEST_SESSION_ID_A);

		const endEntry = JSON.parse(lines[lines.length - 1] ?? "{}");
		expect(endEntry.type).toBe("SESSION_END");
		expect(endEntry.messageCount).toBe(3);
		expect(endEntry.durationMs).toBeGreaterThanOrEqual(0);
	});

	test("ignores duplicate session start for same session ID", () => {
		onLifecycleSessionStart(TEST_SESSION_ID_A, "claude-sonnet");
		onLifecycleSessionStart(TEST_SESSION_ID_A, "gpt-4");

		const state = getSessionState(TEST_SESSION_ID_A);
		expect(state?.model).toBe("claude-sonnet");
	});

	test("ignores messages for completed sessions", () => {
		onLifecycleSessionStart(TEST_SESSION_ID_A, "claude-sonnet");
		onLifecycleMessage(TEST_SESSION_ID_A);
		onLifecycleSessionEnd(TEST_SESSION_ID_A);

		onLifecycleMessage(TEST_SESSION_ID_A);

		const state = getSessionState(TEST_SESSION_ID_A);
		expect(state?.messageCount).toBe(1);
	});

	test("ignores duplicate session end", () => {
		onLifecycleSessionStart(TEST_SESSION_ID_A, "claude-sonnet");
		onLifecycleSessionEnd(TEST_SESSION_ID_A);
		onLifecycleSessionEnd(TEST_SESSION_ID_A);

		const state = getSessionState(TEST_SESSION_ID_A);
		expect(state?.status).toBe("completed");
	});
});

describe("Concurrent Sessions", () => {
	beforeEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	afterEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	test("tracks multiple sessions independently without cross-contamination", () => {
		onLifecycleSessionStart(TEST_SESSION_ID_A, "claude-3");
		onLifecycleSessionStart(TEST_SESSION_ID_B, "gpt-4");

		let stateA = getSessionState(TEST_SESSION_ID_A);
		let stateB = getSessionState(TEST_SESSION_ID_B);

		expect(stateA?.model).toBe("claude-3");
		expect(stateB?.model).toBe("gpt-4");

		onLifecycleMessage(TEST_SESSION_ID_A);
		onLifecycleMessage(TEST_SESSION_ID_A);
		onLifecycleMessage(TEST_SESSION_ID_B);

		stateA = getSessionState(TEST_SESSION_ID_A);
		stateB = getSessionState(TEST_SESSION_ID_B);

		expect(stateA?.messageCount).toBe(2);
		expect(stateB?.messageCount).toBe(1);

		onLifecycleSessionEnd(TEST_SESSION_ID_A);

		stateA = getSessionState(TEST_SESSION_ID_A);
		stateB = getSessionState(TEST_SESSION_ID_B);

		expect(stateA?.status).toBe("completed");
		expect(stateB?.status).toBe("active");

		onLifecycleSessionEnd(TEST_SESSION_ID_B);

		stateB = getSessionState(TEST_SESSION_ID_B);
		expect(stateB?.status).toBe("completed");

		const allStates = getAllSessionStates();
		expect(allStates.size).toBe(2);
		expect(allStates.get(TEST_SESSION_ID_A)?.status).toBe("completed");
		expect(allStates.get(TEST_SESSION_ID_B)?.status).toBe("completed");
	});
});

describe("JSONL Logging", () => {
	beforeEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	afterEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	test("creates JSONL log file with correct entries", () => {
		onLifecycleSessionStart(TEST_SESSION_ID_A);
		onLifecycleMessage(TEST_SESSION_ID_A);
		onLifecycleSessionEnd(TEST_SESSION_ID_A);

		const logPath = path.join(LOGS_DIR, `${TEST_SESSION_ID_A}.jsonl`);
		expect(fs.existsSync(logPath)).toBe(true);

		const logContent = fs.readFileSync(logPath, "utf-8");
		const lines = logContent.trim().split("\n");

		const types = lines.map((l) => JSON.parse(l).type);
		expect(types).toContain("SESSION_START");
		expect(types).toContain("MESSAGE");
		expect(types).toContain("SESSION_END");
	});
});

describe("Memory Session Summary", () => {
	beforeEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	afterEach(() => {
		clearAllSessionStates();
		cleanupTestFiles();
	});

	test("writes markdown summary on session end", () => {
		onLifecycleSessionStart(TEST_SESSION_ID_A);
		onLifecycleSessionEnd(TEST_SESSION_ID_A);

		const state = getSessionState(TEST_SESSION_ID_A);
		expect(state).toBeDefined();

		const date = new Date(state!.startTime).toISOString().split("T")[0];
		const summaryPath = path.join(MEMORY_DIR, `${date}-${TEST_SESSION_ID_A}.md`);

		expect(fs.existsSync(summaryPath)).toBe(true);

		const summaryContent = fs.readFileSync(summaryPath, "utf-8");
		expect(summaryContent).toContain("# Session Summary");
		expect(summaryContent).toContain(TEST_SESSION_ID_A);
		expect(summaryContent).toContain("**Status:** completed");
	});
});
