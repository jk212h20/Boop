#!/usr/bin/env node
// Ask Sol 6.1 (hosted, via PPQ) to describe or inspect a screenshot.
//
//   node tools/sol-vision.mjs <image> "<question>"
//
// The local vision model is not used for this project's visual checks: its
// answers on dense 3D scenes were unreliable, and the board/bed screenshots
// are small enough that a hosted model reads them correctly.
//
// The key is read from PPQ_API_KEY (already in the environment); it is never
// written to a file or passed on the command line.
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

const [, , imagePath, ...questionParts] = process.argv;
const question = questionParts.join(' ').trim();

if (!imagePath || !question) {
  console.error('usage: node tools/sol-vision.mjs <image> "<question>"');
  process.exit(2);
}

const key = process.env.PPQ_API_KEY;
if (!key) {
  console.error('PPQ_API_KEY is not set in the environment');
  process.exit(2);
}

const mime = extname(imagePath).toLowerCase() === '.jpg' || extname(imagePath).toLowerCase() === '.jpeg'
  ? 'image/jpeg'
  : 'image/png';
const dataUrl = `data:${mime};base64,${readFileSync(imagePath).toString('base64')}`;

const response = await fetch('https://api.ppq.ai/v1/chat/completions', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model: 'openai/gpt-6.1-sol',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: question },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }],
    max_completion_tokens: 900,
  }),
});

if (!response.ok) {
  console.error(`HTTP ${response.status}: ${(await response.text()).slice(0, 600)}`);
  process.exit(1);
}

const payload = await response.json();
const text = payload.choices?.[0]?.message?.content;
if (typeof text === 'string') console.log(text.trim());
else if (Array.isArray(text)) console.log(text.map(part => part.text ?? '').join('').trim());
else console.error('no text in response', JSON.stringify(payload).slice(0, 600));
