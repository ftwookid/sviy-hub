import Anthropic from "@anthropic-ai/sdk";

/**
 * One way to ask a model for JSON, shared by everything that reads a document.
 *
 * Every scan in this app has the same shape: hand over a file, pin the answer to
 * a JSON schema, get a parsed object back. Pinning the schema is what removes
 * the retry-on-bad-JSON path entirely — the response cannot come back unparseable.
 */

/** Cheap by design; the passes and the cross-checks are what buy the accuracy. */
const DEFAULT_MODEL = "claude-haiku-4-5";

export function parserModel() {
  return process.env.TRANSACTION_PARSER_MODEL || DEFAULT_MODEL;
}

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Document scanning is not configured. Set ANTHROPIC_API_KEY.");
  return new Anthropic({ apiKey });
}

export function documentBlock(base64Pdf: string) {
  return {
    type: "document" as const,
    source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64Pdf }
  };
}

function parseJsonResponse<T>(message: Anthropic.Message): T {
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (!text.trim()) throw new Error("The scan came back empty.");
  return JSON.parse(text) as T;
}

/**
 * Streamed because these responses run long on a multi-page document, and a
 * non-streaming request that size risks tripping the SDK's HTTP timeout.
 */
export async function runJsonPass<T>(
  content: Anthropic.ContentBlockParam[],
  schema: Record<string, unknown>,
  options: { maxTokens?: number; thinkingBudget?: number; tooLongMessage?: string } = {}
): Promise<T> {
  const stream = client().messages.stream({
    model: parserModel(),
    max_tokens: options.maxTokens ?? 32000,
    // Haiku takes a fixed thinking budget rather than adaptive thinking. Enough
    // room to work through a long table before it starts writing rows out.
    thinking: { type: "enabled", budget_tokens: options.thinkingBudget ?? 6000 },
    output_config: { format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }]
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "max_tokens") {
    throw new Error(
      options.tooLongMessage ??
        "This document is longer than one scan can hold. Split it and try again in parts."
    );
  }
  if (message.stop_reason === "refusal") {
    throw new Error("The scan could not process this document.");
  }

  return parseJsonResponse<T>(message);
}
