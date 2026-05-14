/**
 * Smart-diff dispatcher — picks the provider based on settings and forwards
 * the call. Also memoises results so toggling the sidebar Naive↔Summary
 * mode doesn't re-bill the API.
 *
 * Replaces the old single-purpose smart-diff.ts (v0.4.x) which was hardcoded
 * to Anthropic. Caller still gets a `summariseDiff(...)` entry point — only
 * the import path moved (`$lib/llm` instead of `$lib/smart-diff`).
 */

import { settings } from "../settings-store.svelte";
import { callAnthropic } from "./anthropic";
import { callGroq } from "./groq";
import { SmartDiffError, type ProviderCall, type SummariseResult } from "./types";

export { SmartDiffError, type SummariseResult };

const CACHE = new Map<string, SummariseResult>();

function hashKey(req: ProviderCall): string {
  // FNV-1a — cheap, stable. We just want "same input → same cache hit"
  // so flipping the sidebar mode is free.
  let h = 2166136261;
  const s = `${req.provider}|${req.model}|${req.baseline}|${req.current}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h.toString(16);
}

/**
 * Summarise the diff between two snapshots of the same markdown document.
 * Reads provider / key / model from `settings.s.*` so each call automatically
 * picks up the user's current Settings → Smart-diff selection.
 */
export async function summariseDiff(
  baseline: string,
  current: string,
): Promise<SummariseResult> {
  if (baseline === current) {
    return { summary: "_(no changes)_" };
  }

  const provider = settings.s.llmProvider;
  const req: ProviderCall =
    provider === "groq"
      ? {
          provider: "groq",
          apiKey: settings.s.groqApiKey,
          model: settings.s.groqModel,
          baseline,
          current,
        }
      : {
          provider: "anthropic",
          apiKey: settings.s.anthropicApiKey,
          model: settings.s.anthropicModel,
          baseline,
          current,
        };

  const ck = hashKey(req);
  const cached = CACHE.get(ck);
  if (cached) return cached;

  const result = provider === "groq" ? await callGroq(req) : await callAnthropic(req);
  CACHE.set(ck, result);
  return result;
}

export function clearSummariseCache() {
  CACHE.clear();
}
