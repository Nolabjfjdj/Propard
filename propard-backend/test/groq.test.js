const test = require('node:test');
const assert = require('node:assert/strict');
const { transcribeGroqAudio } = require('../services/groq');

test('transcribeGroqAudio sends audio to Groq and returns the transcript', async () => {
  let request;
  const transcript = await transcribeGroqAudio({
    audio: Buffer.from('valid audio fixture'),
    mimeType: 'audio/webm',
    filename: 'recording.webm',
    env: { GROQ_API: 'test-key' },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ text: 'Bonjour Propard AI.' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  assert.equal(transcript, 'Bonjour Propard AI.');
  assert.equal(request.url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.ok(request.options.body instanceof FormData);
  assert.equal(request.options.body.get('model'), 'whisper-large-v3-turbo');
  assert.equal(request.options.body.get('language'), 'fr');
});

test('transcribeGroqAudio rejects empty audio before calling Groq', async () => {
  await assert.rejects(
    transcribeGroqAudio({
      audio: Buffer.alloc(0),
      mimeType: 'audio/webm',
      filename: 'recording.webm',
      env: { GROQ_API: 'test-key' },
      fetchImpl: async () => {
        throw new Error('Fetch must not be called');
      }
    }),
    /fichier audio est vide/
  );
});

test('transcribeGroqAudio reports missing Groq credentials', async () => {
  await assert.rejects(
    transcribeGroqAudio({
      audio: Buffer.from('valid audio fixture'),
      mimeType: 'audio/webm',
      filename: 'recording.webm',
      env: {},
      fetchImpl: async () => {
        throw new Error('Fetch must not be called');
      }
    }),
    error => error.code === 'GROQ_NOT_CONFIGURED'
  );
});
