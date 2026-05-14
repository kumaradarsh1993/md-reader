/**
 * Groq Cloud provider for the smart-diff summary. Default provider in
 * v0.5.0+ because the free tier is generous and covers this use case
 * with no credit card.
 *
 * Endpoint is OpenAI-compatible (`/openai/v1/chat/completions`), so the
 * request/response shape mirrors the OpenAI Chat Completions API.
 *
 * Model recommendations (all free tier as of 2026-05):
 *  - llama-3.3-70b-versatile        — best prose summary quality, default
 *  - meta-llama/llama-4-maverick-17b-128e-instruct — newest Meta model, mixed
 *  - meta-llama/llama-4-scout-17b-16e-instruct     — newest Meta model, light
 *  - llama-3.1-8b-instant           — fastest, smaller context
 */

import { buildPrompt, SmartDiffError, type ProviderCall, type SummariseResult } from "./types";

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export async function callGroq(req: ProviderCall): Promise<SummariseResult> {
  if (!req.apiKey) {
    throw new SmartDiffError(
      "No Groq API key set. Open Settings → Smart-diff → Groq and paste your free key from console.groq.com.",
    );
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${req.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 600,
      temperature: 0.2,
      messages: [
        { role: "user", content: buildPrompt(req.baseline, req.current) },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SmartDiffError(
      `Groq API ${res.status}: ${text.slice(0, 240) || res.statusText}`,
      res.status,
    );
  }

  const data = await res.json();
  const summary: string = data?.choices?.[0]?.message?.content?.trim() ?? "(empty response)";
  return {
    summary,
    inputTokens: data?.usage?.prompt_tokens,
    outputTokens: data?.usage?.completion_tokens,
  };
}
