import axios from 'axios';
import { API_CONFIG } from '../shah/index.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

async function searchGoogleApi(query) {
  const apiKey = API_CONFIG?.google?.apiKey || process.env.GOOGLE_API_KEY || '';
  const cx = API_CONFIG?.google?.cx || process.env.GOOGLE_CX || '';
  if (!apiKey || !cx) return [];

  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: { key: apiKey, cx, q: query, searchType: 'image', num: 10, safe: 'active' },
    timeout: 30000,
    validateStatus: () => true
  });

  const items = response.data?.items || [];
  return items.map(item => ({
    image: item.link,
    thumbnail: item.image?.thumbnailLink || null
  })).filter(item => /^https?:\/\//i.test(item.image || ''));
}

async function searchGoogleImages(query) {
  const response = await axios.get('https://www.google.com/search', {
    params: { q: query, tbm: 'isch', hl: 'en', safe: 'active' },
    headers: HEADERS,
    timeout: 30000,
    validateStatus: () => true
  });

  const html = String(response.data || '');
  const originals = [];
  const thumbnails = [];

  const originalRegex = /\["(https?:\/\/[^"]+?\.(?:jpg|jpeg|png|webp)[^"]*)",\d+,\d+\]/gi;
  let match;
  while ((match = originalRegex.exec(html)) !== null && originals.length < 40) {
    const url = match[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
    if (/google\.com|gstatic\.com/i.test(url)) continue;
    if (!originals.includes(url)) originals.push(url);
  }

  const thumbRegex = /"(https:\/\/encrypted-tbn0\.gstatic\.com\/images\?q=tbn:[^"]+)"/g;
  while ((match = thumbRegex.exec(html)) !== null && thumbnails.length < 40) {
    const url = match[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
    if (!thumbnails.includes(url)) thumbnails.push(url);
  }

  const results = originals.map((url, index) => ({ image: url, thumbnail: thumbnails[index] || null }));
  if (!results.length) {
    return thumbnails.map(url => ({ image: url, thumbnail: null }));
  }
  return results;
}

async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: HEADERS,
    maxContentLength: 12 * 1024 * 1024,
    maxBodyLength: 12 * 1024 * 1024,
    validateStatus: () => true
  });

  const type = String(response.headers?.['content-type'] || '');
  if (response.status !== 200 || !response.data?.byteLength) throw new Error(`HTTP ${response.status}`);
  if (type && !type.startsWith('image/')) throw new Error(`Not an image: ${type}`);
  return Buffer.from(response.data);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const commands = [
  {
    name: 'img',
    aliases: ['image', 'pic'],
    description: 'Search Google and send 10 photos for any word.',
    category: 'Search',
    execute: async ({ sock, from, text, msg, config }) => {
      const botName = config?.BOT_NAME || 'GM SHAH MD BOT';
      const query = (text || '').trim();

      if (!query) {
        await sock.sendMessage(from, {
          text: `🖼️ *Google Image Search*\n\nUsage: \`.img <word>\`\nExample: \`.img cat\`\n\n⚡ Powered by ${botName}`
        }, { quoted: msg });
        return;
      }

      try {
        await sock.sendMessage(from, { text: `🖼️ Searching Google photos for: *${query}*` }, { quoted: msg });

        let results = [];
        try {
          results = await searchGoogleApi(query);
          console.log(`Img Google API: ${results.length} results for "${query}"`);
        } catch (error) {
          console.error('Img Google API failed:', error?.message || error);
        }

        if (!results.length) {
          try {
            results = await searchGoogleImages(query);
            console.log(`Img Google Images: ${results.length} results for "${query}"`);
          } catch (error) {
            console.error('Img Google Images failed:', error?.message || error);
          }
        }

        if (!results.length) {
          await sock.sendMessage(from, {
            text: `❌ No photos found on Google for: *${query}*\n\n⚡ Powered by ${botName}`
          }, { quoted: msg });
          return;
        }

        let sent = 0;
        for (const item of results) {
          if (sent >= 10) break;

          const urls = [item.image, item.thumbnail].filter(Boolean);
          let done = false;

          for (const url of urls) {
            try {
              const buffer = await downloadImage(url);
              await sock.sendMessage(from, {
                image: buffer,
                caption: sent === 0 ? `🖼️ *${query}*\n\n⚡ Powered by ${botName}` : undefined
              }, { quoted: msg });
              done = true;
              break;
            } catch (error) {
              console.error('Img send failed:', error?.message || error);
            }
          }

          if (done) {
            sent++;
            await sleep(300);
          }
        }

        if (!sent) {
          await sock.sendMessage(from, {
            text: `❌ Photos could not be sent for: *${query}*. Please try again.\n\n⚡ Powered by ${botName}`
          }, { quoted: msg });
        }
      } catch (error) {
        console.error('Img command error:', error?.message || error);
        try {
          await sock.sendMessage(from, {
            text: `❌ Failed to search photos. Please try again.\n\n⚡ Powered by ${botName}`
          }, { quoted: msg });
        } catch (_) {}
      }
    }
  }
];
