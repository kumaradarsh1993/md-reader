/**
 * Shared types for the LLM-summary providers used by the diff sidebar's
 * "✨ Summary" mode. v0.5.0+: this module replaces the single Anthropic
 * client in the old smart-diff.ts with a provider-pluggable dispatcher.
 */

import type { LLMProvider } from "../settings-store.svelte";

export interface SummariseResult {
  summary: string;       // markdown, typically 2-4 bullets
  inputTokens?: number;
  outputTokens?: number;
}

export class SmartDiffError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = "SmartDiffError";
  }
}

export interface ProviderCall {
  /** Which provider to dispatch to. */
  provider: LLMProvider;
  /** Provider-specific API key. Empty string surfaces a "no key set" error. */
  apiKey: string;
  /** Provider-specific model ID. */
  model: string;
  /** The before/after texts to summarise. */
  baseline: string;
  current: string;
}

/**
 * The prompt is identical across providers — the message format & endpoint
 * differ. Keep this here so both adapters reuse it verbatim and any tweak
 * lands once, not twice.
 */
export const SUMMARY_PROMPT_LINES = [
  "You are reviewing changes to a markdown document. Compare BEFORE and AFTER and report what substantively changed.",
  "",
  "Output rules:",
  "- 2 to 4 bullet points, single sentence each",
  "- Each bullet describes a meaningful conceptual change (section added, claim modified, recommendation reversed, etc.)",
  "- Skip whitespace-only or trivial wording edits",
  "- No preamble, no conclusion. Output bullets directly.",
];

export function buildPrompt(baseline: string, current: string): string {
  return [
    ...SUMMARY_PROMPT_LINES,
    "",
    "BEFORE",
    "======",
    baseline,
    "",
    "AFTER",
    "=====",
    current,
  ].join("\n");
}
