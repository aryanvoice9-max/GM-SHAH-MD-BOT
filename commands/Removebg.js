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

      if (!apiKey) {
        await sock.sendMessage(from, {
          text: '⚙️ *RemoveBG API key is not set.*\n\nGet a free key:\n1. Create a free account at https://www.remove.bg/api\n2. Copy your API key\n3. Add it in the panel Environment as: REMOVEBG_API_KEY\n\nThe first 50 images every month are free. Never put the key in GitHub.'
        }, { quoted: msg });
        return;
      }

      try {
        const form = new FormData();
        const url = (text || '').trim();

        if (url) {
          if (!isValidUrl(url)) {
            await sock.sendMessage(from, {
              text: '❌ Invalid URL provided.\n\nUsage: `.removebg https://example.com/image.jpg`'
            }, { quoted: msg });
            return;
          }
          form.append('image_url', url);
        } else {
          const buffer = await getQuotedOrOwnImageBuffer(msg);
          if (!buffer) {
            await sock.sendMessage(from, {
              text: '📸 *Remove Background Command*\n\nUsage:\n• `.removebg <image_url>`\n• Reply to an image with `.removebg`\n• Send an image with caption `.removebg`\n\nExample: `.removebg https://example.com/image.jpg`'
            }, { quoted: msg });
            return;
          }
          form.append('image_file', buffer, { filename: 'image.jpg' });
        }

        form.append('size', 'auto');

        const response = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
          headers: { 'X-Api-Key': apiKey, ...form.getHeaders() },
          responseType: 'arraybuffer',
          timeout: 60000,
          validateStatus: () => true
        });

        if (response.status === 200 && response.data) {
          await sock.sendMessage(from, {
            image: Buffer.from(response.data),
            caption: '✨ *Background removed successfully!*'
          }, { quoted: msg });
          return;
        }

        let detail = '';
        try {
          detail = JSON.parse(Buffer.from(response.data).toString()).errors?.[0]?.title || '';
        } catch (_) {}

        if (response.status === 402) throw new Error('CREDITS_FINISHED');
        if (response.status === 403) throw new Error('BAD_KEY');
        throw new Error(detail || `RemoveBG API error: HTTP ${response.status}`);
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
