import axios from 'axios';
import { API_CONFIG } from '../shah/index.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml'
};

function cleanUrl(url) {
  return String(url || '')
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

function isImageUrl(url) {
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)
    || /googleusercontent\.com/i.test(url)
    || /encrypted-tbn\d*\.gstatic\.com/i.test(url);
}

function unescapeGoogleHtml(html) {
  return String(html || '')
    .replace(/\\u003d/g, '=')
    .replace(/\\u0026/g, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function parseGoogleHtml(rawHtml) {
  const html = unescapeGoogleHtml(rawHtml);
  const originals = [];
  const thumbnails = [];

  const addUrl = rawUrl => {
    const url = cleanUrl(rawUrl).replace(/[",\]]+$/, '');
    if (!/^https?:\/\//i.test(url)) return;
    if (/google\.com\/search|accounts\.google|www\.google\.com\/images\/branding|ssl\.gstatic\.com\/gb|www\.gstatic\.com/i.test(url)) return;
    if (!isImageUrl(url)) return;
    if (/encrypted-tbn\d*\.gstatic\.com/i.test(url)) {
      if (!thumbnails.includes(url)) thumbnails.push(url);
      return;
    }
    if (!originals.includes(url)) originals.push(url);
  };

  let match;
  const sizedRegex = /\["(https?:\/\/[^"]+)",(\d+),(\d+)\]/g;
  while ((match = sizedRegex.exec(html)) !== null && originals.length < 40) addUrl(match[1]);

  const imgurlRegex = /imgurl=(https?%3A%2F%2F[^&"']+)/gi;
  while ((match = imgurlRegex.exec(html)) !== null && originals.length < 40) {
    try { addUrl(decodeURIComponent(match[1])); } catch (_) {}
  }

  const anyUrlRegex = /https?:\/\/[^\s"'<>\\]+/g;
  while ((match = anyUrlRegex.exec(html)) !== null && (originals.length < 40 || thumbnails.length < 40)) {
    addUrl(match[0]);
  }

  const results = originals.map((url, index) => ({ image: url, thumbnail: thumbnails[index] || null }));
  if (!results.length) return thumbnails.map(url => ({ image: url, thumbnail: null }));
  return results;
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
    thumbnail: item.image?.thumbnailLink || null
  })).filter(item => /^https?:\/\//i.test(item.image || ''));
}

async function searchGoogleImages(query) {
  const attempts = [
    { name: 'tbm', params: { q: query, tbm: 'isch', hl: 'en', safe: 'active' } },
    { name: 'udm', params: { q: query, udm: '2', hl: 'en', safe: 'active' } },
    { name: 'gbv', params: { q: query, tbm: 'isch', gbv: '1', hl: 'en', safe: 'active' } }
  ];

  for (const attempt of attempts) {
    try {
      const response = await axios.get('https://www.google.com/search', {
        params: attempt.params,
        headers: HEADERS,
        timeout: 30000,
        validateStatus: () => true
      });

      const html = String(response.data || '');
      const blocked = /\/sorry\/|unusual traffic|captcha|consent\.google/i.test(html) ? ' blocked-page' : '';
      const results = parseGoogleHtml(html);
      console.log(`Img Google ${attempt.name}: HTTP ${response.status}, ${html.length} bytes, ${results.length} results${blocked} for "${query}"`);
      if (results.length) return results;
    } catch (error) {
      console.error(`Img Google ${attempt.name} failed:`, error?.message || error);
    }
  }

  return [];
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
          results = await searchGoogleImages(query);
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
