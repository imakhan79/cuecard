import "server-only";

/**
 * Gemini key pool + rate-limit handling. Free-tier Gemini keys have small per-minute quotas,
 * so requests rotate through every configured key (GEMINI_API_KEY, GEMINI_API_KEY_2, …, or a
 * comma-separated GEMINI_API_KEYS) and, if all are rate limited, try the fallback models.
 */

export function geminiKeys(): string[] {
  const keys = [
    ...(process.env.GEMINI_API_KEYS ?? "").split(","),
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k));
  return [...new Set(keys)];
}

// Remember which key/model combos were rate limited recently (per server instance).
const cooldownUntil = new Map<string, number>();
let rr = 0;

function retryAfterMs(res: Response, body: string) {
  const header = Number(res.headers.get("retry-after"));
  if (header > 0) return header * 1000;
  const m = body.match(/"retryDelay":\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Number(m[1]) * 1000 : 30_000;
}

/**
 * POSTs to a Gemini endpoint, trying every key × model until one isn't rate limited.
 * Returns the first non-429 response. If everything is rate limited, returns the last 429.
 */
export async function geminiPost(
  models: string[],
  method: string,
  body: unknown,
  signal?: AbortSignal,
  query = "",
): Promise<Response> {
  const keys = geminiKeys();
  if (!keys.length) throw new Error("NO_GEMINI_KEY");
  const start = rr++ % keys.length;
  const ordered = keys.slice(start).concat(keys.slice(0, start));
  const now = Date.now();

  // Prefer combos not in cooldown; fall back to all of them if every combo is cooling down.
  const combos = models.flatMap((m) => ordered.map((k) => ({ m, k })));
  const fresh = combos.filter(({ m, k }) => (cooldownUntil.get(m + k) ?? 0) <= now);
  const tryList = fresh.length ? fresh : combos;

  let last: Response | null = null;
  for (const { m, k } of tryList) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:${method}${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": k },
      body: JSON.stringify(body),
      signal,
    });
    if (res.status !== 429) return res;
    const text = await res.text().catch(() => "");
    cooldownUntil.set(m + k, Date.now() + Math.min(retryAfterMs(res, text), 60_000));
    last = new Response(text, { status: 429, headers: res.headers });
  }
  return last!;
}
