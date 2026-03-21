/**
 * time.ts - Time formatting and duration utilities
 *
 * MIT License - Custom implementation for PAI-OpenCode Hybrid Adapter
 * Ported from PAI v4.0.3 hooks/lib/time.ts
 *
 * Functions:
 *   formatDuration() - Format milliseconds to human-readable duration
 *   formatTimestamp() - Format timestamp to ISO or custom format
 *   getDaysBetween() - Get number of days between two dates
 *   getISOTimestamp() - Get current ISO timestamp
 *   getPSTTimestamp() - Get PST timestamp
 *   getFilenameTimestamp() - Get timestamp for filenames
 */

import { fileLog } from "./file-logger.js";
import { getPrincipal } from "./identity.js";

function getTimezone(): string {
  return getPrincipal().timezone || "UTC";
}

/**
 * Get full timestamp string: "YYYY-MM-DD HH:MM:SS TZ"
 */
export function getPSTTimestamp(): string {
  const timezone = getTimezone();
  const date = new Date();
  const localDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const day = String(localDate.getDate()).padStart(2, "0");
  const hours = String(localDate.getHours()).padStart(2, "0");
  const minutes = String(localDate.getMinutes()).padStart(2, "0");
  const seconds = String(localDate.getSeconds()).padStart(2, "0");

  const tzName = date.toLocaleString("en-US", { timeZone: timezone, timeZoneName: "short" }).split(" ").pop() || "UTC";

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${tzName}`;
}

/**
 * Get date only: "YYYY-MM-DD"
 */
export function getPSTDate(): string {
  const timezone = getTimezone();
  const date = new Date();
  const localDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const day = String(localDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Get year-month for directory structure: "YYYY-MM"
 */
export function getYearMonth(): string {
  return getPSTDate().substring(0, 7);
}

/**
 * Get ISO8601 timestamp with timezone offset
 */
export function getISOTimestamp(): string {
  const timezone = getTimezone();
  const date = new Date();
  const localDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const day = String(localDate.getDate()).padStart(2, "0");
  const hours = String(localDate.getHours()).padStart(2, "0");
  const minutes = String(localDate.getMinutes()).padStart(2, "0");
  const seconds = String(localDate.getSeconds()).padStart(2, "0");

  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const diffMs = localDate.getTime() - utcDate.getTime();
  const diffHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
  const diffMins = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));
  const sign = diffMs >= 0 ? "+" : "-";
  const offset = `${sign}${String(diffHours).padStart(2, "0")}:${String(diffMins).padStart(2, "0")}`;

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}

/**
 * Get timestamp formatted for filenames: "YYYY-MM-DD-HHMMSS"
 */
export function getFilenameTimestamp(): string {
  const timezone = getTimezone();
  const date = new Date();
  const localDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));

  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, "0");
  const day = String(localDate.getDate()).padStart(2, "0");
  const hours = String(localDate.getHours()).padStart(2, "0");
  const minutes = String(localDate.getMinutes()).padStart(2, "0");
  const seconds = String(localDate.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

/**
 * Format duration from milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format timestamp to specified format
 */
export function formatTimestamp(ts: number | Date | string, format: "iso" | "date" | "time" | "filename" = "iso"): string {
  const date = typeof ts === "string" ? new Date(ts) : typeof ts === "number" ? new Date(ts) : ts;

  switch (format) {
    case "iso":
      return date.toISOString();
    case "date":
      return date.toISOString().slice(0, 10);
    case "time":
      return date.toISOString().slice(11, 19);
    case "filename":
      return date.toISOString().replace(/[-:T]/g, "").slice(0, 14);
    default:
      return date.toISOString();
  }
}

/**
 * Get number of days between two dates
 */
export function getDaysBetween(a: Date | string | number, b: Date | string | number): number {
  const dateA = typeof a === "string" ? new Date(a) : typeof a === "number" ? new Date(a) : a;
  const dateB = typeof b === "string" ? new Date(b) : typeof b === "number" ? new Date(b) : b;

  const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Get relative time string (e.g., "2 hours ago")
 */
export function getRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  return "just now";
}

/**
 * Get timestamp components for custom formatting
 */
export function getPSTComponents(): {
  year: number;
  month: string;
  day: string;
  hours: string;
  minutes: string;
  seconds: string;
} {
  const timezone = getTimezone();
  const date = new Date();
  const localDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));

  return {
    year: localDate.getFullYear(),
    month: String(localDate.getMonth() + 1).padStart(2, "0"),
    day: String(localDate.getDate()).padStart(2, "0"),
    hours: String(localDate.getHours()).padStart(2, "0"),
    minutes: String(localDate.getMinutes()).padStart(2, "0"),
    seconds: String(localDate.getSeconds()).padStart(2, "0"),
  };
}

/**
 * Get timezone string for display
 */
export function getTimezoneDisplay(): string {
  const timezone = getTimezone();
  const date = new Date();
  return date.toLocaleString("en-US", { timeZone: timezone, timeZoneName: "short" }).split(" ").pop() || timezone;
}
