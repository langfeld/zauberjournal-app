/** Zugang zur KI über Requesty (OpenAI-kompatibel); es gelten dieselben Modelle wie beim Import. */
export type AiConfig = { apiKey: string; models: string[]; baseUrl: string };

const MODEL_TIMEOUT_MS = 120_000;

export type JsonRequest = {
  /** Wofür, fürs Protokoll, z. B. „Dubletten-Suche“ */
  task: string;
  /** Name des Schemas in der Anfrage */
  name: string;
  system: string;
  prompt: string;
  schema: object;
  maxTokens?: number;
};

export function aiAvailable(ai: AiConfig): boolean {
  return ai.apiKey !== '' && ai.models.length > 0;
}

function stripCodeFence(content: string): string {
  return content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}

/**
 * Fragt die Modelle der Reihe nach mit festem JSON-Schema und gibt die erste lesbare Antwort zurück; fällt
 * eines aus, kommt das nächste dran. `undefined`, wenn keines antwortet.
 */
export async function askJson(
  ai: AiConfig,
  request: JsonRequest,
  fetchImpl: typeof fetch,
  log: (message: string) => void,
): Promise<unknown> {
  for (const model of ai.models) {
    try {
      const response = await fetchImpl(`${ai.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ai.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          response_format: { type: 'json_schema', json_schema: { name: request.name, strict: true, schema: request.schema } },
          max_tokens: request.maxTokens ?? 4000,
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new Error('Antwort ohne Inhalt');
      return JSON.parse(stripCodeFence(content)) as unknown;
    } catch (error) {
      log(`${request.task} mit ${model} fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return undefined;
}
