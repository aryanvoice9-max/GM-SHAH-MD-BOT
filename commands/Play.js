import yts from 'yt-search';
import axios from 'axios';
import { API_CONFIG } from '../shah/index.js';

function pickAudioUrl(data) {
  if (!data || typeof data !== 'object') return null;

  const candidates = [
    data.data?.audio,
    data.data?.audioUrl,
    data.data?.audio_url,
    data.data?.url,
    data.data?.download,
    data.data?.downloadUrl,
    data.result?.audio,
    data.result?.audioUrl,
    data.result?.audio_url,
    data.result?.url,
    data.result?.download,
    data.audio,
    data.audioUrl,
    data.audio_url,
    data.url,
    data.download,
    data.downloadUrl
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = candidate.url || candidate.link || candidate.audio || candidate.download;
      if (typeof nested === 'string' && /^https?:\/\//i.test(nested)) return nested;
    }
  }

  const lists = [data.data?.downloads, data.result?.downloads, data.downloads, data.data?.formats, data.formats];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const audioItem = list.find(item => /audio|mp3|m4a/i.test(String(item?.type || item?.format || item?.quality || '')) && /^https?:\/\//i.test(String(item?.url || item?.link || '')));
    if (audioItem) return audioItem.url || audioItem.link;
    const first = list.find(item => /^https?:\/\//i.test(String(item?.url || item?.link || '')));
    if (first) return first.url || first.link;
  }

  return null;
}

function pickInfo(data) {
  const info = data?.data || data?.result || data || {};
  return {
    title: info.title || info.name || '',
    channel: info.channel || info.author || info.uploader || '',
    quality: info.quality || info.bitrate || '',
    thumb: info.thumb || info.thumbnail || info.image || ''
  };
}

async function fetchAudioLink(videoUrl) {
  const base = API_CONFIG?.nayanApi?.youtube;
  if (!base) throw new Error('Download API is not configured');

  const apiUrl = `${base}?url=${encodeURIComponent(videoUrl)}`;
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await axios.get(apiUrl, {
        timeout: 60000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        validateStatus: () => true
      });

      const audioUrl = pickAudioUrl(response.data);
      if (audioUrl) return { audioUrl, info: pickInfo(response.data) };

      lastError = new Error(`Download API returned no audio link (HTTP ${response.status})`);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Download API returned no audio link');
}

export const commands = [
  {
    name: 'play',
    aliases: ['mp3', 'audio'],
    description: 'Search and download MP3 audio from YouTube (audio only).',
    category: 'Search',
    execute: async ({ sock, from, text, msg, config }) => {
      const botName = config?.BOT_NAME || 'GM SHAH MD BOT';
      const botVersion = config?.BOT_VERSION || '3.0.0';
      const query = (text || '').trim();

      if (!query) {
        await sock.sendMessage(from, {
          text: `🎵 *Play Command*\n\nUsage: \`.play <song name>\`\nExample: \`.play Atif Aslam\`\n\n⚡ Powered by ${botName} ${botVersion}`
        }, { quoted: msg });
        return;
      }

      try {
        await sock.sendMessage(from, { text: '🔍 Searching...' }, { quoted: msg });

        let video = null;
        const directId = query.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([A-Za-z0-9_-]{6,})/)?.[1];
        if (directId) {
          video = { videoId: directId, title: query, thumbnail: `https://i.ytimg.com/vi/${directId}/hqdefault.jpg` };
        } else {
          const search = await yts(query);
          video = search?.videos?.[0] || null;
        }

        if (!video?.videoId) {
          await sock.sendMessage(from, {
            text: `❌ No song found for: *${query}*\n\n⚡ Powered by ${botName} ${botVersion}`
          }, { quoted: msg });
          return;
        }

        await sock.sendMessage(from, { text: '⬇️ Downloading audio...' }, { quoted: msg });

        const videoUrl = `https://youtu.be/${video.videoId}`;
        const { audioUrl, info } = await fetchAudioLink(videoUrl);

        const title = info.title || video.title || 'Audio';
        const safeTitle = String(title).replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'audio';

        await sock.sendMessage(from, {
          image: { url: video.thumbnail || info.thumb || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg` },
          caption:
            `*🎵 ${botName.toUpperCase()} SONG PLAYER*\n\n` +
            `╭─❏ Title: ${title}\n` +
            `│ Duration: ${video.timestamp || 'N/A'}\n` +
            `│ Channel: ${info.channel || video.author?.name || 'N/A'}\n` +
            `│ Quality: ${info.quality || '128'}kbps\n` +
            `│ Powered: ${botName}\n` +
            `╰─────────────\n\n` +
            `🔗 https://youtube.com/watch?v=${video.videoId}`
        }, { quoted: msg });

        await sock.sendMessage(from, {
          audio: { url: audioUrl },
          mimetype: 'audio/mpeg',
          fileName: `${safeTitle}.mp3`
        }, { quoted: msg });
      } catch (error) {
        console.error('Play command error:', error?.message || error);
        try {
          await sock.sendMessage(from, {
            text: `❌ Failed to play this song. Please try again.\n\n⚡ Powered by ${botName} ${botVersion}`
          }, { quoted: msg });
        } catch (_) {}
      }
    }
  }
];
