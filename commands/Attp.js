import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { writeExifVid } from '../lib/exif.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveFontPath() {
  const candidates = [
    path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans-Bold.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf'
  ];

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  return null;
}

async function getFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const mod = await import('ffmpeg-static');
    const ffmpegPath = mod.default || mod;
    if (ffmpegPath && fs.existsSync(ffmpegPath)) return ffmpegPath;
  } catch (_) {}
  return 'ffmpeg';
}

function escapeDrawtextText(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,')
    .replace(/'/g, "\\'")
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%');
}

async function renderBlinkingVideoWithFfmpeg(text) {
  const fontPath = resolveFontPath();
  if (!fontPath) throw new Error('FONT_MISSING');

  const ffmpegPath = await getFfmpegPath();
  const safeText = escapeDrawtextText(text);
  const safeFontPath = process.platform === 'win32'
    ? fontPath.replace(/\\/g, '/').replace(':', '\\:')
    : fontPath;

  const cycle = 0.3;
  const dur = 1.8;
  const fontsize = Math.max(28, Math.min(56, Math.floor(900 / Math.max(text.length, 1))));

  const drawRed = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=red:borderw=2:bordercolor=black@0.6:fontsize=${fontsize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='lt(mod(t\,${cycle})\,0.1)'`;
  const drawBlue = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=blue:borderw=2:bordercolor=black@0.6:fontsize=${fontsize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(mod(t\,${cycle})\,0.1\,0.2)'`;
  const drawGreen = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=green:borderw=2:bordercolor=black@0.6:fontsize=${fontsize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(mod(t\,${cycle})\,0.2)'`;
  const filter = `${drawRed},${drawBlue},${drawGreen}`;

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=512x512:d=${dur}:r=20`,
    '-vf', filter,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart+frag_keyframe+empty_moov',
    '-t', String(dur),
    '-f', 'mp4',
    'pipe:1'
  ];

  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    const chunks = [];
    const errors = [];
    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', e => errors.push(e));
    ff.on('error', reject);
    ff.on('close', code => {
      if (code === 0) return resolve(Buffer.concat(chunks));
      reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
    });
  });
}

export const commands = [
  {
    name: 'attp',
    aliases: ['attptext', 'textsticker'],
    description: 'Creates a blinking ATTP sticker from text',
    category: 'Sticker',

    execute: async ({ sock, from, msg, text, config }) => {
      const input = (text || '').trim();

      if (!input) {
        await sock.sendMessage(from, { text: 'Please provide text after the .attp command.' }, { quoted: msg });
        return;
      }

      try {
        const mp4Buffer = await renderBlinkingVideoWithFfmpeg(input);
        const webpBuffer = await writeExifVid(mp4Buffer, {
          packname: config?.BOT_NAME || 'GM SHAH MD BOT',
          author: config?.OWNER_NAME || 'GM Shah MD'
        });
        await sock.sendMessage(from, { sticker: webpBuffer }, { quoted: msg });
      } catch (error) {
        console.error('Error generating ATTP sticker:', error);
        const errorText = String(error?.message || '');

        if (error?.code === 'ENOENT' || /ENOENT|spawn .* ENOENT/i.test(errorText)) {
          await sock.sendMessage(from, { text: '❌ FFmpeg is not installed on this server, so .attp cannot make stickers here. Please use a server with FFmpeg installed.' }, { quoted: msg });
        } else if (errorText === 'FONT_MISSING' || /font|drawtext/i.test(errorText)) {
          await sock.sendMessage(from, { text: '❌ No font found on this server for .attp. Please use a server with fonts installed.' }, { quoted: msg });
        } else {
          await sock.sendMessage(from, { text: 'Failed to generate the sticker locally.' }, { quoted: msg });
        }
      }
    }
  }
];
