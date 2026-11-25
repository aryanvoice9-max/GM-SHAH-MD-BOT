import fs from 'fs';
import { tmpdir } from 'os';
import Crypto from 'crypto';
import path from 'path';
import { spawn } from 'child_process';

const STICKER_PACK_ID = 'https://github.com/aryanvoice9-max/GM-SHAH-MD-BOT';

function tmpPath(ext) {
  return path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.${ext}`);
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

async function runFfmpeg(args) {
  const ffmpegPath = await getFfmpegPath();
  return new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, args);
    const errors = [];
    ff.stderr.on('data', d => errors.push(d));
    ff.on('error', reject);
    ff.on('close', code => {
      if (code === 0) return resolve(true);
      reject(new Error(Buffer.concat(errors).toString() || `ffmpeg exited with code ${code}`));
    });
  });
}

async function mediaToWebp(media, inputExt, isVideo) {
  const tmpFileOut = tmpPath('webp');
  const tmpFileIn = tmpPath(inputExt);
  fs.writeFileSync(tmpFileIn, media);

  const filter = 'scale=320:320:force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0,split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse';
  const args = ['-y', '-i', tmpFileIn, '-vcodec', 'libwebp', '-vf', filter];
  if (isVideo) {
    args.push('-loop', '0', '-ss', '00:00:00', '-t', '00:00:05', '-preset', 'default', '-an', '-vsync', '0');
  }
  args.push(tmpFileOut);

  try {
    await runFfmpeg(args);
    return fs.readFileSync(tmpFileOut);
  } finally {
    try { fs.unlinkSync(tmpFileOut); } catch (_) {}
    try { fs.unlinkSync(tmpFileIn); } catch (_) {}
  }
}

export async function imageToWebp(media) {
  return mediaToWebp(media, 'jpg', false);
}

export async function videoToWebp(media) {
  return mediaToWebp(media, 'mp4', true);
}

async function writeExifBuffer(wMedia, metadata = {}) {
  if (!metadata.packname && !metadata.author) return wMedia;

  let webp;
  try {
    const mod = await import('node-webpmux');
    webp = mod.default?.Image ? mod.default : mod;
    if (!webp?.Image) return wMedia;
  } catch (_) {
    return wMedia;
  }

  const tmpFileIn = tmpPath('webp');
  const tmpFileOut = tmpPath('webp');
  fs.writeFileSync(tmpFileIn, wMedia);

  try {
    const img = new webp.Image();
    const json = {
      'sticker-pack-id': STICKER_PACK_ID,
      'sticker-pack-name': metadata.packname,
      'sticker-pack-publisher': metadata.author,
      emojis: metadata.categories ? metadata.categories : ['']
    };
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
    const exif = Buffer.concat([exifAttr, jsonBuff]);
    exif.writeUIntLE(jsonBuff.length, 14, 4);

    await img.load(tmpFileIn);
    img.exif = exif;
    await img.save(tmpFileOut);
    return fs.readFileSync(tmpFileOut);
  } finally {
    try { fs.unlinkSync(tmpFileIn); } catch (_) {}
    try { fs.unlinkSync(tmpFileOut); } catch (_) {}
  }
}

export async function writeExifImg(media, metadata = {}) {
  const wMedia = await imageToWebp(media);
  return writeExifBuffer(wMedia, metadata);
}

export async function writeExifVid(media, metadata = {}) {
  const wMedia = await videoToWebp(media);
  return writeExifBuffer(wMedia, metadata);
}

export async function writeExif(media, metadata = {}) {
  const wMedia = /webp/.test(media.mimetype)
    ? media.data
    : /image/.test(media.mimetype)
      ? await imageToWebp(media.data)
      : /video/.test(media.mimetype)
        ? await videoToWebp(media.data)
        : Buffer.alloc(0);
  return writeExifBuffer(wMedia, metadata);
}
