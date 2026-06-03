import type { MemoryCandidate, MemoryLevel } from './types';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-3-5-haiku-20241022';

async function call(apiKey: string, systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text ?? '';
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    await call(apiKey, 'You are a helpful assistant.', 'Reply with just "ok".');
    return true;
  } catch {
    return false;
  }
}

export async function generateSummary(apiKey: string, text: string): Promise<string> {
  return call(
    apiKey,
    '你是一个专业的对话分析助手。直接输出摘要，不要加标题或前缀。',
    `以下是一段 AI 对话，请用 150 字以内的中文生成简洁摘要，说明核心主题、关键讨论点和主要结论：\n\n${text.slice(0, 8000)}`
  );
}

export async function extractMemoryCandidates(apiKey: string, text: string): Promise<MemoryCandidate[]> {
  const system = `你是一个记忆提取助手。从对话中提取有价值的记忆条目，按重要性分级：
L0=噪音(无价值), L1=临时信息, L2=会话上下文, L3=项目记忆, L4=长期偏好, L5=核心决策。
只输出 JSON 数组，格式：[{"content":"...","level":"L3","confidence":0.9,"reason":"...","source_message_indexes":[0,1]}]`;

  const raw = await call(
    apiKey,
    system,
    `请分析以下对话，提取 3-8 个最有价值的记忆条目：\n\n${text.slice(0, 6000)}`
  );

  try {
    const jsonStr = raw.match(/\[[\s\S]*\]/)?.[0] ?? '[]';
    const parsed = JSON.parse(jsonStr) as Array<{
      content: string; level: string; confidence: number;
      reason: string; source_message_indexes?: number[];
    }>;
    return parsed.map((c) => ({
      content: c.content,
      level: c.level as MemoryLevel,
      confidence: Math.min(1, Math.max(0, c.confidence)),
      reason: c.reason,
      requires_confirmation: ['L4', 'L5'].includes(c.level),
      source_message_indexes: c.source_message_indexes ?? [],
    }));
  } catch {
    return [];
  }
}
