// Talks to whatever local LLM server the user has running, as long as it speaks
// the OpenAI-compatible /chat/completions streaming format. That covers Ollama,
// LM Studio, llama.cpp's server, koboldcpp, text-generation-webui, etc.
//
// onDelta may return `false` to signal "stop reading now" — used when a
// multi-character reply hits its turn cap, so we're not still paying for
// tokens after we've already decided to ignore them.
async function streamChatCompletion({ baseUrl, model, messages, maxTokens, onDelta }) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        temperature: 0.9,
        ...(maxTokens ? { max_tokens: maxTokens } : {})
      })
    });
  } catch (err) {
    throw new Error(`Could not reach the LLM server at ${url}. Is it running? (${err.message})`);
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM server responded with ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let leftover = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = leftover + decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');
    leftover = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;

      let json;
      try {
        json = JSON.parse(payload);
      } catch {
        continue; // ignore malformed keep-alive lines some servers send
      }
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        const keepGoing = onDelta(delta);
        if (keepGoing === false) {
          await reader.cancel().catch(() => {});
          return;
        }
      }
    }
  }
}

module.exports = { streamChatCompletion };
