export interface AiRewriteResult {
  ok: boolean;
  text: string;
  usedAi: boolean;
  model?: string;
}

export async function requestAiRewrite(params: {
  mode: 'explain' | 'draft_justification' | 'daily_summary';
  deterministicText: string;
  contextTitle?: string;
}): Promise<AiRewriteResult> {
  try {
    const res = await fetch('/api/ai/rewrite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      return { ok: true, text: params.deterministicText, usedAi: false };
    }
    const data = (await res.json()) as Partial<AiRewriteResult>;
    if (typeof data.text === 'string' && data.text.trim()) {
      return {
        ok: true,
        text: data.text.trim(),
        usedAi: Boolean(data.usedAi),
        model: data.model,
      };
    }
    return { ok: true, text: params.deterministicText, usedAi: false };
  } catch {
    return { ok: true, text: params.deterministicText, usedAi: false };
  }
}
