// Pluggable AI backend for the AI Analyze action (#78). The only file that knows about
// provider wire formats - server.js calls chatComplete() and never touches a provider API
// directly. Uses native fetch (Node 18+), no HTTP client dependency needed.

export const AI_SYSTEM_PROMPT =
  "You are a Kubernetes troubleshooting assistant embedded in the Mezzanine dashboard. " +
  "You are given context about ONE specific Kubernetes resource (and possibly a detected " +
  "problem). Explain what's happening in plain English and suggest a concrete fix. Only " +
  "discuss this resource and directly-related Kubernetes operations - if asked something " +
  "unrelated, politely decline and redirect back to troubleshooting it."

async function anthropicComplete({ apiKey, model, systemPrompt, messages }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return (data.content || []).map(b => b.text || '').join('')
}

async function openaiComplete({ apiKey, model, systemPrompt, messages }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

async function ollamaComplete({ model, ollamaHost, systemPrompt, messages }) {
  const res = await fetch(`${ollamaHost}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model || 'llama3.1',
      stream: false,
      messages: [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))],
    }),
  })
  if (!res.ok) throw new Error(`Ollama API error: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return data.message?.content || ''
}

export async function chatComplete({ provider, apiKey, model, ollamaHost, systemPrompt, messages }) {
  if (provider === 'anthropic') return anthropicComplete({ apiKey, model, systemPrompt, messages })
  if (provider === 'openai') return openaiComplete({ apiKey, model, systemPrompt, messages })
  if (provider === 'ollama') return ollamaComplete({ model, ollamaHost, systemPrompt, messages })
  throw new Error(`Unknown AI provider: ${provider}`)
}
