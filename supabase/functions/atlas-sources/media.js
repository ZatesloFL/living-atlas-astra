// Media bytes are checked before reserving space or contacting Storage.
export const MAX_ORIGINAL_BYTES = 16 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 512 * 1024;
export const MAX_PREVIEW_EDGE = 640;

const types = new Map([
  ['image/jpeg', 'image/jpeg'], ['image/png', 'image/png'], ['image/webp', 'image/webp'],
  ['text/plain', 'text/plain'], ['audio/mpeg', 'audio/mpeg'], ['audio/mp3', 'audio/mpeg'],
  ['audio/wav', 'audio/wav'], ['audio/wave', 'audio/wav'], ['audio/x-wav', 'audio/wav'],
  ['audio/flac', 'audio/flac'], ['audio/x-flac', 'audio/flac'],
  ['audio/ogg', 'audio/ogg'], ['audio/opus', 'audio/ogg'],
  ['audio/aac', 'audio/aac'], ['audio/mp4', 'audio/mp4'],
  ['audio/m4a', 'audio/mp4'], ['audio/x-m4a', 'audio/mp4'],
]);
export const mediaType = value => types.get(value.split(';', 1)[0].trim().toLowerCase());
const ascii = (bytes, at, text) => Array.from(text).every((c, i) => bytes[at + i] === c.charCodeAt(0));
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function jpeg(bytes) {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return;
  const data = view(bytes);
  const sof = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let dimensions, scan = false, scanned = false, at = 2;
  while (at < bytes.length) {
    if (bytes[at++] !== 0xff) {
      if (scan) continue;
      return;
    }
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === 0xd9) return scanned && at === bytes.length ? dimensions : undefined;
    if (scan && (marker === 0 || marker >= 0xd0 && marker <= 0xd7)) continue;
    scan = false;
    if (at + 2 > bytes.length) return;
    const length = data.getUint16(at);
    if (length < 2 || at + length > bytes.length) return;
    if (sof.has(marker)) {
      if (length < 8 || dimensions) return;
      dimensions = { height: data.getUint16(at + 3), width: data.getUint16(at + 5) };
      if (!dimensions.width || !dimensions.height) return;
    }
    if (marker === 0xda) {
      if (!dimensions) return;
      scan = true;
      scanned = true;
    }
    at += length;
  }
}

function png(bytes) {
  if (bytes.length < 45 || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return false;
  const data = view(bytes);
  if (data.getUint32(8) !== 13 || !ascii(bytes, 12, 'IHDR') || !data.getUint32(16) || !data.getUint32(20)) return false;
  let pixels = false;
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = data.getUint32(at);
    const next = at + length + 12;
    if (next > bytes.length || ascii(bytes, at + 4, 'acTL')) return false;
    if (ascii(bytes, at + 4, 'IDAT') && length) pixels = true;
    if (ascii(bytes, at + 4, 'IEND')) return pixels && length === 0 && next === bytes.length;
    at = next;
  }
  return false;
}

function riffChunks(bytes, kind) {
  if (bytes.length < 20 || !ascii(bytes, 0, 'RIFF') || !ascii(bytes, 8, kind)) return null;
  const data = view(bytes);
  if (data.getUint32(4, true) + 8 !== bytes.length) return null;
  const chunks = [];
  let at = 12;
  while (at + 8 <= bytes.length) {
    const size = data.getUint32(at + 4, true);
    const next = at + size + 8 + size % 2;
    if (next > bytes.length) return null;
    chunks.push({ name: String.fromCharCode(...bytes.subarray(at, at + 4)), offset: at + 8, size });
    at = next;
  }
  return at === bytes.length ? chunks : null;
}

function webp(bytes) {
  const chunks = riffChunks(bytes, 'WEBP');
  if (!chunks || chunks.some(c => c.name === 'ANIM' || c.name === 'ANMF' ||
      c.name === 'VP8X' && bytes[c.offset] & 2)) return false;
  return chunks.some(c => c.name === 'VP8 ' && c.size >= 10 &&
      bytes[c.offset + 3] === 0x9d && bytes[c.offset + 4] === 1 && bytes[c.offset + 5] === 0x2a ||
    c.name === 'VP8L' && c.size >= 5 && bytes[c.offset] === 0x2f);
}

function wav(bytes) {
  const chunks = riffChunks(bytes, 'WAVE');
  const fmt = chunks?.find(c => c.name === 'fmt ');
  return !!(fmt && fmt.size >= 16 && [1, 3, 0xfffe].includes(view(bytes).getUint16(fmt.offset, true)) &&
    chunks.some(c => c.name === 'data' && c.size > 0));
}

function mp3(bytes) {
  let at = 0, end = bytes.length, frames = 0;
  if (ascii(bytes, 0, 'ID3')) {
    if (end < 10 || bytes[3] < 2 || bytes[3] > 4 || bytes[4] === 0xff ||
        bytes.subarray(6, 10).some(b => b > 0x7f)) return false;
    at = 10 + bytes.subarray(6, 10).reduce((n, b) => n * 128 + b, 0);
    if (bytes[3] === 4 && bytes[5] & 0x10) at += 10;
  }
  if (end >= 128 && ascii(bytes, end - 128, 'TAG')) end -= 128;
  const classicRates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const lowRates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  while (at + 4 <= end) {
    const flags = bytes[at + 1], parameters = bytes[at + 2];
    const version = flags >> 3 & 3;
    const frequency = [44100, 48000, 32000][parameters >> 2 & 3];
    const bitrate = (version === 3 ? classicRates : lowRates)[parameters >> 4];
    if (bytes[at] !== 0xff || (flags & 0xe0) !== 0xe0 || (flags >> 1 & 3) !== 1 ||
        version === 1 || !frequency || !bitrate) return false;
    const sampleRate = frequency / (version === 3 ? 1 : version === 2 ? 2 : 4);
    at += Math.floor((version === 3 ? 144000 : 72000) * bitrate / sampleRate) + (parameters >> 1 & 1);
    frames++;
  }
  return frames > 0 && at === end;
}

function adts(bytes) {
  let at = 0;
  while (at + 7 <= bytes.length) {
    if (bytes[at] !== 0xff || (bytes[at + 1] & 0xf6) !== 0xf0 ||
        (bytes[at + 2] >> 2 & 15) >= 13) return false;
    const length = (bytes[at + 3] & 3) * 2048 + bytes[at + 4] * 8 + (bytes[at + 5] >> 5);
    if (length <= (bytes[at + 1] & 1 ? 7 : 9)) return false;
    at += length;
  }
  return at > 0 && at === bytes.length;
}

function flac(bytes) {
  if (bytes.length < 44 || !ascii(bytes, 0, 'fLaC') ||
      (bytes[4] & 0x7f) !== 0 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 34) return false;
  let at = 4;
  while (at + 4 <= bytes.length) {
    const last = bytes[at] & 0x80;
    at += 4 + bytes[at + 1] * 65536 + bytes[at + 2] * 256 + bytes[at + 3];
    if (last) return at + 2 < bytes.length && bytes[at] === 0xff && (bytes[at + 1] & 0xfe) === 0xf8;
  }
  return false;
}

function ogg(bytes) {
  const serials = new Map();
  const data = view(bytes);
  let at = 0;
  while (at + 27 <= bytes.length) {
    if (!ascii(bytes, at, 'OggS') || bytes[at + 4] !== 0) return false;
    const flags = bytes[at + 5], serial = data.getUint32(at + 14, true), count = bytes[at + 26];
    const payload = at + 27 + count;
    if (!count || payload > bytes.length) return false;
    const segments = bytes.subarray(at + 27, payload);
    const next = payload + segments.reduce((n, b) => n + b, 0);
    if (next > bytes.length || serials.get(serial) === 'ended') return false;
    if (flags & 2) {
      const first = segments[0];
      if (serials.has(serial) || !(first >= 19 && ascii(bytes, payload, 'OpusHead') ||
          first >= 30 && bytes[payload] === 1 && ascii(bytes, payload + 1, 'vorbis'))) return false;
      serials.set(serial, 'audio');
    } else if (!serials.has(serial)) return false;
    if (flags & 4) serials.set(serial, 'ended');
    at = next;
  }
  return at === bytes.length && serials.size > 0 && [...serials.values()].every(state => state === 'ended');
}

function mp4Audio(bytes) {
  const data = view(bytes);
  function boxes(from, to) {
    const result = [];
    for (let at = from; at < to;) {
      if (at + 8 > to) return null;
      let size = data.getUint32(at), header = 8;
      if (size === 1) {
        if (at + 16 > to || data.getUint32(at + 8) !== 0) return null;
        size = data.getUint32(at + 12);
        header = 16;
      } else if (size === 0) size = to - at;
      if (size < header || at + size > to) return null;
      result.push({ name: String.fromCharCode(...bytes.subarray(at + 4, at + 8)), from: at + header, to: at + size });
      at += size;
    }
    return result;
  }
  const top = boxes(0, bytes.length);
  const movies = top?.filter(box => box.name === 'moov');
  if (!top?.some(box => box.name === 'ftyp' && box.to - box.from >= 8) || movies?.length !== 1 ||
      !top?.some(box => box.name === 'mdat' && box.to > box.from)) return false;
  const tracks = boxes(movies[0].from, movies[0].to)?.filter(box => box.name === 'trak');
  return !!tracks?.length && tracks.every(track => {
    const media = boxes(track.from, track.to)?.filter(box => box.name === 'mdia');
    if (media?.length !== 1) return false;
    const handlers = boxes(media[0].from, media[0].to)?.filter(box => box.name === 'hdlr');
    return handlers?.length === 1 && handlers[0].from + 12 <= handlers[0].to &&
      ascii(bytes, handlers[0].from + 8, 'soun');
  });
}

function plain(bytes) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.trim().length > 0 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text);
  } catch {
    return false;
  }
}

export function isMedia(bytes, type) {
  if (!bytes.length) return false;
  switch (type) {
    case 'image/jpeg': return !!jpeg(bytes);
    case 'image/png': return png(bytes);
    case 'image/webp': return webp(bytes);
    case 'text/plain': return plain(bytes);
    case 'audio/wav': return wav(bytes);
    case 'audio/mpeg': return mp3(bytes);
    case 'audio/aac': return adts(bytes);
    case 'audio/flac': return flac(bytes);
    case 'audio/ogg': return ogg(bytes);
    case 'audio/mp4': return mp4Audio(bytes);
    default: return false;
  }
}

export function smallPreview(bytes) {
  const dimensions = jpeg(bytes);
  return !!dimensions && dimensions.width <= MAX_PREVIEW_EDGE && dimensions.height <= MAX_PREVIEW_EDGE;
}
