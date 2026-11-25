import mediaInfoFactory from 'mediainfo.js';
import wasmUrl from 'mediainfo.js/MediaInfoModule.wasm?url';

const chunkSize = 256 * 1024;
const localLimit = 16 * 1024 * 1024;
const remoteLimit = 3 * 1024 * 1024;

async function readRange(url, start, end, signal, total) {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal });
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(response.headers.get('Content-Range') ?? '');
  if (response.status !== 206 || !response.body || !range || +range[1] !== start || +range[2] !== end
    || !Number.isSafeInteger(+range[3]) || +range[3] <= end || (total && +range[3] !== total)) {
    void response.body?.cancel().catch(() => {});
    throw new Error('The server did not expose a readable byte range.');
  }

  // A server that ignores Range must not cause a full video download for this dialog.
  const reader = response.body.getReader();
  const bytes = new Uint8Array(end - start + 1);
  let written = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.length > bytes.length - written) throw new Error('Invalid byte range length.');
      bytes.set(value, written);
      written += value.length;
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  if (written !== bytes.length) throw new Error('Incomplete byte range.');
  return { bytes, size: +range[3] };
}

function codec(track) {
  const name = track?.Format;
  const id = track?.CodecID;
  const friendly = { AVC: 'H.264 / AVC', HEVC: 'H.265 / HEVC', VVC: 'H.266 / VVC' }[name] ?? name;
  if (!friendly) return id;
  return id && id.toLowerCase() !== name.toLowerCase() ? `${friendly} (${id})` : friendly;
}

function format(track) {
  if (track?.Format === 'MPEG-4') {
    if (/quicktime/i.test(track.Format_Profile ?? '') || track.CodecID?.trim() === 'qt') return 'QuickTime (MOV)';
    return 'MP4 (MPEG-4)';
  }
  return track?.Format;
}

function artwork(track) {
  const mime = track?.Cover_Mime?.toLowerCase();
  const data = track?.Cover_Data;
  if (!/^image\/(jpeg|png|webp|gif|bmp|avif)$/.test(mime ?? '') || !data || data.length > 12 * 1024 * 1024) return null;
  try {
    const raw = atob(data);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

async function inspectWithMediaInfo(source, abortSignal, includeCover) {
  const remote = !source.file;
  const signal = remote ? AbortSignal.any([abortSignal, AbortSignal.timeout(8000)]) : abortSignal;
  const size = remote ? (await readRange(source.url, 0, 0, signal)).size : source.file.size;
  if (!size) return {};
  const reader = await mediaInfoFactory({ locateFile: () => wasmUrl, chunkSize, coverData: includeCover });
  let read = 0;
  try {
    signal.throwIfAborted();
    const result = await reader.analyzeData(size, async (length, offset) => {
      signal.throwIfAborted();
      const count = Math.min(length, size - offset);
      if (count <= 0) return new Uint8Array();
      read += count;
      if (read > (remote ? remoteLimit : localLimit)) throw new Error('Metadata read limit reached.');
      if (remote) return (await readRange(source.url, offset, offset + count - 1, signal, size)).bytes;
      return new Uint8Array(await source.file.slice(offset, offset + count).arrayBuffer());
    });
    const track = (type) => result.media?.track.find((entry) => entry['@type'] === type);
    const video = track('Video');
    const general = track('General');
    return {
      format: format(general),
      videoCodec: codec(video),
      audioCodec: codec(track('Audio')),
      width: Number(video?.Width),
      height: Number(video?.Height),
      frameRate: Number(video?.FrameRate),
      variableRate: /^vfr$/i.test(video?.FrameRate_Mode ?? ''),
      ...(includeCover && { music: {
        track: general?.Track || general?.Title,
        artist: general?.Performer || general?.Album_Performer,
        album: general?.Album,
        cover: artwork(general),
      } }),
    };
  } finally {
    reader.close();
  }
}

export async function inspectMedia(source, signal, { includeCover = false } = {}) {
  if (!source.file || includeCover) return inspectWithMediaInfo(source, signal, includeCover);
  const inspectNative = () => inspectWithMediaInfo(source, signal, false);
  const inspectDemuxer = async () => {
    const { inspectContainer } = await import('./container-info.js');
    signal.throwIfAborted();
    return inspectContainer(source.file, signal);
  };
  const webm = /\.(webm|mkv)$/i.test(source.file.name) || /webm|matroska/i.test(source.file.type);
  const probes = webm ? [inspectDemuxer, inspectNative] : [inspectNative, inspectDemuxer];
  let details = {};
  let lastFailure;
  for (const probe of probes) {
    try {
      const result = await probe();
      for (const key of ['format', 'videoCodec', 'audioCodec', 'width', 'height']) {
        if (!details[key] && result[key]) details[key] = result[key];
      }
      if (!details.frameRate && Number.isFinite(result.frameRate) && result.frameRate > 0) {
        details = { ...details, frameRate: result.frameRate, estimatedRate: result.estimatedRate, variableRate: result.variableRate };
      }
      if (details.format && details.videoCodec && details.frameRate && details.audioCodec) break;
    } catch (error) {
      signal.throwIfAborted();
      lastFailure = error;
    }
  }
  if (!Object.keys(details).length && lastFailure) throw lastFailure;
  return details;
}
