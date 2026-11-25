const errorMessage = 'Couldn’t open the stream. Check the URL, browser access (CORS), and codec support.';

export function makeHlsPlayer(Hls, video, { onError, onTracks }) {
  if (!Hls.isSupported()) throw new Error('HLS playback is not available in this browser.');
  const hls = new Hls({
    maxBufferLength: 45,
    maxMaxBufferLength: 90,
    maxBufferSize: 96 * 1024 * 1024,
    backBufferLength: 15,
  });
  const { Events } = Hls;
  let pending;
  let destroyed = false;
  hls.on(Events.MANIFEST_PARSED, () => {
    pending?.resolve();
    pending = null;
  });
  hls.on(Events.ERROR, (_event, data) => {
    if (!data.fatal || destroyed) return;
    const error = new Error(`${errorMessage} (${data.details})`);
    if (pending) {
      pending.reject(error);
      pending = null;
    } else {
      onError(error.message);
    }
  });
  for (const event of [
    Events.AUDIO_TRACKS_UPDATED, Events.AUDIO_TRACK_SWITCHED, Events.SUBTITLE_TRACKS_UPDATED,
    Events.SUBTITLE_TRACK_SWITCH, Events.LEVEL_SWITCHED,
  ]) {
    hls.on(event, () => queueMicrotask(() => { if (!destroyed) onTracks(); }));
  }
  const withNames = (tracks, selected) => tracks.map((track, id) => ({
    id, label: track.name, language: track.lang, active: id === selected,
  }));

  return {
    load: (url) => new Promise((resolve, reject) => {
      pending = { resolve, reject };
      hls.attachMedia(video);
      hls.loadSource(url);
    }),
    async destroy() {
      destroyed = true;
      pending?.reject(new DOMException('Source changed', 'AbortError'));
      pending = null;
      hls.destroy();
    },
    isLive: () => hls.latestLevelDetails?.live ?? false,
    seekRange: () => ({
      start: hls.latestLevelDetails?.fragmentStart ?? 0,
      end: hls.latestLevelDetails?.edge ?? 0,
    }),
    getAudioTracks: () => withNames(hls.audioTracks, hls.audioTrack),
    selectAudioTrack: (track) => { hls.audioTrack = track.id; },
    getTextTracks: () => withNames(hls.subtitleTracks, hls.subtitleDisplay ? hls.subtitleTrack : -1),
    selectTextTrack: (track) => {
      hls.subtitleDisplay = Boolean(track);
      hls.subtitleTrack = track?.id ?? -1;
    },
    getQualities: () => hls.levels.map((level, id) => ({
      id, height: level.height, hdr: level.videoRange, bandwidth: level.bitrate,
      active: id === (hls.autoLevelEnabled ? hls.currentLevel : hls.manualLevel),
    })),
    getMediaInfo() {
      const level = hls.levels[hls.currentLevel] ?? hls.levels[hls.loadLevel];
      const fragment = level?.details?.fragments[0];
      const path = fragment?.url?.split(/[?#]/)[0];
      const container = /\.(ts|m2ts)$/i.test(path ?? '') ? 'MPEG-TS'
        : /\.(m4s|mp4|cmfv)$/i.test(path ?? '') ? 'fMP4' : '';
      return {
        format: container ? `HLS · ${container}` : 'HLS',
        videoCodec: level?.videoCodec, audioCodec: hls.audioTracks[hls.audioTrack]?.audioCodec ?? level?.audioCodec,
        frameRate: level?.frameRate, width: level?.width, height: level?.height,
      };
    },
    isAutoQuality: () => hls.autoLevelEnabled,
    selectQuality: (track) => { hls.currentLevel = track?.id ?? -1; },
  };
}

export function makeDashPlayer(shaka, video, { onError, onTracks }) {
  shaka.polyfill.installAll();
  if (!shaka.Player.isBrowserSupported()) throw new Error('DASH playback is not available in this browser.');
  const player = new shaka.Player();
  player.configure({ streaming: { bufferingGoal: 45, rebufferingGoal: 2, bufferBehind: 15 } });
  let ready = false;
  player.addEventListener('error', (event) => {
    if (ready && event.detail.severity === shaka.util.Error.Severity.CRITICAL) {
      onError(`The stream stopped (code ${event.detail.code}). Check the URL and your connection.`);
    }
  });
  for (const type of ['trackschanged', 'audiotrackchanged', 'textchanged', 'variantchanged', 'adaptation']) {
    player.addEventListener(type, onTracks);
  }

  return {
    async load(url) {
      await player.attach(video);
      await player.load(url, undefined, 'application/dash+xml');
      ready = true;
    },
    destroy: () => player.destroy(),
    isLive: () => player.isLive(),
    seekRange: () => player.seekRange(),
    getAudioTracks: () => player.getAudioTracks(),
    selectAudioTrack: (track) => player.selectAudioTrack(track),
    getTextTracks: () => player.getTextTracks(),
    selectTextTrack: (track) => player.selectTextTrack(track),
    getQualities() {
      const tracks = player.getVariantTracks();
      const current = tracks.find((track) => track.active);
      return tracks.filter((track) => !current || track.audioId === current.audioId);
    },
    getMediaInfo() {
      const track = player.getVariantTracks().find((item) => item.active);
      const mime = track?.videoMimeType ?? track?.mimeType;
      const container = { 'video/mp4': 'fMP4', 'audio/mp4': 'fMP4', 'video/webm': 'WebM' }[mime];
      return {
        format: container ? `DASH · ${container}` : 'DASH',
        videoCodec: track?.videoCodec, audioCodec: track?.audioCodec,
        frameRate: track?.frameRate, width: track?.width, height: track?.height,
      };
    },
    isAutoQuality: () => player.getConfiguration().abr.enabled,
    selectQuality(track) {
      player.configure({ abr: { enabled: !track } });
      if (track) player.selectVariantTrack(track, true, 2);
    },
  };
}
