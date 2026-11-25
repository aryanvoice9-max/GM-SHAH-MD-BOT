import axios from 'axios';
import FormData from 'form-data';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function removeBgWithFreeApi(buffer) {
  const form = new FormData();
  form.append('image', buffer, { filename: 'image.jpg' });

  const response = await axios.post('https://nohustle-api.onrender.com/remove-bg', form, {
    headers: { ...form.getHeaders() },
    responseType: 'arraybuffer',
    timeout: 120000,
    validateStatus: () => true
  });

  if (response.status === 200 && response.data && response.data.byteLength > 100) {
    return Buffer.from(response.data);
  }
  throw new Error(`Free RemoveBG API error: HTTP ${response.status}`);
}

async function removeBgFromUrlWithFreeApi(url) {
  const response = await axios.post('https://agentmediatools.com/api/tools/remove-background', { image_url: url }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 120000,
    validateStatus: () => true
  });

  const data = response.data?.data || response.data?.result || '';
  if (response.status === 200 && typeof data === 'string' && data.length > 100) {
    const base64 = data.includes(',') ? data.split(',').pop() : data;
    return Buffer.from(base64, 'base64');
  }
  throw new Error(`Free RemoveBG URL API error: HTTP ${response.status}`);
}

async function getQuotedOrOwnImageBuffer(msg) {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.imageMessage) {
    return streamToBuffer(await downloadContentFromMessage(quoted.imageMessage, 'image'));
  }

  if (msg.message?.imageMessage) {
    return streamToBuffer(await downloadContentFromMessage(msg.message.imageMessage, 'image'));
  }

  return null;
}

export const commands = [
  {
    name: 'removebg',
    aliases: ['rmbg', 'nobg'],
    description: 'Remove background from an image',
    category: 'Converter',

    execute: async ({ sock, from, msg, text }) => {
      const apiKey = process.env.REMOVEBG_API_KEY || '';

      try {
        const url = (text || '').trim();
        let imageBuffer = null;

        if (url) {
          if (!isValidUrl(url)) {
            await sock.sendMessage(from, {
              text: '❌ Invalid URL provided.\n\nUsage: `.removebg https://example.com/image.jpg`'
            }, { quoted: msg });
            return;
          }
        } else {
          imageBuffer = await getQuotedOrOwnImageBuffer(msg);
          if (!imageBuffer) {
            await sock.sendMessage(from, {
              text: '📸 *Remove Background Command*\n\nUsage:\n• `.removebg <image_url>`\n• Reply to an image with `.removebg`\n• Send an image with caption `.removebg`\n\nExample: `.removebg https://example.com/image.jpg`'
            }, { quoted: msg });
            return;
          }
        }

        let resultBuffer = null;

        if (apiKey) {
          const form = new FormData();
          if (url) form.append('image_url', url);
          else form.append('image_file', imageBuffer, { filename: 'image.jpg' });
          form.append('size', 'auto');

          const response = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
            headers: { 'X-Api-Key': apiKey, ...form.getHeaders() },
            responseType: 'arraybuffer',
            timeout: 60000,
            validateStatus: () => true
          });

          if (response.status === 200 && response.data) {
            resultBuffer = Buffer.from(response.data);
          } else {
            let detail = '';
            try {
              detail = JSON.parse(Buffer.from(response.data).toString()).errors?.[0]?.title || '';
            } catch (_) {}

            if (response.status === 402) throw new Error('CREDITS_FINISHED');
            if (response.status === 403) throw new Error('BAD_KEY');
            throw new Error(detail || `RemoveBG API error: HTTP ${response.status}`);
          }
        } else if (url) {
          try {
            resultBuffer = await removeBgFromUrlWithFreeApi(url);
          } catch (_) {
            const downloaded = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
            resultBuffer = await removeBgWithFreeApi(Buffer.from(downloaded.data));
          }
        } else {
          resultBuffer = await removeBgWithFreeApi(imageBuffer);
        }

        await sock.sendMessage(from, {
          image: resultBuffer,
          caption: '✨ *Background removed successfully!*'
        }, { quoted: msg });
        return;
      } catch (error) {
        console.error('RemoveBG Error:', error.message);

        let errorMessage = '❌ Failed to remove background.';
        if (error.message === 'CREDITS_FINISHED') {
          errorMessage = '⏰ This month\'s 50 free credits are finished. You will get 50 again next month, or add credits on remove.bg.';
        } else if (error.message === 'BAD_KEY') {
          errorMessage = '❌ API key is invalid. Check REMOVEBG_API_KEY in the panel Environment.';
        } else if (error.code === 'ECONNABORTED') {
          errorMessage = '⏰ Request timeout. Please try again.';
        } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('ECONNREFUSED')) {
          errorMessage = '🌐 Network error. Please check your connection.';
        }

        await sock.sendMessage(from, { text: errorMessage }, { quoted: msg });
      }
    }
  }
];
