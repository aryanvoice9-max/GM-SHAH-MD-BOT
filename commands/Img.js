import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9'
};

async function searchBing(query) {
  const response = await axios.get('https://www.bing.com/images/search', {
    params: { q: query, form: 'HDRSC2', first: '1' },
    headers: HEADERS,
    timeout: 30000,
    validateStatus: () => true
  });

  const html = String(response.data || '');
  const urls = [];
  const regex = /"murl":"(https?:[^"]+)"/g;
  let match;
  while ((match = regex.exec(html)) !== null && urls.length < 30) {
    const url = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    if (!urls.includes(url)) urls.push(url);
  }
  return urls.map(url => ({ image: url, thumbnail: null }));
}

async function searchDuckDuckGo(query) {
  const page = await axios.get(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
    headers: { ...HEADERS, Referer: 'https://duckduckgo.com/' },
    timeout: 30000,
    validateStatus: () => true
  });

  const html = String(page.data || '');
  const vqd = html.match(/vqd=["']([^"']+)["']/)?.[1] || html.match(/vqd=([\d-]+)/)?.[1];
  if (!vqd) throw new Error('Image search token not found');

  const response = await axios.get('https://duckduckgo.com/i.js', {
    params: { l: 'us-en', o: 'json', q: query, vqd, f: ',,,,,', p: '1', s: '0' },
    headers: { ...HEADERS, Referer: 'https://duckduckgo.com/' },
    timeout: 30000,
    validateStatus: () => true
  });

  const results = response.data?.results || [];
  return results
    .map(item => ({ image: item.image, thumbnail: item.thumbnail }))
    .filter(item => /^https?:\/\//i.test(item.image || ''));
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
      return { image: info.thumburl || info.url, thumbnail: info.thumburl || null };
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
    .map(item => ({ image: item.url, thumbnail: item.thumbnail }))
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
          ['Bing', searchBing],
          ['DuckDuckGo', searchDuckDuckGo],
          ['Wikimedia', searchWikimedia],
          ['Openverse', searchOpenverse]
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
