/** Classification only; a caller needs SDK-confirmed session/message identity before persistence. */
export type Feedback =
  | { kind: "rating"; value: number; comment?: string }
  | { kind: "praise"; text: string }
  | { kind: "correction"; text: string }
  | { kind: "directive"; text: string }
  | { kind: "none" };

const sentence = /^(items?|things?|steps?|files?|lines?|bugs?|issues?|errors?|times?|minutes?|hours?|days?|seconds?|percent|%|th\b|st\b|nd\b|rd\b|of\b|in\b|at\b|to\b|the\b|a\b|an\b)/i;
const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const corrections = ["that's wrong", "that's not what i", "you didn't", "you ignored", "still broken", "still not", "didn't work", "not what i asked", "stop doing", "again?", "i already told you"];
const directives = [/\bfrom now on\b/i, /\bin the future\b/i, /\bgoing forward\b/i, /\bnew rule\b/i, /^rule:/i, /\b(always|never) (do|use|include|make|add|put|run|write|call|show|keep|remember to)\b/i];
const praise = /^(?:excellent|amazing|brilliant|fantastic|wonderful|beautiful|incredible|awesome|perfect|great|nice|superb|outstanding|great job|good job|nice work|well done|nice job|good work|love it|nailed it|looks great|looks good|that's great|that works)[!. ]*$/i;

export function classifyFeedback(message: string): Feedback {
  const text = message.trim();
  if (text.length < 3 || text.startsWith("/") || /^(?:<task-notification>|<system-reminder>|This session is being continued)/i.test(text)) return { kind: "none" };
  const normalized = text.toLowerCase().replace(/[‘’ʼ`]/g, "'");
  const word = /^(one|two|three|four|five|six|seven|eight|nine|ten)(?:$|[!., ]+(.*))$/i.exec(text);
  if (word) return { kind: "rating", value: words[word[1]!.toLowerCase()]!, ...(word[2]?.trim() ? { comment: word[2].trim() } : {}) };
  const fraction = /^(10|[1-9])\s*(?:\/|out\s+of)\s*10\b(.*)$/i.exec(text);
  if (fraction) {
    const comment = fraction[2]!.replace(/^[\s!.,:;-]+/, "").trim();
    if (!comment || (!sentence.test(comment) && !/^[^\x00-\x7f]/.test(fraction[2]!)))
      return { kind: "rating", value: Number(fraction[1]!), ...(comment ? { comment } : {}) };
  }
  const bare = /^(10|[1-9])(?:\s*[-:]\s*|\s+)?(.*)$/.exec(text);
  if (bare) {
    const after = text.slice(bare[1]!.length), comment = bare[2]!.trim();
    if (!/^[\/.)\]\dA-Za-z]|^[^\x00-\x7f]/.test(after) && (!comment || (comment.length <= 80 && !sentence.test(comment))))
      return { kind: "rating", value: Number(bare[1]!), ...(comment ? { comment } : {}) };
  }
  if (text.length >= 10 && (/^no[,.]|^nope\b/.test(normalized) || corrections.some(p => normalized.includes(p)) || /\b(fucking|wtf|what the fuck)\b/.test(normalized) && /\b(you|your|it|code|banner|test|build|hook|file|page|deploy|fix|script|output|response)\b/.test(normalized)))
    return { kind: "correction", text };
  if (text.length >= 15 && directives.some(pattern => pattern.test(normalized))) return { kind: "directive", text };
  if (praise.test(text)) return { kind: "praise", text };
  return { kind: "none" };
}
