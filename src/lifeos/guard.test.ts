import { expect, test } from "bun:test";
import { assertAllowedTool } from "./guard.js";

test("a pre-tool hook blocks before a prohibited command executes", async () => {
  let executed = false;
  const call = (command: string) => { assertAllowedTool("bash", { command }); executed = true; };
  expect(() => call("LIFEOS_USER_ROOT=/tmp/other bun LIFEOS/TOOLS/MemorySystem.ts add '{}' ")).toThrow();
  expect(executed).toBe(false);
  call("git status");
  expect(executed).toBe(true);
});
