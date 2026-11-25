import axios from 'axios';
import { API_CONFIG } from '../shah/index.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

function decodeHtml(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreResult(query, item) {
  const q = normalize(query);
  const tokens = q.split(' ').filter(token => token.length > 2);
  const haystack = normalize(`${item.title || ''} ${item.page || ''} ${item.image || ''}`);

  let score = 0;
  if (q && haystack.includes(q)) score += 100;
  for (const token of tokens) {
    if (haystack.includes(token)) score += 20;
  }
  if (tokens.length && tokens.every(token => haystack.includes(token))) score += 50;
  return score;
}

function rankResults(query, results) {
  const scored = results.map(item => ({ ...item, score: scoreResult(query, item) }));
  const matched = scored.filter(item => item.score >= 20);
  const pool = matched.length ? matched : scored;
  pool.sort((a, b) => b.score - a.score);
  return pool;
}

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
    thumbnail: item.image?.thumbnailLink || null,
    title: item.title || '',
    page: item.image?.contextLink || ''
  })).filter(item => /^https?:\/\//i.test(item.image || ''));
}

async function searchBing(query) {
  const response = await axios.get('https://www.bing.com/images/search', {
    params: { q: query, form: 'HDRSC2', first: '1' },
    headers: HEADERS,
    timeout: 30000,
    validateStatus: () => true
  });

  const html = String(response.data || '');
  const results = [];
  const seen = new Set();

  const blockRegex = /m="(\{[^"]*\})"/g;
  let block;
  while ((block = blockRegex.exec(html)) !== null && results.length < 60) {
    try {
      const data = JSON.parse(decodeHtml(block[1]));
      const image = String(data.murl || '').replace(/\\u0026/g, '&');
      if (!image || seen.has(image)) continue;
      seen.add(image);
      results.push({
        image,
        thumbnail: data.turl || null,
        title: data.t || '',
        page: data.purl || ''
      });
    } catch (_) {}
  }

  if (!results.length) {
    const urlRegex = /"murl":"(https?:[^"]+)"/g;
    let match;
    while ((match = urlRegex.exec(html)) !== null && results.length < 40) {
      const image = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      if (!seen.has(image)) {
        seen.add(image);
        results.push({ image, thumbnail: null, title: '', page: '' });
      }
    }
  }

  console.log(`Img Bing: HTTP ${response.status}, ${results.length} results for "${query}"`);
  return rankResults(query, results);
}

async function searchYandex(query) {
  const response = await axios.get('https://yandex.com/images/search', {
    params: { text: query },
    headers: HEADERS,
    timeout: 30000,
    validateStatus: () => true
  });

  const html = String(response.data || '').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  const results = [];
  const seen = new Set();

  const hrefRegex = /"img_href":"(https?:[^"]+)"/g;
  let match;
  while ((match = hrefRegex.exec(html)) !== null && results.length < 40) {
    const image = match[1];
    if (!seen.has(image)) {
      seen.add(image);
      results.push({ image, thumbnail: null, title: '', page: '' });
    }
  }

  const thumbRegex = /"thumb":\{"url":"(https?:[^"]+)"/g;
  const thumbs = [];
  while ((match = thumbRegex.exec(html)) !== null && thumbs.length < 40) thumbs.push(match[1]);
  results.forEach((item, index) => { item.thumbnail = thumbs[index] || null; });

  console.log(`Img Yandex: HTTP ${response.status}, ${results.length} results for "${query}"`);
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
    description: 'Search and send 10 photos for any word.',
    category: 'Search',
    execute: async ({ sock, from, text, msg, config }) => {
      const botName = config?.BOT_NAME || 'GM SHAH MD BOT';
      const query = (text || '').trim();

      if (!query) {
        await sock.sendMessage(from, {
          text: `🖼️ *Image Search*\n\nUsage: \`.img <word>\`\nExample: \`.img cat\`\n\n⚡ Powered by ${botName}`
        }, { quoted: msg });
        return;
      }

      try {
        await sock.sendMessage(from, { text: `🖼️ Searching photos for: *${query}*` }, { quoted: msg });

        const sources = [
          ['Google', searchGoogleApi],
          ['Bing', searchBing],
          ['Yandex', searchYandex]
        ];

        let results = [];
        for (const [name, search] of sources) {
          try {
            results = await search(query);
            console.log(`Img search ${name}: ${results.length} results for "${query}"`);
            if (results.length) break;
          } catch (error) {
            console.error(`Img search ${name} failed:`, error?.message || error);
          }
        }

        if (!results.length) {
          await sock.sendMessage(from, {
            text: `❌ No photos found for: *${query}*\n\n⚡ Powered by ${botName}`
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
