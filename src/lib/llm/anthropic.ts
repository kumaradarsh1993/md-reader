/**
 * Anthropic provider for the smart-diff summary.
 *
 * Direct browser-context call to https://api.anthropic.com — no Rust HTTP
 * client required. Header `anthropic-dangerous-direct-browser-access: true`
 * is mandatory in Tauri's WebView2 context.
 */

import { buildPrompt, SmartDiffError, type ProviderCall, type SummariseResult } from "./types";

export async function callAnthropic(req: ProviderCall): Promise<SummariseResult> {
  if (!req.apiKey) {
    throw new SmartDiffError(
      "No Anthropic API key set. Open Settings → Smart-diff and paste your key.",
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": req.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 600,
      messages: [{ role: "user", content: buildPrompt(req.baseline, req.current) }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SmartDiffError(
      `Anthropic API ${res.status}: ${text.slice(0, 240) || res.statusText}`,
      res.status,
    );
  }

  const data = await res.json();
  const summary: string = data?.content?.[0]?.text?.trim() ?? "(empty response)";
  return {
    summary,
    inputTokens: data?.usage?.input_tokens,
    outputTokens: data?.usage?.output_tokens,
  };
}
