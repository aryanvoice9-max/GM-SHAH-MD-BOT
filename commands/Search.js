import axios from 'axios';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import yts from 'yt-search';
import { API_CONFIG, MESSAGES } from '../shah/index.js';
import { t, translate, translateAIResponse, getUserLang } from '../shah/translator.js';

const BASE_URL = 'https://noobs-api.top';

export const commands = [
  {
    name: 'attpapi',
    aliases: ['attp-sticker'],
    description: 'Converts text into an ATTP sticker using API.',
    category: 'User',
    execute: async ({ sock, from, text, msg, config }) => {
      const botName = config.BOT_NAME || 'GM SHAH MD BOT';
      if (!text) {
        const noTextMsg = await t(from, 'attp', 'noText');
        return await sock.sendMessage(from, { 
          text: noTextMsg 
        }, { quoted: msg });
      }
      
      const gifUrl = `https://raganork-api.onrender.com/api/attp?text=${encodeURIComponent(text)}&apikey=${process.env.RAGANORK_API_KEY || ''}`;
      
      try {
        const packname = msg.pushName || botName;
        const stickerMess = new Sticker(gifUrl, {
          pack: botName,
          author: 'GM Shah MD',
          type: StickerTypes.FULL,
          categories: ['🤩', '🎉'],
          id: '12345',
          quality: 40,
          background: 'transparent'
        });
        const stickerBuffer = await stickerMess.toBuffer();
        await sock.sendMessage(from, {
          sticker: stickerBuffer,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      } catch {
        const errorMsg = await t(from, 'attp', 'error');
        await sock.sendMessage(from, {
          text: errorMsg,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      }
    }
  },
  {
    name: 'stickersearch',
    aliases: ['stsearch', 'stickerfind'],
    description: 'Search and create stickers from Tenor GIFs.',
    category: 'Search',
    execute: async ({ sock, from, text, msg, config }) => {
      const botName = config.BOT_NAME || 'GM SHAH MD BOT';
      if (!text) {
        const noTextMsg = await t(from, 'stickersearch', 'noText');
        return await sock.sendMessage(from, {
          text: noTextMsg,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      }
      
      try {
        const res = await axios.get(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(text)}&key=${process.env.TENOR_API_KEY || ''}&client_key=my_project&limit=5&media_filter=gif`);
        const gifs = res.data.results;
        
        for (let gif of gifs) {
          const sticker = new Sticker(gif.media_formats.gif.url, {
            pack: botName,
            author: 'GM Shah MD',
            type: StickerTypes.FULL,
            quality: 60,
            background: 'transparent'
          });
          const buffer = await sticker.toBuffer();
          await sock.sendMessage(from, {
            sticker: buffer,
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
            }
          }, { quoted: msg });
        }
      } catch {
        const errorMsg = await t(from, 'stickersearch', 'error');
        await sock.sendMessage(from, {
          text: errorMsg,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      }
    }
  },
  {
    name: 'weather',
    aliases: ['climate'],
    description: 'Get the current weather for a specific location.',
    category: 'Search',
    execute: async ({ sock, from, text, msg, config }) => {
      const botName = config.BOT_NAME || 'GM SHAH MD BOT';
      if (!text) {
        const noTextMsg = await t(from, 'weather', 'noText');
        return await sock.sendMessage(from, {
          text: noTextMsg,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      }
      
      try {
        const res = await axios.get(`https://api.openweathermap.org/data/2.5/weather`, {
          params: {
            q: text,
            units: 'metric',
            appid: process.env.WEATHER_API_KEY || '',
            language: 'en'
          }
        });
        
        const data = res.data;
        const sunrise = new Date(data.sys.sunrise * 1000).toLocaleTimeString();
        const sunset = new Date(data.sys.sunset * 1000).toLocaleTimeString();
        const rain = data.rain ? data.rain['1h'] : 0;
        
        const resultTemplate = await t(from, 'weather', 'result');
        const weatherText = resultTemplate
          .replace('{name}', data.name)
          .replace('{country}', data.sys.country)
          .replace('{temp}', data.main.temp)
          .replace('{feels}', data.main.feels_like)
          .replace('{min}', data.main.temp_min)
          .replace('{max}', data.main.temp_max)
          .replace('{desc}', data.weather[0].description)
          .replace('{humidity}', data.main.humidity)
          .replace('{wind}', data.wind.speed)
          .replace('{clouds}', data.clouds.all)
          .replace('{rain}', rain)
          .replace('{sunrise}', sunrise)
          .replace('{sunset}', sunset)
          .replace('{lat}', data.coord.lat)
          .replace('{lon}', data.coord.lon)
          .replace('{botName}', botName);
        
        await sock.sendMessage(from, {
          text: weatherText,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      } catch {
        const errorMsg = await t(from, 'weather', 'error');
        await sock.sendMessage(from, {
          text: errorMsg,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      }
    }
  },
  {
    name: 'yts',
    aliases: ['ytsearch'],
    description: 'Searches YouTube videos by keyword.',
    category: 'Search',
    execute: async ({ sock, from, text, msg, config }) => {
      const botName = config.BOT_NAME || 'GM SHAH MD BOT';
      if (!text) {
        const noTextMsg = await t(from, 'yts', 'noText');
        return await sock.sendMessage(from, {
          text: noTextMsg,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      }
      
      try {
        const info = await yts(text);
        const videos = info.videos.slice(0, 10);
        
        const headerTemplate = await t(from, 'yts', 'header');
        let resultText = headerTemplate.replace('{query}', text);
        
        const itemTemplate = await t(from, 'yts', 'item');
        for (let i = 0; i < videos.length; i++) {
          resultText += itemTemplate
            .replace('{num}', i + 1)
            .replace('{title}', videos[i].title)
            .replace('{channel}', videos[i].author.name)
            .replace('{duration}', videos[i].timestamp)
            .replace('{url}', videos[i].url);
        }
        
        const footerTemplate = await t(from, 'yts', 'footer');
        await sock.sendMessage(from, {
          image: { url: videos[0].thumbnail },
          caption: resultText + footerTemplate.replace('{botName}', botName),
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      } catch {
        const errorMsg = await t(from, 'yts', 'error');
        await sock.sendMessage(from, {
          text: errorMsg,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          }
        }, { quoted: msg });
      }
    }
  },
  {
    name: 'ytmp3',
    aliases: ['mp3'],
    description: 'Search and play MP3 music from YouTube (audio only).',
    category: 'Search',
    execute: async ({ sock, from, text, msg, config }) => {
      const botName = config.BOT_NAME || 'GM SHAH MD BOT';
      if (!text) {
        const noTextMsg = await t(from, 'ytmp3', 'noText');
        return sock.sendMessage(from, {
          text: noTextMsg
        }, { quoted: msg });
      }
      
      try {
        const search = await yts(text);
        const video = search.videos[0];
        if (!video) {
          const noResultsMsg = await t(from, 'ytmp3', 'noResults');
          return sock.sendMessage(from, {
            text: noResultsMsg
          }, { quoted: msg });
        }
        
        const safeTitle = video.title.replace(/[\\/:*?"<>|]/g, '');
        const fileName = `${safeTitle}.mp3`;
        const apiURL = `${BASE_URL}/dipto/ytDl3?link=${encodeURIComponent(video.videoId)}&format=mp3`;
        const response = await axios.get(apiURL);
        const data = response.data;
        
        if (!data.downloadLink) {
          const noLinkMsg = await t(from, 'ytmp3', 'noLink');
          return sock.sendMessage(from, {
            text: noLinkMsg
          }, { quoted: msg });
        }
        
        const captionMsg = await t(from, 'ytmp3', 'caption');
        await sock.sendMessage(from, {
          audio: { url: data.downloadLink },
          mimetype: 'audio/mpeg',
          fileName,
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
          },
          caption: captionMsg
        }, { quoted: msg });
      } catch (err) {
        console.error('Ytmp3 error:', err);
        const errorMsg = await t(from, 'ytmp3', 'error');
        await sock.sendMessage(from, {
          text: errorMsg
        }, { quoted: msg });
      }
    }
  },
  {
    name: 'ytmp4',
    aliases: ['video', 'ytv', 'ytvideo'],
    description: 'Downloads a YouTube video.',
    category: 'Download',
    execute: async ({ sock, from, text, msg, config }) => {
      const botName = config?.BOT_NAME || 'GM SHAH MD BOT';
      const query = (text || '').trim();
      if (!query) {
        return sock.sendMessage(from, {
          text: `🎬 *Video Command*\n\nUsage: \`.video <video name or YouTube link>\`\nExample: \`.video Atif Aslam\``
        }, { quoted: msg });
      }

      const pickVideoUrl = (data) => {
        if (!data || typeof data !== 'object') return null;
        const candidates = [
          data.downloadLink,
          data.data?.video,
          data.data?.videoUrl,
          data.data?.url,
          data.data?.download,
          data.data?.downloadLink,
          data.result?.video,
          data.result?.videoUrl,
          data.result?.url,
          data.result?.download,
          data.video,
          data.videoUrl,
          data.url,
          data.download
        ];
        for (const candidate of candidates) {
          if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) return candidate;
          if (candidate && typeof candidate === 'object') {
            const nested = candidate.url || candidate.link || candidate.video || candidate.download;
            if (typeof nested === 'string' && /^https?:\/\//i.test(nested)) return nested;
          }
        }
        const lists = [data.data?.downloads, data.result?.downloads, data.downloads, data.data?.formats, data.formats];
        for (const list of lists) {
          if (!Array.isArray(list)) continue;
          const mp4 = list.find(item => /mp4|video/i.test(String(item?.type || item?.format || item?.quality || '')) && /^https?:\/\//i.test(String(item?.url || item?.link || '')));
          if (mp4) return mp4.url || mp4.link;
          const first = list.find(item => /^https?:\/\//i.test(String(item?.url || item?.link || '')));
          if (first) return first.url || first.link;
        }
        return null;
      };

      try {
        await sock.sendMessage(from, { text: '🔍 Searching...' }, { quoted: msg });

        let video = null;
        const directId = query.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/))([A-Za-z0-9_-]{6,})/)?.[1];
        if (directId) {
          video = { videoId: directId, title: query };
        } else {
          const search = await yts(query);
          video = search?.videos?.[0] || null;
        }

        if (!video?.videoId) {
          return sock.sendMessage(from, {
            text: `❌ No video found for: *${query}*`
          }, { quoted: msg });
        }

        await sock.sendMessage(from, { text: '⬇️ Downloading video...' }, { quoted: msg });

        const videoUrl = `https://youtu.be/${video.videoId}`;
        let downloadLink = null;

        const nayanBase = API_CONFIG?.nayanApi?.youtube;
        if (nayanBase) {
          try {
            const response = await axios.get(`${nayanBase}?url=${encodeURIComponent(videoUrl)}`, {
              timeout: 60000,
              headers: { 'User-Agent': 'Mozilla/5.0' },
              validateStatus: () => true
            });
            downloadLink = pickVideoUrl(response.data);
          } catch (_) {}
        }

        if (!downloadLink) {
          const response = await axios.get(`${BASE_URL}/dipto/ytDl3?link=${encodeURIComponent(video.videoId)}&format=mp4`, {
            timeout: 60000,
            headers: { 'User-Agent': 'Mozilla/5.0' },
            validateStatus: () => true
          });
          downloadLink = pickVideoUrl(response.data);
        }

        if (!downloadLink) {
          return sock.sendMessage(from, {
            text: '❌ Failed to download this video. Please try again.'
          }, { quoted: msg });
        }

        const safeTitle = String(video.title || 'video').replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'video';
        await sock.sendMessage(from, {
          video: { url: downloadLink },
          mimetype: 'video/mp4',
          fileName: `${safeTitle}.mp4`,
          caption: `🎬 *${video.title || 'Video'}*\n\n⚡ Powered by ${botName}`
        }, { quoted: msg });
      } catch (err) {
        console.error('Video command error:', err?.message || err);
        try {
          await sock.sendMessage(from, {
            text: '❌ Failed to download this video. Please try again.'
          }, { quoted: msg });
        } catch (_) {}
      }
    }
  }
];
