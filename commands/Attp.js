import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

let attpBusy = false;

async function renderBlinkingWebpWithFfmpeg(text) {
  const fontPath = resolveFontPath();
  if (!fontPath) throw new Error('FONT_MISSING');

  const ffmpegPath = await getFfmpegPath();
  const safeText = escapeDrawtextText(text);
  const safeFontPath = process.platform === 'win32'
    ? fontPath.replace(/\\/g, '/').replace(':', '\\:')
    : fontPath;

  const cycle = 0.3;
  const dur = 1.2;
  const fontsize = Math.max(20, Math.min(42, Math.floor(620 / Math.max(text.length, 1))));

  const drawRed = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=red:borderw=2:bordercolor=black@0.6:fontsize=${fontsize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='lt(mod(t\,${cycle})\,0.1)'`;
  const drawBlue = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=blue:borderw=2:bordercolor=black@0.6:fontsize=${fontsize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(mod(t\,${cycle})\,0.1\,0.2)'`;
  const drawGreen = `drawtext=fontfile='${safeFontPath}':text='${safeText}':fontcolor=green:borderw=2:bordercolor=black@0.6:fontsize=${fontsize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(mod(t\,${cycle})\,0.2)'`;
  const filter = `${drawRed},${drawBlue},${drawGreen}`;

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=black:s=256x256:d=${dur}:r=10`,
    '-vf', filter,
    '-c:v', 'libwebp',
    '-loop', '0',
    '-q:v', '55',
    '-preset', 'picture',
    '-an',
    '-t', String(dur),
    '-f', 'webp',
    'pipe:1'
  ];

  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    const chunks = [];
    const errors = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ff.kill('SIGKILL'); } catch (_) {}
      reject(new Error('FFMPEG_TIMEOUT'));
    }, 20000);

    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', e => errors.push(e));
    ff.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    ff.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0 && chunks.length) return resolve(Buffer.concat(chunks));
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

    execute: async ({ sock, from, msg, text }) => {
      const input = (text || '').trim().slice(0, 60);

      if (!input) {
        await sock.sendMessage(from, { text: 'Please provide text after the .attp command.' }, { quoted: msg });
        return;
      }

      if (attpBusy) {
        await sock.sendMessage(from, { text: '⏳ Please wait, one .attp sticker is already being made.' }, { quoted: msg });
        return;
      }

      attpBusy = true;
      try {
        const webpBuffer = await renderBlinkingWebpWithFfmpeg(input);
        await sock.sendMessage(from, { sticker: webpBuffer }, { quoted: msg });
      } catch (error) {
        console.error('Error generating ATTP sticker:', error);
        const errorText = String(error?.message || '');

        try {
          if (error?.code === 'ENOENT' || /ENOENT|spawn .* ENOENT/i.test(errorText)) {
            await sock.sendMessage(from, { text: '❌ FFmpeg is not installed on this server, so .attp cannot make stickers here. Please use a server with FFmpeg installed.' }, { quoted: msg });
          } else if (errorText === 'FONT_MISSING' || /font|drawtext/i.test(errorText)) {
            await sock.sendMessage(from, { text: '❌ No font found on this server for .attp. Please use a server with fonts installed.' }, { quoted: msg });
          } else if (errorText === 'FFMPEG_TIMEOUT') {
            await sock.sendMessage(from, { text: '⏰ Sticker took too long to make. Please try shorter text.' }, { quoted: msg });
          } else {
            await sock.sendMessage(from, { text: 'Failed to generate the sticker locally.' }, { quoted: msg });
          }
        } catch (_) {}
      } finally {
        attpBusy = false;
      }
    }
  }
];
