import axios from 'axios';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Referer': 'https://duckduckgo.com/'
};

async function searchDuckDuckGo(query) {
  const page = await axios.get(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
    headers: HEADERS,
    timeout: 30000,
    validateStatus: () => true
  });

  const html = String(page.data || '');
  const vqd = html.match(/vqd=["']([^"']+)["']/)?.[1] || html.match(/vqd=([\d-]+)/)?.[1];
  if (!vqd) throw new Error('Image search token not found');

  const response = await axios.get('https://duckduckgo.com/i.js', {
    params: { l: 'us-en', o: 'json', q: query, vqd, f: ',,,,,', p: '1', s: '0' },
    headers: HEADERS,
    timeout: 30000,
    validateStatus: () => true
  });

  const results = response.data?.results || [];
  return results
    .map(item => ({ image: item.image, thumbnail: item.thumbnail, title: item.title || '' }))
    .filter(item => /^https?:\/\//i.test(item.image || ''));
}

async function searchOpenverse(query) {
  const response = await axios.get('https://api.openverse.org/v1/images/', {
    params: { q: query, page_size: 20 },
    headers: { 'User-Agent': HEADERS['User-Agent'] },
    timeout: 30000,
    validateStatus: () => true
  });

  const results = response.data?.results || [];
  return results
    .map(item => ({ image: item.url, thumbnail: item.thumbnail, title: item.title || '' }))
    .filter(item => /^https?:\/\//i.test(item.image || ''));
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

        let results = [];
        try {
          results = await searchDuckDuckGo(query);
        } catch (_) {}

        if (!results.length) {
          try {
            results = await searchOpenverse(query);
          } catch (_) {}
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
              await sock.sendMessage(from, {
                image: { url },
                caption: sent === 0 ? `🖼️ *${query}*\n\n⚡ Powered by ${botName}` : undefined
              }, { quoted: msg });
              done = true;
              break;
            } catch (_) {}
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
