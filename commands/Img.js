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
    headers: { ...HEADERS, Referer: 'https://www.bing.com/' },
    timeout: 30000,
    validateStatus: () => true
  });

  const rawHtml = String(response.data || '');
  const html = decodeHtml(rawHtml);
  const results = [];
  const seen = new Set();

  const add = data => {
    const image = String(data.murl || '').replace(/\\u0026/g, '&');
    if (!image || seen.has(image)) return;
    seen.add(image);
    results.push({
      image,
      thumbnail: data.turl || null,
      title: data.t || '',
      page: data.purl || ''
    });
  };

  const objectRegex = /\{[^{}]*"murl":"https?:[^"]+"[^{}]*\}/g;
  let match;
  while ((match = objectRegex.exec(html)) !== null && results.length < 60) {
    try { add(JSON.parse(match[0])); } catch (_) {}
  }

  if (!results.length) {
    const blockRegex = /m="(\{[^"]*\})"/g;
    while ((match = blockRegex.exec(rawHtml)) !== null && results.length < 60) {
      try { add(JSON.parse(decodeHtml(match[1]))); } catch (_) {}
    }
  }

  if (!results.length) {
    const urlRegex = /"murl":"(https?:[^"]+)"/g;
    while ((match = urlRegex.exec(html)) !== null && results.length < 40) {
      add({ murl: match[1] });
    }
  }

  console.log(`Img Bing: HTTP ${response.status}, ${rawHtml.length} bytes, ${results.length} results for "${query}"`);
  return results;
}

async function searchDuckDuckGo(query) {
  const page = await axios.get(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
    headers: { ...HEADERS, Referer: 'https://duckduckgo.com/' },
    timeout: 30000,
    validateStatus: () => true
  });

  const html = String(page.data || '');
  const vqd = html.match(/vqd=["']([^"']+)["']/)?.[1] || html.match(/vqd=([\d-]+)/)?.[1];
  if (!vqd) return [];

  const response = await axios.get('https://duckduckgo.com/i.js', {
    params: { l: 'us-en', o: 'json', q: query, vqd, f: ',,,,,', p: '1', s: '0' },
    headers: { ...HEADERS, Referer: 'https://duckduckgo.com/' },
    timeout: 30000,
    validateStatus: () => true
  });

  const results = response.data?.results || [];
  return results
    .map(item => ({ image: item.image, thumbnail: item.thumbnail, title: item.title || '', page: item.url || '' }))
    .filter(item => /^https?:\/\//i.test(item.image || ''));
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

async function searchWikimedia(query) {
  const response = await axios.get('https://commons.wikimedia.org/w/api.php', {
    params: {
      action: 'query',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: '6',
      gsrlimit: '30',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '1024',
      format: 'json'
    },
    headers: HEADERS,
    timeout: 30000,
    validateStatus: () => true
  });

  const pages = Object.values(response.data?.query?.pages || {});
  return pages
    .map(page => {
      const info = page?.imageinfo?.[0] || {};
      return { image: info.thumburl || info.url, thumbnail: info.thumburl || null, title: page?.title || '', page: info.descriptionurl || '' };
    })
    .filter(item => /^https?:\/\//i.test(item.image || '') && /\.(jpe?g|png|webp)(\?|$)/i.test(item.image));
}

async function searchOpenverse(query) {
  const response = await axios.get('https://api.openverse.org/v1/images/', {
    params: { q: query, page_size: 20 },
    headers: HEADERS,
    timeout: 30000,
    validateStatus: () => true
  });

  const results = response.data?.results || [];
  return results
    .map(item => ({ image: item.url, thumbnail: item.thumbnail, title: item.title || '', page: item.foreign_landing_url || '' }))
    .filter(item => /^https?:\/\//i.test(item.image || ''));
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
          ['DuckDuckGo', searchDuckDuckGo],
          ['Yandex', searchYandex],
          ['Wikimedia', searchWikimedia],
          ['Openverse', searchOpenverse]
        ];

        const merged = [];
        const seen = new Set();

        for (const [name, search] of sources) {
          try {
            const found = await search(query);
            console.log(`Img search ${name}: ${found.length} results for "${query}"`);
            for (const item of found) {
              if (!item.image || seen.has(item.image)) continue;
              seen.add(item.image);
              merged.push({ ...item, source: name, score: scoreResult(query, item) });
            }
          } catch (error) {
            console.error(`Img search ${name} failed:`, error?.message || error);
          }
          if (merged.length >= 40) break;
        }

        const matched = merged.filter(item => item.score >= 20);
        const results = (matched.length ? matched : merged).sort((a, b) => b.score - a.score);
        console.log(`Img top results for "${query}":`, results.slice(0, 5).map(item => `${item.source}:${item.score}:${item.title}`).join(' | '));

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
              console.error('Img download failed:', error?.message || error);
              try {
                await sock.sendMessage(from, {
                  image: { url },
                  caption: sent === 0 ? `🖼️ *${query}*\n\n⚡ Powered by ${botName}` : undefined
                }, { quoted: msg });
                done = true;
                break;
              } catch (sendError) {
                console.error('Img send failed:', sendError?.message || sendError);
              }
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
