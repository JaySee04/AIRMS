// Provider-agnostic vision client. Sends page images + a prompt to whatever
// model the operator configured and returns the model's raw text reply.
//
// Two wire formats cover essentially every vision provider:
//   - 'openai'    → POST {baseUrl}/chat/completions with image_url content.
//                   Works for OpenAI, Qwen/DashScope (compatible-mode), OpenRouter,
//                   Together, Groq, and local Ollama / LM Studio — just change
//                   VISION_BASE_URL + VISION_MODEL + VISION_API_KEY.
//   - 'anthropic' → POST https://api.anthropic.com/v1/messages with image blocks.
//
// Config (backend/.env), all optional — feature self-disables if unset:
//   VISION_PROVIDER = openai | anthropic        (default: openai)
//   VISION_API_KEY  = <key>
//   VISION_BASE_URL = https://api.openai.com/v1 (default depends on provider)
//   VISION_MODEL    = gpt-4o-mini | qwen-vl-max | claude-sonnet-4-6 | …
//
// Node 18+ provides global fetch, so there is no extra dependency here.

const DEFAULT_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
};

function visionConfig() {
  const provider = (process.env.VISION_PROVIDER || 'openai').toLowerCase();
  return {
    provider,
    apiKey: process.env.VISION_API_KEY || '',
    baseUrl: (process.env.VISION_BASE_URL || DEFAULT_BASE_URLS[provider] || '').replace(/\/$/, ''),
    model: process.env.VISION_MODEL || '',
  };
}

// True when enough is configured to attempt a call. Routes use this to return
// a clean "feature disabled" message instead of a 500, mirroring the SMTP
// console-fallback pattern already used for the password-reset mailer.
function isVisionConfigured() {
  const c = visionConfig();
  return Boolean(c.apiKey && c.model);
}

async function callOpenAICompatible(cfg, prompt, images) {
  const content = [
    { type: 'text', text: prompt },
    ...images.map((img) => ({
      type: 'image_url',
      image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
    })),
  ];
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content }],
      temperature: 0,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Vision API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(cfg, prompt, images) {
  const content = [
    { type: 'text', text: prompt },
    ...images.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })),
  ];
  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 1500,
      temperature: 0,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Vision API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.content?.map((b) => b.text || '').join('') ?? '';
}

// Send a prompt + images, return the model's raw text reply.
// `images` is [{ base64, mediaType }] from pdfRender.renderPdfPages().
async function visionComplete(prompt, images) {
  const cfg = visionConfig();
  if (!cfg.apiKey || !cfg.model) {
    throw new Error('Vision provider not configured (set VISION_API_KEY and VISION_MODEL).');
  }
  if (cfg.provider === 'anthropic') return callAnthropic(cfg, prompt, images);
  return callOpenAICompatible(cfg, prompt, images);
}

module.exports = { visionComplete, isVisionConfigured, visionConfig };
