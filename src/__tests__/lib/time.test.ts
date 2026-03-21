import { describe, expect, test } from "bun:test";
import {
  formatDuration,
  formatTimestamp,
  getDaysBetween,
  getISOTimestamp,
  getFilenameTimestamp,
  getRelativeTime,
} from "../../lib/time.js";

describe("time", () => {
  describe("formatDuration", () => {
    test("formats seconds", () => {
      expect(formatDuration(5000)).toBe("5s");
      expect(formatDuration(30000)).toBe("30s");
    });

    test("formats minutes", () => {
      expect(formatDuration(90000)).toBe("1m 30s");
      expect(formatDuration(180000)).toBe("3m 0s");
    });

    test("formats hours", () => {
      expect(formatDuration(3600000)).toBe("1h 0m");
      expect(formatDuration(7200000)).toBe("2h 0m");
    });

    test("formats days", () => {
      expect(formatDuration(86400000)).toBe("1d 0h");
      expect(formatDuration(172800000)).toBe("2d 0h");
    });
  });

  describe("formatTimestamp", () => {
    const testDate = new Date("2026-03-21T10:30:00.000Z");

    test("formats as ISO", () => {
      const result = formatTimestamp(testDate, "iso");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test("formats as date only", () => {
      const result = formatTimestamp(testDate, "date");
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("formats as time only", () => {
      const result = formatTimestamp(testDate, "time");
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    test("formats for filename", () => {
      const result = formatTimestamp(testDate, "filename");
      expect(result).toMatch(/^\d{14}$/);
    });
  });

  describe("getDaysBetween", () => {
    test("calculates days between dates", () => {
      const date1 = new Date("2026-03-20");
      const date2 = new Date("2026-03-25");
      expect(getDaysBetween(date1, date2)).toBe(5);
    });

    test("returns 0 for same date", () => {
      const date = new Date("2026-03-21");
      expect(getDaysBetween(date, date)).toBe(0);
    });

    test("works with string dates", () => {
      expect(getDaysBetween("2026-03-20", "2026-03-22")).toBe(2);
    });

    test("works with timestamps", () => {
      const ts1 = new Date("2026-03-20").getTime();
      const ts2 = new Date("2026-03-23").getTime();
      expect(getDaysBetween(ts1, ts2)).toBe(3);
    });
  });

  describe("getISOTimestamp", () => {
    test("returns valid ISO timestamp", () => {
      const result = getISOTimestamp();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    });
  });

  describe("getFilenameTimestamp", () => {
    test("returns timestamp without special chars", () => {
      const result = getFilenameTimestamp();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}$/);
      expect(result).not.toContain(":");
    });
  });

  describe("getRelativeTime", () => {
    test("returns 'just now' for recent times", () => {
      expect(getRelativeTime(new Date())).toBe("just now");
    });

    test("returns minutes ago", () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60000);
      expect(getRelativeTime(fiveMinsAgo)).toBe("5 minutes ago");
    });

    test("returns hours ago", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
      expect(getRelativeTime(twoHoursAgo)).toBe("2 hours ago");
    });

    test("returns days ago", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
      expect(getRelativeTime(threeDaysAgo)).toBe("3 days ago");
    });
  });
});
