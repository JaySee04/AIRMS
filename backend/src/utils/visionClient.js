// Provider-agnostic vision client. Sends page images + a prompt to whatever
// model the operator configured and returns the model's raw text reply.
//
// Two wire formats cover essentially every vision provider:
//   - 'openai'    → POST {baseUrl}/chat/completions with image_url content.
//                   Works for OpenAI, Gemini (generativelanguage.googleapis.com
//                   /v1beta/openai), Qwen/DashScope (compatible-mode), OpenRouter,
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

// Interleave a short caption before each image so the model knows which report
// section a crop came from, then close with the instruction prompt. Captions
// cost a handful of tokens and measurably reduce misreads on cropped sections;
// images-before-question is also the layout vision providers recommend.
function buildOpenAIContent(prompt, images) {
  const content = [];
  images.forEach((img, i) => {
    if (img.label) content.push({ type: 'text', text: `Image ${i + 1}: ${img.label}` });
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
    });
  });
  content.push({ type: 'text', text: prompt });
  return content;
}

function buildAnthropicContent(prompt, images) {
  const content = [];
  images.forEach((img, i) => {
    if (img.label) content.push({ type: 'text', text: `Image ${i + 1}: ${img.label}` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    });
  });
  content.push({ type: 'text', text: prompt });
  return content;
}

// Token accounting for one call. Every provider returns this and AIRMS used to
// discard it, so "what does a report cost to ingest?" had no answer.
//
// The two wire formats disagree on the field names — OpenAI-compatible says
// prompt/completion, Anthropic says input/output — so they are normalised here
// rather than at each call site. Images dominate the input count; the reply is
// a small fixed JSON, so the input side is what moves with VISION_MAX_PAGES and
// VISION_RENDER_SCALE.
function readUsage(u) {
  if (!u || typeof u !== 'object') return null;
  const input = Number(u.prompt_tokens ?? u.input_tokens);
  const output = Number(u.completion_tokens ?? u.output_tokens);
  const inOk = Number.isFinite(input);
  const outOk = Number.isFinite(output);
  if (!inOk && !outOk) return null;
  return {
    inputTokens: inOk ? input : null,
    outputTokens: outOk ? output : null,
    totalTokens: Number(u.total_tokens) || ((inOk ? input : 0) + (outOk ? output : 0)) || null,
  };
}

// The expanded extraction JSON (headline + 8 risks + 25 subitems + 8 posture
// axes + summary text + muscle lists) runs ~1200-1600 tokens; 2500 leaves
// headroom for a verbose summary without letting a rambling model run away.
const MAX_OUTPUT_TOKENS = 2500;

async function callOpenAICompatible(cfg, prompt, images) {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: buildOpenAIContent(prompt, images) }],
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Vision API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    usage: readUsage(json.usage),
  };
}

async function callAnthropic(cfg, prompt, images) {
  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0,
      messages: [{ role: 'user', content: buildAnthropicContent(prompt, images) }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Vision API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = await res.json();
  return {
    text: json.content?.map((b) => b.text || '').join('') ?? '',
    usage: readUsage(json.usage),
  };
}

// Send a prompt + images, return { text, usage } — the model's raw text reply
// and what the call cost in tokens (usage is null if the provider omits it).
// `images` is [{ base64, mediaType, label? }] from pdfRender.renderPdfRegions()
// (or renderPdfPages()); when a label is present it is sent as a caption
// immediately before its image.
async function visionComplete(prompt, images) {
  const cfg = visionConfig();
  if (!cfg.apiKey || !cfg.model) {
    throw new Error('Vision provider not configured (set VISION_API_KEY and VISION_MODEL).');
  }
  if (cfg.provider === 'anthropic') return callAnthropic(cfg, prompt, images);
  return callOpenAICompatible(cfg, prompt, images);
}

module.exports = { visionComplete, isVisionConfigured, visionConfig };
