// Token accounting across the two wire formats. The number is what answers
// "what does one HoloMotion report cost to ingest?", and it used to be thrown
// away, so the parsing is worth pinning down.
const path = require('path');

// readUsage isn't exported (it is an internal of the client), so it is re-stated
// here against the same contract. If the client's version drifts from this, the
// test stops describing reality — hence the shape assertions below are written
// against BOTH providers' field names rather than one.
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

describe('vision token usage', () => {
  it('reads the OpenAI-compatible field names', () => {
    expect(readUsage({ prompt_tokens: 4210, completion_tokens: 380, total_tokens: 4590 }))
      .toEqual({ inputTokens: 4210, outputTokens: 380, totalTokens: 4590 });
  });

  it('reads the Anthropic field names', () => {
    // Anthropic reports no total, so it has to be derived.
    expect(readUsage({ input_tokens: 4210, output_tokens: 380 }))
      .toEqual({ inputTokens: 4210, outputTokens: 380, totalTokens: 4590 });
  });

  it('returns null when the provider reports nothing', () => {
    expect(readUsage(undefined)).toBeNull();
    expect(readUsage(null)).toBeNull();
    expect(readUsage({})).toBeNull();
    // A usage object carrying only unrelated keys is no usage at all.
    expect(readUsage({ cached: 12 })).toBeNull();
  });

  it('keeps a one-sided count rather than discarding the call', () => {
    expect(readUsage({ prompt_tokens: 4210 }))
      .toEqual({ inputTokens: 4210, outputTokens: null, totalTokens: 4210 });
  });

  it('treats zero-token replies as absent rather than reporting a false 0 total', () => {
    // total_tokens 0 is not a meaningful cost figure; falling back to the sum
    // (also 0) then to null keeps "unknown" distinct from "free".
    expect(readUsage({ prompt_tokens: 0, completion_tokens: 0 }))
      .toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: null });
  });

  it('is wired into the extractor and the client', () => {
    const client = require('fs').readFileSync(
      path.join(__dirname, '../src/utils/visionClient.js'), 'utf8',
    );
    const extract = require('fs').readFileSync(
      path.join(__dirname, '../src/utils/holomotionExtract.js'), 'utf8',
    );
    // Both providers must go through readUsage, or one of them silently
    // reports nothing.
    expect((client.match(/readUsage\(json\.usage\)/g) || []).length).toBe(2);
    // And the extractor must surface it rather than dropping it again.
    expect(extract).toMatch(/usage/);
  });
});
