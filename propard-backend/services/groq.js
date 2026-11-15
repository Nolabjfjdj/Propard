const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

let nextKeyIndex = 0;

function getGroqApiKeys(env = process.env) {
  return Object.entries(env)
    .map(([name, value]) => {
      const match = /^GROQ_API(\d*)$/.exec(name);
      if (!match || typeof value !== 'string' || !value.trim()) return null;

      return {
        order: match[1] ? Number(match[1]) : 1,
        key: value.trim()
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
    .map(item => item.key)
    .filter((key, index, keys) => keys.indexOf(key) === index);
}

function getGroqConfiguration(env = process.env) {
  const keys = getGroqApiKeys(env);

  return {
    configured: keys.length > 0,
    keyCount: keys.length,
    model: env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b'
  };
}

async function createGroqCompletion({
  messages,
  model = process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b',
  tools,
  tool_choice,
  temperature = 0.6,
  max_completion_tokens = 1200,
  fetchImpl = fetch,
  env = process.env
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Les messages envoyés à Groq sont invalides.');
  }

  const keys = getGroqApiKeys(env);

  if (!keys.length) {
    const error = new Error('Aucune clé Groq configurée.');
    error.code = 'GROQ_NOT_CONFIGURED';
    throw error;
  }

  const startIndex = nextKeyIndex % keys.length;
  const orderedKeys = keys.map((_, index) => keys[(startIndex + index) % keys.length]);
  let lastError;

  for (let index = 0; index < orderedKeys.length; index++) {
    const key = orderedKeys[index];

    try {
      const response = await fetchImpl(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_completion_tokens,
          ...(Array.isArray(tools) && tools.length ? {
            tools,
            tool_choice: tool_choice || 'auto',
            parallel_tool_calls: false
          } : {})
        }),
        signal: AbortSignal.timeout(45000)
      });

      const payload = await response.json().catch(() => ({}));

      if (response.ok) {
        nextKeyIndex = (startIndex + index + 1) % keys.length;
        return payload;
      }

      const status = response.status;
      const retryable = status === 401 || status === 403 || status === 408 || status === 429 || status >= 500;
      const error = new Error(
        typeof payload.error?.message === 'string'
          ? payload.error.message.slice(0, 500)
          : `Groq a répondu avec le statut HTTP ${status}.`
      );
      error.status = status;
      error.code = 'GROQ_API_ERROR';
      error.groqType = typeof payload.error?.type === 'string' ? payload.error.type.slice(0, 80) : null;
      error.groqCode = typeof payload.error?.code === 'string' || typeof payload.error?.code === 'number'
        ? String(payload.error.code).slice(0, 80)
        : null;
      error.groqParam = typeof payload.error?.param === 'string' ? payload.error.param.slice(0, 80) : null;
      error.groqMessage = typeof payload.error?.message === 'string' ? payload.error.message.slice(0, 300) : null;
      error.groqLimitTokens = response.headers.get('x-ratelimit-limit-tokens');
      error.groqRemainingTokens = response.headers.get('x-ratelimit-remaining-tokens');
      error.groqResetTokens = response.headers.get('x-ratelimit-reset-tokens');
      error.groqRetryAfter = response.headers.get('retry-after');
      lastError = error;

      if (!retryable) throw error;
    } catch (error) {
      if (error.code === 'GROQ_API_ERROR' && error.status && error.status < 500 && ![401, 403, 408, 429].includes(error.status)) {
        throw error;
      }

      lastError = error;
    }
  }

  const error = new Error(
    lastError?.message || 'Toutes les clés Groq ont échoué.'
  );
  error.code = 'GROQ_ALL_KEYS_FAILED';
  error.status = lastError?.status || 503;
  throw error;
}

module.exports = {
  getGroqApiKeys,
  getGroqConfiguration,
  createGroqCompletion
};
