import '@fontsource-variable/dm-sans/wght.css';
import { registerSW } from 'virtual:pwa-register';
import { icon, iconButton } from './icons.js';
import { asWebVtt } from './subtitles.js';
import { makeDashPlayer, makeHlsPlayer } from './adaptive.js';
import { createImageViewer } from './image-viewer.js';
import { collectFiles, collectFolderImages, imageFormat, isImageFile } from './playlist.js';
import { deleteSavedPlaylist, listSavedPlaylists, loadSavedPlaylist, savePlaylist } from './playlist-library.js';
import logoUrl from '../Kahve.png?url';
import './style.css';

registerSW();

const videoInfoFields = [
  ['format', 'Format'], ['videoCodec', 'Video codec'], ['audioCodec', 'Audio codec'],
  ['frameRate', 'Frame rate'], ['resolution', 'Resolution'], ['duration', 'Duration'],
];

document.querySelector('#app').innerHTML = `
  <main class="stage" id="stage" aria-label="Kahve Player">
        <video id="video" preload="metadata" playsinline aria-label="Video playback"></video>
        <div id="image-viewer" hidden></div>
        <div class="stage-shading" aria-hidden="true"></div>
        <header class="stage-top">
          <img class="brand-mark" src="${logoUrl}" alt="" title="Kahve Player" draggable="false">
          <button type="button" class="toolbar-button" id="open-source" aria-expanded="false" aria-controls="player-menu">${icon('FolderOpen')}<span>Open</span>${icon('ChevronDown')}</button>
          <div class="source-info">
            <span class="source-tag" id="source-tag">NO MEDIA</span>
            <span id="media-title" class="media-title" hidden></span>
          </div>
          <div class="top-actions">
            ${iconButton('about', 'About Kahve', 'Info', 'aria-haspopup="dialog" aria-controls="about-dialog"')}
            ${iconButton('shortcuts', 'Keyboard shortcuts', 'Keyboard')}
            <button type="button" class="toolbar-button" id="install" aria-label="Install app" title="Install app" hidden>${icon('ArrowDownToLine')}<span>Install</span></button>
          </div>
        </header>
        <div class="empty-state" id="empty-state">
          <img class="empty-icon" src="${logoUrl}" alt="" draggable="false">
          <h1>No media open</h1>
          <p>Drop videos, music, or images here to get started.</p>
          <div class="empty-actions">
            <button type="button" class="primary-button" id="initial-files">${icon('FolderOpen')}Open Files</button>
            <button type="button" class="toolbar-button" id="initial-streams">${icon('Link2')}Open Streams</button>
            <button type="button" class="toolbar-button" disabled>${icon('Tv')}Open IPTV <span class="coming-soon" aria-hidden="true">Soon</span></button>
          </div>
        </div>
        <div class="music-viewer" id="music-viewer" hidden>
          <div class="music-card" id="music-card">
            <img id="music-cover" class="music-cover" alt="Album artwork" hidden>
            <div class="music-copy">
              <div class="eyebrow">${icon('Music2')} NOW PLAYING</div>
              <h2 id="music-track"></h2>
              <dl class="music-tags">
                <div><dt>Artist</dt><dd id="music-artist"></dd></div>
                <div><dt>Album</dt><dd id="music-album"></dd></div>
              </dl>
            </div>
          </div>
        </div>
        <button class="hero-play" id="hero-play" type="button" aria-label="Play video" hidden>${icon('Play', true)}</button>
        <div class="stage-message" id="stage-message" role="status" hidden></div>
        <div class="drop-layer" hidden>${icon('FolderOpen')}<strong id="drop-title">Drop to open</strong><span>Videos, music, images, or subtitles</span></div>
        <div class="controls">
          <div class="seek-row" data-video-control>
            <input id="seek" type="range" min="0" max="1000" value="0" step="1" aria-label="Seek">
          </div>
          <div class="control-row">
            <div class="control-group">
              ${iconButton('play', 'Play', 'Play', 'data-video-control')}
              ${iconButton('previous-item', 'Previous item', 'SkipBack')}
              ${iconButton('next-item', 'Next item', 'SkipForward')}
              ${iconButton('back', 'Back 10 seconds', 'RotateCcw', 'data-skip data-video-control')}
              ${iconButton('forward', 'Forward 10 seconds', 'RotateCw', 'data-skip data-video-control')}
              <div class="volume-group" data-video-control>
                ${iconButton('mute', 'Mute', 'Volume2')}
                <input id="volume" type="range" min="0" max="1" value="1" step="0.01" aria-label="Volume">
              </div>
              <span class="time" data-video-control><span id="elapsed">0:00</span><span class="time-divider">/</span><span id="duration">0:00</span></span>
              <span class="image-position" id="image-position" aria-live="polite" hidden></span>
            </div>
            <div class="control-group right-controls">
              ${iconButton('audio', 'Audio tracks', 'Headphones', 'data-video-control aria-expanded="false" aria-controls="player-menu"')}
              ${iconButton('captions', 'Subtitles', 'Captions', 'data-video-control aria-expanded="false" aria-controls="player-menu"')}
              ${iconButton('settings', 'Playback settings', 'Settings2', 'data-video-control aria-expanded="false" aria-controls="player-menu"')}
              ${iconButton('pip', 'Picture in picture', 'PictureInPicture2', 'data-video-control')}
              <button type="button" class="toolbar-button" id="hdr" aria-label="HDR settings" aria-expanded="false" aria-controls="player-menu">HDR</button>
              ${iconButton('playlist', 'Playlist', 'ListVideo', 'aria-expanded="false" aria-controls="player-menu"')}
              ${iconButton('video-info', 'Video info', 'FileVideoCamera', 'aria-haspopup="dialog" aria-controls="video-info-dialog"')}
              ${iconButton('fullscreen', 'Enter fullscreen', 'Expand')}
            </div>
          </div>
        </div>
        <div class="player-menu" id="player-menu" role="region" aria-label="Playback options" hidden></div>
        <dialog id="video-info-dialog" class="dialog" aria-labelledby="video-info-title">
          <div class="dialog-header"><div><h2 id="video-info-title">Video info</h2><p id="video-info-name" class="video-info-name" hidden></p></div>${iconButton('close-video-info', 'Close video info', 'X', 'data-close')}</div>
          <dl class="video-details" id="video-details" hidden>
            ${videoInfoFields.map(([key, label]) => `<div><dt>${label}</dt><dd id="video-info-${key}"></dd></div>`).join('')}
          </dl>
          <p class="dialog-note video-info-note" id="video-info-note" role="status" hidden></p>
        </dialog>
        <dialog id="about-dialog" class="dialog" aria-labelledby="about-title">
          <div class="dialog-header">
            <div class="about-heading"><img src="${logoUrl}" alt=""><h2 id="about-title">Kahve Player</h2></div>
            ${iconButton('close-about', 'Close About Kahve', 'X', 'data-close')}
          </div>
          <p class="dialog-note">A fast Chrome-based player for video, photos, and music, built to make HDR playback on Linux easier.</p>
          <div class="about-links">
            <a href="https://github.com/arazgray/kahve-player" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="https://arazgray.com" target="_blank" rel="noopener noreferrer">Made by Araz Gray</a>
          </div>
        </dialog>
  </main>
  <input id="file-input" type="file" accept="video/*,audio/*,image/*,.mkv,.mov,.mp4,.m4v,.webm,.ogv,.avi,.ts" multiple hidden>
  <input id="folder-input" type="file" webkitdirectory multiple hidden>
  <input id="subtitle-input" type="file" accept=".srt,.vtt,text/vtt" hidden>
  <div class="toast" id="toast" role="status" hidden></div>

  <dialog id="stream-dialog" class="dialog" aria-labelledby="stream-title">
    <div class="dialog-header"><div><div class="eyebrow"><span></span> VIDEO SOURCE</div><h2 id="stream-title">Open a stream</h2></div>${iconButton('close-stream', 'Close stream dialog', 'X', 'data-close')}</div>
    <form id="stream-form">
      <label for="stream-url">Video URL</label>
      <input id="stream-url" type="url" placeholder="https://example.com/video.m3u8" required autofocus>
      <label for="stream-format">Format</label>
      <select id="stream-format">
        <option value="auto">Detect from URL</option><option value="hls">HLS (.m3u8)</option><option value="dash">DASH (.mpd)</option><option value="direct">Direct video file</option>
      </select>
      <p class="dialog-note">For HLS and DASH, the stream host must allow browser access. This player does not configure DRM licenses.</p>
      <p class="form-error" id="stream-error" role="alert" hidden></p>
      <div class="dialog-actions"><button type="submit" class="primary-button">Open stream ${icon('ChevronRight')}</button></div>
    </form>
  </dialog>

  <dialog id="shortcut-dialog" class="dialog" aria-labelledby="shortcut-title">
    <div class="dialog-header"><div><div class="eyebrow"><span></span> QUICK CONTROLS</div><h2 id="shortcut-title">Keyboard shortcuts</h2></div>${iconButton('close-shortcuts', 'Close shortcuts', 'X', 'data-close')}</div>
    <dl class="shortcut-list">
      <div><dt>Play / pause</dt><dd><kbd>Space</kbd> <kbd>K</kbd></dd></div>
      <div><dt>Seek video / switch images</dt><dd><kbd>←</kbd> <kbd>→</kbd></dd></div>
      <div><dt>Previous / next playlist item</dt><dd><kbd>[</kbd> <kbd>]</kbd></dd></div>
      <div><dt>Change volume</dt><dd><kbd>↑</kbd> <kbd>↓</kbd></dd></div>
      <div><dt>Mute / unmute</dt><dd><kbd>M</kbd></dd></div>
      <div><dt>Toggle subtitles</dt><dd><kbd>C</kbd></dd></div>
      <div><dt>Toggle fullscreen</dt><dd><kbd>Enter</kbd> <kbd>F</kbd></dd></div>
      <div><dt>Open files</dt><dd><kbd>O</kbd></dd></div>
      <div><dt>Show shortcuts</dt><dd><kbd>?</kbd></dd></div>
    </dl>
  </dialog>

  <dialog id="install-dialog" class="dialog" aria-labelledby="install-title">
    <div class="dialog-header"><div><div class="eyebrow"><span></span> MAKE IT YOURS</div><h2 id="install-title">Install Kahve</h2></div>${iconButton('close-install', 'Close install help', 'X', 'data-close')}</div>
    <p class="dialog-note">In desktop Chrome, look for the install icon in the address bar or open the Chrome menu and choose <strong>Cast, save and share → Install page as app</strong>. The app opens in its own window and can play local files offline after the app has loaded once.</p>
  </dialog>`;

const $ = (id) => document.getElementById(id);
const video = $('video');
const stage = $('stage');
const seek = $('seek');
const menu = $('player-menu');
const streamDialog = $('stream-dialog');
const infoDialog = $('video-info-dialog');
const imageViewport = $('image-viewer');
const imageViewer = createImageViewer(imageViewport);
let imageSize = null;
let playlist = [];
let playlistIndex = -1;
let appendPickedFiles = false;
let folderRequest = null;
let libraryView = null;
let source = null;
let musicMode = false;
let musicProbe;
let musicAttempted = false;
let musicArtworkUrl = '';
let streamPlayer = null;
let inspection = null;
let inspected = null;
let inspectionFailed = false;
let rangeSelection = 'auto';
let loading = false;
let sourceRequest = 0;
let loadQueue = Promise.resolve();
let failed = false;
let hasPlayed = false;
let openMenu = '';
let externalTracks = [];
let activeExternal = null;
let localUrl = '';
let toastTimer;
let controlsTimer;
let installPrompt;
let previousVolume = 1;
let dragDepth = 0;
let isSeeking = false;
const mediaEvents = ['loadedmetadata', 'durationchange', 'timeupdate', 'progress', 'play', 'pause', 'ended', 'volumechange', 'ratechange'];

function fill(input, fraction) {
  input.style.setProperty('--fill', `${Math.min(1, Math.max(0, fraction || 0)) * 100}%`);
}

function setIcon(id, name, label) {
  const button = $(id);
  if (button.getAttribute('aria-label') === label) return;
  button.innerHTML = icon(name, name === 'Play' || name === 'Pause');
  button.setAttribute('aria-label', label);
  button.title = label;
}

function timeLabel(time) {
  if (!Number.isFinite(time) || time < 0) return '0:00';
  const total = Math.floor(time);
  const second = String(total % 60).padStart(2, '0');
  const minute = Math.floor(total / 60) % 60;
  const hour = Math.floor(total / 3600);
  return hour ? `${hour}:${String(minute).padStart(2, '0')}:${second}` : `${minute}:${second}`;
}

function codecLabel(value) {
  if (!value) return '';
  const codecFamily = {
    avc: 'H.264 / AVC', avc1: 'H.264 / AVC', avc3: 'H.264 / AVC', hevc: 'H.265 / HEVC', hvc1: 'H.265 / HEVC', hev1: 'H.265 / HEVC',
    vp9: 'VP9', vp09: 'VP9', vp8: 'VP8', vp08: 'VP8', av1: 'AV1', av01: 'AV1', opus: 'Opus', aac: 'AAC',
    'ac-3': 'Dolby Digital', 'ec-3': 'Dolby Digital Plus',
  };
  const id = value.toLowerCase();
  const label = id.startsWith('mp4a.40.') ? 'AAC' : codecFamily[id.split('.')[0]];
  return label && id !== label.toLowerCase() ? `${label} (${value})` : label || value;
}

function renderVideoInfo() {
  if (!infoDialog.open) return;
  const filename = $('video-info-name');
  const note = $('video-info-note');
  filename.hidden = !source;
  $('video-details').hidden = !source;
  if (!source) {
    note.textContent = 'Open a video to see its format, codecs, frame rate, and resolution, or an image to see its format and size.';
    note.hidden = false;
    return;
  }
  filename.textContent = source.title;
  filename.title = source.title;

  const image = source.kind === 'image';
  const adaptive = source.kind === 'hls' || source.kind === 'dash';
  const metadata = adaptive ? streamPlayer?.getMediaInfo() ?? {} : inspected ?? {};
  const streamFormat = { hls: 'HLS', dash: 'DASH' }[source.kind];
  const width = image ? imageSize?.width : adaptive ? video.videoWidth || metadata.width : metadata.width || video.videoWidth;
  const height = image ? imageSize?.height : adaptive ? video.videoHeight || metadata.height : metadata.height || video.videoHeight;
  const fps = metadata.frameRate;
  const details = {
    format: image ? imageFormat(source.file) : metadata.format || streamFormat,
    videoCodec: codecLabel(metadata.videoCodec),
    audioCodec: codecLabel(metadata.audioCodec),
    frameRate: Number.isFinite(fps) && fps > 0 ? `${new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(fps)} fps${metadata.variableRate ? ' (variable)' : metadata.estimatedRate ? ' (estimated)' : ''}` : '',
    resolution: width > 0 && height > 0 ? `${width} × ${height}` : '',
    duration: streamPlayer?.isLive() ? 'Live' : Number.isFinite(video.duration) ? timeLabel(video.duration) : '',
  };
  for (const [key] of videoInfoFields) {
    const output = $(`video-info-${key}`);
    output.parentElement.hidden = (image && !['format', 'resolution'].includes(key))
      || (musicMode && !['format', 'audioCodec', 'duration'].includes(key));
    output.textContent = details[key] || 'Not reported';
    output.classList.toggle('not-reported', !details[key]);
  }
  const status = inspection || musicProbe ? 'Reading media details…'
    : loading ? 'Waiting for the media to open…'
    : inspectionFailed && source.kind === 'direct' ? 'This server didn’t provide the file metadata to Kahve. Playback details are shown when available.'
    : inspectionFailed ? 'Kahve couldn’t read the file metadata. Playback details are shown when available.'
    : adaptive && !details.frameRate ? 'The stream doesn’t report a frame rate for this rendition.'
    : '';
  if (note.textContent !== status) note.textContent = status;
  note.hidden = !status;
}

async function readVideoInfo() {
  if (!infoDialog.open) return;
  if (!source || ['hls', 'dash', 'image'].includes(source.kind) || inspected || inspection || inspectionFailed || musicProbe) {
    renderVideoInfo();
    return;
  }
  const current = source;
  const controller = new AbortController();
  inspection = controller;
  renderVideoInfo();
  try {
    const { inspectMedia } = await import('./media-info.js');
    controller.signal.throwIfAborted();
    const metadata = await inspectMedia(current, controller.signal);
    if (inspection === controller) inspected = metadata;
  } catch {
    if (inspection === controller) inspectionFailed = true;
  } finally {
    if (inspection === controller) {
      inspection = null;
      renderVideoInfo();
    }
  }
}

function seekWindow() {
  if (streamPlayer?.isLive()) {
    const { start, end } = streamPlayer.seekRange();
    return { start, end, live: true };
  }
  if (video.duration === Infinity && video.seekable.length) {
    const index = video.seekable.length - 1;
    return { start: video.seekable.start(index), end: video.seekable.end(index), live: true };
  }
  return { start: 0, end: Number.isFinite(video.duration) ? video.duration : 0, live: false };
}

function updateControls() {
  const { start, end, live } = seekWindow();
  const span = end - start;
  const fraction = span > 0 ? Math.max(0, Math.min(1, (video.currentTime - start) / span)) : 0;
  if (!isSeeking) seek.value = Math.round(fraction * 1000);
  fill(seek, Number(seek.value) / 1000);
  seek.disabled = !span || failed;
  seek.setAttribute('aria-valuetext', live ? `${timeLabel(video.currentTime - start)} into the live window` : `${timeLabel(video.currentTime)} of ${timeLabel(end)}`);
  let buffered = 0;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= video.currentTime + 0.1) buffered = Math.max(buffered, video.buffered.end(i));
  }
  seek.style.setProperty('--buffer', `${span > 0 ? Math.min(1, Math.max(0, (buffered - start) / span)) * 100 : 0}%`);
  $('elapsed').textContent = timeLabel(live ? video.currentTime - start : video.currentTime);
  $('duration').textContent = live ? 'LIVE' : timeLabel(end);
  $('duration').classList.toggle('live', live);
  setIcon('play', video.paused ? 'Play' : 'Pause', video.paused ? 'Play' : 'Pause');
  setIcon('mute', video.muted || !video.volume ? 'VolumeX' : 'Volume2', video.muted || !video.volume ? 'Unmute' : 'Mute');
  $('volume').value = video.muted ? 0 : video.volume;
  fill($('volume'), Number($('volume').value));
  $('hero-play').hidden = !source || source.kind === 'image' || !video.paused || hasPlayed && !video.ended || loading || failed;
  $('hero-play').setAttribute('aria-label', video.ended ? 'Replay video' : 'Play video');
  $('play').disabled = !source || source.kind === 'image' || failed || loading;
  $('back').disabled = $('forward').disabled = !span || failed;
  $('pip').disabled = !video.videoWidth || !document.pictureInPictureEnabled;
  stage.classList.toggle('playing', !video.paused);
}

function wakeControls() {
  stage.classList.remove('controls-hidden');
  clearTimeout(controlsTimer);
  if (!video.paused && !openMenu && !musicMode) {
    controlsTimer = setTimeout(() => {
      if (!stage.querySelector(':focus-visible') && !stage.querySelector('.controls:hover, .stage-top:hover')) {
        stage.classList.add('controls-hidden');
      }
    }, 2600);
  }
}

function message(text = '', type = '') {
  const status = $('stage-message');
  status.textContent = text;
  status.dataset.type = type;
  status.hidden = !text;
}

function notify(text) {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
}

function playbackError(text) {
  failed = true;
  loading = false;
  message(text, 'error');
  wakeControls();
  updateControls();
  renderVideoInfo();
}

async function togglePlay() {
  if (!source || source.kind === 'image' || loading || failed) return;
  if (!video.paused) return video.pause();
  if (video.ended) video.currentTime = seekWindow().start;
  const request = sourceRequest;
  try {
    await video.play();
  } catch (error) {
    if (request !== sourceRequest) return;
    if (error.name === 'NotAllowedError') notify('Chrome blocked autoplay. Press Play to continue.');
    else if (error.name !== 'AbortError' && !failed) playbackError('Chrome couldn’t start this video. Try a different file or URL.');
  }
}

function skip(seconds) {
  const { start, end } = seekWindow();
  if (end > start && !failed) video.currentTime = Math.max(start, Math.min(end, video.currentTime + seconds));
  wakeControls();
}

function clearMusicCover() {
  const cover = $('music-cover');
  cover.hidden = true;
  cover.removeAttribute('src');
  if (musicArtworkUrl) URL.revokeObjectURL(musicArtworkUrl);
  musicArtworkUrl = '';
  $('music-card').classList.remove('has-cover');
}

function showMusicTags(tags = {}) {
  $('music-track').textContent = tags.track || source?.title.replace(/\.[^.]+$/, '') || 'Unknown track';
  $('music-artist').textContent = tags.artist || 'Unknown artist';
  $('music-album').textContent = tags.album || 'Unknown album';
  updateMediaSession(tags);
  if (!tags.cover) return;
  clearMusicCover();
  const cover = $('music-cover');
  const url = URL.createObjectURL(tags.cover);
  musicArtworkUrl = url;
  cover.src = url;
  void cover.decode().then(() => {
    if (url !== musicArtworkUrl) return;
    cover.hidden = false;
    $('music-card').classList.add('has-cover');
  }).catch(() => {
    if (url === musicArtworkUrl) clearMusicCover();
  });
}

function updateMediaSession(tags = {}) {
  if (!navigator.mediaSession || typeof MediaMetadata === 'undefined') return;
  navigator.mediaSession.metadata = source && source.kind !== 'image'
    ? new MediaMetadata({ title: tags.track || source.title, artist: tags.artist || '', album: tags.album || '' })
    : null;
}

function resetMusic() {
  musicMode = false;
  musicProbe?.abort();
  musicProbe = undefined;
  musicAttempted = false;
  clearMusicCover();
}

async function readMusicTags() {
  if (musicAttempted || !source || (!source.file && source.kind !== 'direct')) return;
  musicAttempted = true;
  const current = source;
  const controller = new AbortController();
  musicProbe = controller;
  try {
    const { inspectMedia } = await import('./media-info.js');
    controller.signal.throwIfAborted();
    const details = await inspectMedia(current, controller.signal, { includeCover: true });
    if (musicProbe !== controller) return;
    const { music, ...metadata } = details;
    inspected ??= metadata;
    showMusicTags(music);
  } catch {
    // The player keeps its filename and unknown-tag fallbacks if artwork or tags can't be read.
  } finally {
    if (musicProbe === controller) {
      musicProbe = undefined;
      renderVideoInfo();
    }
  }
}

function syncMediaPresentation() {
  const image = source?.kind === 'image';
  stage.classList.toggle('audio-only', musicMode);
  $('music-viewer').hidden = !musicMode;
  $('hdr').hidden = image || musicMode;
  $('video-info-title').textContent = image ? 'Image info' : musicMode ? 'Audio info' : 'Video info';
  setIcon('video-info', 'FileVideoCamera', $('video-info-title').textContent);
  const label = { image: 'IMAGE', local: musicMode ? 'AUDIO FILE' : 'LOCAL FILE', direct: 'VIDEO LINK', hls: 'HLS STREAM', dash: 'DASH STREAM' };
  $('source-tag').textContent = label[source?.kind] ?? 'NO MEDIA';
}

function refreshMusicMode() {
  if (!source || source.kind === 'image' || loading || video.readyState < 1 || failed) return;
  const audio = video.videoWidth === 0 && video.videoHeight === 0;
  if (audio === musicMode) return;
  if (audio) {
    musicMode = true;
    showMusicTags();
    void readMusicTags();
  } else {
    resetMusic();
  }
  syncMediaPresentation();
  wakeControls();
  renderVideoInfo();
}

function updateSourceInfo() {
  const image = source?.kind === 'image';
  const title = $('media-title');
  title.textContent = source?.title ?? '';
  title.title = title.textContent;
  title.hidden = !source;
  $('empty-state').hidden = Boolean(source);
  updateMediaSession();
  stage.classList.toggle('viewing-image', image);
  imageViewport.hidden = !image;
  if (source?.audioHint) {
    musicMode = true;
    showMusicTags();
    void readMusicTags();
  }
  syncMediaPresentation();
}

function clearExternalTracks() {
  for (const { element, url } of externalTracks) {
    element.track.mode = 'disabled';
    element.remove();
    URL.revokeObjectURL(url);
  }
  externalTracks = [];
  activeExternal = null;
  $('captions').classList.remove('selected');
}

function loadSource(next, { autoplay = false } = {}) {
  const request = ++sourceRequest;
  const previous = streamPlayer;
  // Destroy immediately to interrupt an in-flight manifest load while serializing new attachments.
  const stop = previous?.destroy().catch(() => {});
  streamPlayer = null;
  imageViewer.cancelPending();
  if (next?.kind !== 'image') imageViewer.clear();
  imageSize = null;
  video.pause();
  if (openMenu !== 'playlist') closeMenu();
  source = next;
  resetMusic();
  inspection?.abort();
  inspection = null;
  inspected = null;
  inspectionFailed = false;
  rangeSelection = 'auto';
  failed = false;
  loading = Boolean(next);
  hasPlayed = false;
  $('hdr').classList.remove('selected');
  updateSourceInfo();
  updatePlaylistUI();
  message(next ? `Opening ${next.kind === 'image' ? 'image' : next.audioHint ? 'audio' : 'video'}…` : '', 'loading');
  wakeControls();
  updateControls();
  void readVideoInfo();

  loadQueue = loadQueue.catch(() => {}).then(async () => {
    await stop;
    if (request !== sourceRequest) return;
    clearExternalTracks();
    video.removeAttribute('src');
    video.load();
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = next?.kind === 'local' ? URL.createObjectURL(next.file) : '';
    if (!next) return;
    try {
      if (next.kind === 'image') {
        if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {});
        const size = await imageViewer.show(next.file);
        if (request !== sourceRequest || !size) return;
        imageSize = size;
      } else if (next.kind === 'hls' || next.kind === 'dash') {
        const { default: engine } = next.kind === 'hls'
          ? await import('hls.js')
          : await import('shaka-player/dist/shaka-player.dash.js');
        if (request !== sourceRequest) return;
        const createPlayer = next.kind === 'hls' ? makeHlsPlayer : makeDashPlayer;
        const player = createPlayer(engine, video, {
          onError: (error) => { if (request === sourceRequest) playbackError(error); },
          onTracks: () => {
            if (request !== sourceRequest) return;
            updateControls();
            syncCaptions();
            renderVideoInfo();
            if (openMenu && openMenu !== 'playlist') renderMenu(true);
          },
        });
        streamPlayer = player;
        await player.load(next.url);
      } else {
        video.src = localUrl || next.url;
      }
      if (request !== sourceRequest || failed) return;
      loading = false;
      message();
      refreshMusicMode();
      updateControls();
      renderVideoInfo();
      if (next.kind !== 'image') {
        if (autoplay) void togglePlay();
        for (const subtitle of next.subtitles ?? []) {
          if (request !== sourceRequest) break;
          await addSubtitles(subtitle, { remember: false, announce: false });
        }
      }
    } catch (error) {
      if (request !== sourceRequest) return;
      if (next.kind === 'image') {
        imageViewer.clear();
        playbackError('Chrome couldn’t open this image. Try a PNG, JPEG, or WebP file.');
      } else if (typeof error.code === 'number') {
        playbackError(`Couldn’t open the stream (code ${error.code}). Check the URL, browser access (CORS), and codec support.`);
      } else {
        playbackError(error.message || 'Couldn’t open this video.');
      }
    }
  });
  return loadQueue;
}

function nativeTextTracks() {
  if (streamPlayer) return []; // Adaptive engines expose and manage their own text tracks.
  return Array.from(video.textTracks).filter((track) =>
    ['captions', 'subtitles'].includes(track.kind) && !externalTracks.some(({ element }) => element.track === track));
}

function streamTextTracks() {
  return streamPlayer?.getTextTracks() ?? [];
}

function syncCaptions() {
  const active = activeExternal || nativeTextTracks().some((track) => track.mode === 'showing')
    || streamTextTracks().some((track) => track.active);
  $('captions').classList.toggle('selected', Boolean(active));
}

function selectSubtitle(kind, track) {
  if (streamPlayer) streamPlayer.selectTextTrack(kind === 'stream' ? track : null);
  for (const item of nativeTextTracks()) item.mode = kind === 'native' && item === track ? 'showing' : 'disabled';
  for (const item of externalTracks) item.element.track.mode = kind === 'external' && item === track ? 'showing' : 'disabled';
  activeExternal = kind === 'external' ? track : null;
  syncCaptions();
}

async function addSubtitles(file, { remember = true, announce = true } = {}) {
  if (!source || source.kind === 'image') return notify('Open a video before adding subtitles.');
  if (loading) return notify('Wait for the video to finish opening, then add subtitles.');
  const request = sourceRequest;
  try {
    const vtt = asWebVtt(await file.text(), file.name);
    if (request !== sourceRequest) return;
    const url = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    const element = document.createElement('track');
    element.kind = 'subtitles';
    element.label = file.name.replace(/\.[^.]+$/, '');
    element.src = url;
    const item = { element, url };
    element.addEventListener('error', () => notify('Chrome couldn’t read this subtitle file.'), { once: true });
    video.append(element);
    externalTracks.push(item);
    if (remember) (source.subtitles ??= []).push(file);
    selectSubtitle('external', item);
    if (openMenu === 'captions') renderMenu(true);
    if (announce) notify('Subtitles added.');
  } catch (error) {
    if (request === sourceRequest && announce) notify(error.message);
  }
}

function trackName(track, fallback) {
  const language = track.language;
  if (track.label) return track.label;
  if (!language || language === 'und') return fallback;
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(language); }
  catch { return language; }
}

function menuNote(text) {
  const note = document.createElement('p');
  note.className = 'menu-note';
  note.textContent = text;
  menu.append(note);
}

function menuHeading(text) {
  const heading = document.createElement('h3');
  heading.textContent = text;
  menu.append(heading);
}

function menuItem(label, action, selected = null, detail = '', disabled = false) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'menu-item';
  item.disabled = disabled;
  if (selected !== null) item.setAttribute('aria-pressed', String(Boolean(selected)));
  const name = document.createElement('span');
  name.textContent = label;
  item.append(name);
  if (detail) {
    const info = document.createElement('small');
    info.textContent = detail;
    item.append(info);
  }
  if (selected) item.insertAdjacentHTML('beforeend', icon('Check'));
  item.addEventListener('click', () => {
    action();
    if (openMenu) renderMenu(true);
  });
  menu.append(item);
}

function videoRange(track) {
  const value = track?.hdr?.toUpperCase();
  if (value === 'SDR') return 'sdr';
  if (value && /^(HDR|PQ|HLG|DOLBY|DV)/.test(value)) return 'hdr';
  return null;
}

function applyRange(mode, track) {
  rangeSelection = mode;
  streamPlayer.selectQuality(track);
  $('hdr').classList.toggle('selected', mode !== 'auto');
}

function renderHdrMenu() {
  menuHeading('Dynamic range');
  if (!source) {
    menuNote('Open an HLS or DASH stream to choose an HDR or SDR rendition when available.');
  } else if (!streamPlayer && !['hls', 'dash'].includes(source.kind)) {
    menuNote('Chrome manages HDR for local files and direct video links. Kahve can’t switch HDR on or off for those sources.');
  } else if (loading || failed || !streamPlayer) {
    menuNote(loading ? 'Dynamic range options appear when the stream is ready.' : 'Dynamic range options are unavailable for this stream.');
  } else {
    const qualities = streamPlayer.getQualities();
    const current = qualities.find((track) => track.active);
    const find = (range) => qualities.filter((track) => videoRange(track) === range)
      .sort((a, b) => Math.abs(a.height - (current?.height ?? a.height))
        - Math.abs(b.height - (current?.height ?? b.height)) || b.bandwidth - a.bandwidth)[0];
    const hdr = find('hdr');
    const sdr = find('sdr');
    menuItem('Automatic', () => applyRange('auto', null), rangeSelection === 'auto' && streamPlayer.isAutoQuality());
    menuItem('Prefer HDR', () => applyRange('hdr', hdr), rangeSelection === 'hdr', hdr ? '' : 'Unavailable', !hdr);
    menuItem('Prefer SDR', () => applyRange('sdr', sdr), rangeSelection === 'sdr', sdr ? '' : 'Unavailable', !sdr);
    menuNote('Selecting HDR or SDR locks a matching rendition. Automatic restores adaptive quality.');
  }
  menuNote('HDR output depends on Chrome, your system, and your display. This doesn’t change the system HDR setting.');
}

function playlistAction(label, action, attributes = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toolbar-button';
  button.textContent = label;
  for (const [key, value] of Object.entries(attributes)) button.setAttribute(key, value);
  button.addEventListener('click', action);
  return button;
}

function showQueue(focus = '.playlist-load') {
  libraryView = null;
  renderMenu();
  menu.querySelector(focus)?.focus({ preventScroll: true });
}

function showSavePlaylist() {
  if (!playlist.length) return;
  libraryView = { mode: 'save', name: playlist[0].title.replace(/\.[^.]+$/, '').slice(0, 100), status: '' };
  renderMenu();
  const input = menu.querySelector('input');
  input.focus();
  input.select();
}

async function showSavedPlaylists() {
  const view = { mode: 'load', items: [], busy: true, status: 'Reading saved playlists…' };
  libraryView = view;
  renderMenu();
  menu.querySelector('.playlist-back')?.focus();
  try {
    view.items = await listSavedPlaylists();
    view.status = view.items.length ? '' : 'No saved playlists in this browser yet.';
  } catch {
    view.status = 'Saved playlists are unavailable in this browser.';
  } finally {
    view.busy = false;
    if (libraryView === view) renderMenu(true);
  }
}

function renderPlaylistLibrary(view) {
  const header = document.createElement('div');
  header.className = 'playlist-library-header';
  header.append(playlistAction('Back', () => {
    if (view.mode === 'delete') void showSavedPlaylists();
    else showQueue(view.mode === 'save' ? '.playlist-save' : '.playlist-load');
  }, { class: 'toolbar-button playlist-back' }));
  const heading = document.createElement('h3');
  heading.textContent = { save: 'Save playlist', load: 'Load playlist', delete: 'Remove saved playlist' }[view.mode];
  header.append(heading);
  menu.append(header);

  if (view.mode === 'save') {
    const form = document.createElement('form');
    form.className = 'playlist-save-form';
    form.innerHTML = `<label for="playlist-name">Playlist name</label><input id="playlist-name" required maxlength="100" autocomplete="off">
      <button type="submit" class="primary-button">Save playlist</button>`;
    const input = form.querySelector('input');
    input.value = view.name;
    input.disabled = form.querySelector('button').disabled = Boolean(view.busy);
    input.addEventListener('input', () => { view.name = input.value; input.setCustomValidity(''); });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) {
        input.setCustomValidity('Enter a playlist name.');
        input.reportValidity();
        return;
      }
      const entries = playlist.map((item) => ({ ...item, subtitles: item.subtitles?.slice() }));
      const activeIndex = playlistIndex;
      view.busy = true;
      view.status = 'Saving playlist…';
      renderMenu();
      try {
        await savePlaylist(name, entries, activeIndex);
        if (libraryView === view) {
          showQueue('.playlist-save');
          notify(`Saved “${name}” in this browser.`);
        }
      } catch (error) {
        view.busy = false;
        view.status = error?.name === 'QuotaExceededError'
          ? 'Not enough browser storage for these files. Try a smaller playlist.'
          : 'Couldn’t save this playlist. Check that browser storage is available.';
        if (libraryView === view) {
          renderMenu();
          menu.querySelector('input')?.focus();
        }
      }
    });
    menu.append(form);
    menuNote('The playlist and copies of local files are saved in this browser, not uploaded.');
  } else if (view.mode === 'delete') {
    menuNote(`Remove “${view.item.name}” from this browser’s saved playlists? This won’t delete your original files.`);
    const actions = document.createElement('div');
    actions.className = 'playlist-actions';
    const remove = playlistAction('Remove saved playlist', async () => {
      view.busy = true;
      renderMenu();
      try {
        await deleteSavedPlaylist(view.item.id);
        if (libraryView === view) void showSavedPlaylists();
      } catch {
        view.busy = false;
        view.status = 'Couldn’t remove the saved playlist.';
        if (libraryView === view) renderMenu();
      }
    });
    remove.disabled = Boolean(view.busy);
    actions.append(remove, playlistAction('Cancel', showSavedPlaylists));
    menu.append(actions);
  } else if (view.items.length) {
    const list = document.createElement('ul');
    list.className = 'playlist-items saved-playlists';
    for (const item of view.items) {
      const row = document.createElement('li');
      row.className = 'playlist-row';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'menu-item playlist-entry';
      open.innerHTML = `${icon('ListVideo')}<span></span><small></small>`;
      open.querySelector('span').textContent = item.name;
      open.querySelector('small').textContent = `${item.count} · ${new Date(item.savedAt).toLocaleDateString()}`;
      open.title = item.name;
      open.disabled = view.busy;
      open.addEventListener('click', async () => {
        view.busy = true;
        view.status = 'Loading playlist…';
        renderMenu();
        try {
          const saved = await loadSavedPlaylist(item.id);
          if (!saved?.entries?.length) throw new Error('Saved playlist is missing.');
          if (libraryView !== view) return;
          libraryView = null;
          setPlaylist(saved.entries, false, saved.activeIndex);
          menu.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
        } catch {
          view.busy = false;
          view.status = 'Couldn’t load this saved playlist.';
          if (libraryView === view) renderMenu();
        }
      });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button playlist-remove';
      remove.innerHTML = icon('X');
      remove.setAttribute('aria-label', `Remove saved playlist ${item.name}`);
      remove.disabled = view.busy;
      remove.addEventListener('click', () => {
        libraryView = { mode: 'delete', item };
        renderMenu();
        menu.querySelector('.playlist-back')?.focus();
      });
      row.append(open, remove);
      list.append(row);
    }
    menu.append(list);
  }

  if (view.status) {
    const status = document.createElement('p');
    status.className = 'menu-note';
    status.setAttribute('role', 'status');
    status.textContent = view.status;
    menu.append(status);
  }
}

function renderPlaylist() {
  if (libraryView) return renderPlaylistLibrary(libraryView);
  const heading = document.createElement('div');
  heading.className = 'playlist-heading';
  heading.innerHTML = '<h3>Playlist</h3><span></span>';
  heading.lastElementChild.textContent = `${playlist.length} ${playlist.length === 1 ? 'item' : 'items'}`;
  menu.append(heading);
  if (!playlist.length) {
    menuNote('Drop videos, music, or images here, or use Add files.');
  } else {
    const list = document.createElement('ol');
    list.className = 'playlist-items';
    playlist.forEach((entry, index) => {
      const row = document.createElement('li');
      row.className = 'playlist-row';
      const select = document.createElement('button');
      select.type = 'button';
      select.className = 'menu-item playlist-entry';
      select.title = entry.title;
      select.innerHTML = `${icon(entry.kind === 'image' ? 'Image' : entry.audioHint ? 'Music2' : 'Film')}<span></span>`;
      select.lastElementChild.textContent = entry.title;
      if (index === playlistIndex) {
        select.setAttribute('aria-current', 'true');
        select.insertAdjacentHTML('beforeend', icon('Check'));
      }
      select.addEventListener('click', () => playPlaylistItem(index));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button playlist-remove';
      remove.setAttribute('aria-label', `Remove ${entry.title}`);
      remove.title = 'Remove from playlist';
      remove.innerHTML = icon('X');
      remove.addEventListener('click', () => removePlaylistItem(index));
      row.append(select, remove);
      list.append(row);
    });
    menu.append(list);
  }
  const actions = document.createElement('div');
  actions.className = 'playlist-actions';
  const add = playlistAction('Add files…', () => pickFiles(true));
  add.insertAdjacentHTML('afterbegin', icon('Plus'));
  const save = playlistAction('Save', showSavePlaylist, { class: 'toolbar-button playlist-save', 'aria-label': 'Save playlist' });
  const load = playlistAction('Load', showSavedPlaylists, { class: 'toolbar-button playlist-load', 'aria-label': 'Load playlist' });
  const clear = playlistAction('Clear', () => setPlaylist([]), { class: 'toolbar-button playlist-clear', 'aria-label': 'Clear playlist' });
  save.disabled = clear.disabled = !playlist.length;
  actions.append(add, save, load, clear);
  menu.append(actions);
}

function renderMenu(restoreFocus = false) {
  if (!openMenu) return;
  const previous = [...menu.querySelectorAll('button')].indexOf(document.activeElement);
  const scroll = menu.querySelector('.playlist-items')?.scrollTop ?? 0;
  menu.replaceChildren();
  if (openMenu === 'open-source') {
    menuItem('Open files…', () => {
      closeMenu(true);
      pickFiles();
    }, null, 'O');
    menuItem('Add files to queue', () => {
      closeMenu(true);
      pickFiles(true);
    });
    menuItem('Open a stream…', () => {
      closeMenu(true);
      streamDialog.showModal();
    });
  } else if (openMenu === 'playlist') {
    renderPlaylist();
    const list = menu.querySelector('.playlist-items');
    if (list) {
      list.scrollTop = scroll;
      const current = list.querySelector('[aria-current]');
      if (current) {
        const bounds = list.getBoundingClientRect();
        const row = current.getBoundingClientRect();
        if (row.top < bounds.top) list.scrollTop -= bounds.top - row.top;
        if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom;
      }
    }
  } else if (openMenu === 'hdr') {
    renderHdrMenu();
  } else if (openMenu === 'audio') {
    menuHeading('Audio tracks');
    if (loading) menuNote('Tracks will appear when the video is ready.');
    else if (streamPlayer) {
      const tracks = streamPlayer.getAudioTracks();
      tracks.forEach((track, index) => menuItem(trackName(track, `Track ${index + 1}`),
        () => streamPlayer.selectAudioTrack(track), track.active, track.channelsCount === 6 ? '5.1' : ''));
      if (!tracks.length) menuNote('No selectable audio tracks in this stream.');
    } else {
      const tracks = Array.from(video.audioTracks ?? []);
      tracks.forEach((track, index) => menuItem(trackName(track, `Track ${index + 1}`), () => {
        for (const item of tracks) item.enabled = item === track;
      }, track.enabled));
      if (!tracks.length) menuNote('Chrome doesn’t expose separate audio tracks for this source. The default audio will play.');
    }
  } else if (openMenu === 'captions') {
    menuHeading('Subtitles');
    const native = nativeTextTracks();
    const stream = streamTextTracks();
    menuItem('Off', () => selectSubtitle('off'), !activeExternal && !native.some((track) => track.mode === 'showing')
      && !stream.some((track) => track.active));
    stream.forEach((track, index) => menuItem(trackName(track, `Stream track ${index + 1}`),
      () => selectSubtitle('stream', track), !activeExternal && track.active));
    native.forEach((track, index) => menuItem(trackName(track, `Embedded track ${index + 1}`),
      () => selectSubtitle('native', track), track.mode === 'showing'));
    externalTracks.forEach((track) => menuItem(track.element.label, () => selectSubtitle('external', track), track === activeExternal, 'File'));
    menuItem('Add a subtitle file…', () => $('subtitle-input').click());
  } else {
    menuHeading('Playback speed');
    for (const speed of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
      menuItem(speed === 1 ? 'Normal' : `${speed}×`, () => { video.playbackRate = speed; }, speed === video.playbackRate);
    }
    const tracks = streamPlayer?.getQualities() ?? [];
    if (new Set(tracks.filter((track) => track.height).map((track) => `${track.height}/${track.hdr ?? 'SDR'}`)).size > 1) {
      menuHeading('Stream quality');
      const auto = streamPlayer.isAutoQuality();
      const current = tracks.find((track) => track.active);
      const options = new Map();
      for (const track of tracks.filter((item) => item.height)) {
        const label = `${track.height}p${track.hdr && track.hdr !== 'SDR' ? ` · ${track.hdr}` : ''}`;
        const previous = options.get(label);
        if (!previous || track.active || (!previous.active && track.bandwidth > previous.bandwidth)) options.set(label, track);
      }
      menuItem('Auto', () => applyRange('auto', null), auto, auto && current?.height ? `${current.height}p` : '');
      [...options].sort((a, b) => b[1].height - a[1].height).forEach(([label, track]) =>
        menuItem(label, () => applyRange('auto', track), !auto && track.active));
    }
  }
  if (restoreFocus && previous >= 0) {
    const options = menu.querySelectorAll('button');
    const target = options[previous];
    (target && !target.disabled ? target : menu.querySelector('button:not(:disabled)'))?.focus({ preventScroll: true });
  }
}

function closeMenu(focus = false) {
  if (!openMenu) return;
  const trigger = $(openMenu);
  openMenu = '';
  libraryView = null;
  trigger.setAttribute('aria-expanded', 'false');
  menu.hidden = true;
  if (focus) trigger.focus();
  wakeControls();
}

function toggleMenu(id, event) {
  if (openMenu === id) return closeMenu(true);
  closeMenu();
  openMenu = id;
  $(id).setAttribute('aria-expanded', 'true');
  menu.dataset.position = id === 'open-source' ? 'top-left' : id === 'playlist' ? 'playlist' : 'bottom';
  menu.setAttribute('aria-label', id === 'playlist' ? 'Playlist' : 'Playback options');
  menu.hidden = false;
  renderMenu();
  if (event.detail === 0) (menu.querySelector('[aria-current="true"]') ?? menu.querySelector('button'))?.focus();
  wakeControls();
}

function toggleCaptions() {
  if (source?.kind === 'image') return;
  const native = nativeTextTracks();
  const stream = streamTextTracks();
  if (activeExternal || stream.some((track) => track.active) || native.some((track) => track.mode === 'showing')) selectSubtitle('off');
  else if (externalTracks.length) selectSubtitle('external', externalTracks.at(-1));
  else if (stream.length) selectSubtitle('stream', stream[0]);
  else if (native.length) selectSubtitle('native', native[0]);
  else notify('No subtitles available. You can add an SRT or VTT file.');
  if (openMenu === 'captions') renderMenu(true);
}

function updatePlaylistUI() {
  const browseFolder = isStandaloneImage();
  const waitForFolder = browseFolder && folderRequest?.entry === source;
  $('previous-item').disabled = browseFolder ? Boolean(waitForFolder) : playlistIndex <= 0;
  $('next-item').disabled = browseFolder ? Boolean(waitForFolder) : playlistIndex < 0 || playlistIndex >= playlist.length - 1;
  $('previous-item').title = browseFolder ? 'Choose a folder to find the previous image' : 'Previous item';
  $('next-item').title = browseFolder ? 'Choose a folder to find the next image' : 'Next item';
  $('playlist').classList.toggle('selected', playlist.length > 1);
  $('image-position').hidden = source?.kind !== 'image';
  $('image-position').textContent = browseFolder ? 'Use Previous or Next to browse the folder'
    : source?.kind === 'image' ? `Image ${playlistIndex + 1} of ${playlist.length}` : '';
  if (openMenu === 'playlist' && !libraryView) renderMenu(true);
}

function playPlaylistItem(index) {
  const entry = playlist[index];
  if (!entry || index === playlistIndex) return;
  playlistIndex = index;
  void loadSource(entry, { autoplay: true });
}

function movePlaylist(delta) {
  const index = playlistIndex + delta;
  if (playlist[index]) playPlaylistItem(index);
  else if (isStandaloneImage()) void browseImageFolder(delta);
}

function isStandaloneImage() {
  return playlist.length === 1 && source?.kind === 'image' && !!source.file;
}

function finishFolderRequest(request, files) {
  if (!request || folderRequest !== request) return;
  folderRequest = null;
  if (source !== request.entry || !isStandaloneImage() || !files) {
    updatePlaylistUI();
    return;
  }
  const entries = collectFolderImages(files);
  const activeIndex = entries.findIndex(({ file }) => file.name === request.entry.file.name && file.size === request.entry.file.size);
  if (activeIndex < 0) {
    updatePlaylistUI();
    notify('Choose the folder that contains the open image.');
    return;
  }
  if (entries.length < 2) {
    updatePlaylistUI();
    notify('There aren’t any other images in this folder.');
    return;
  }
  entries[activeIndex] = request.entry;
  playlist = entries;
  playlistIndex = activeIndex;
  const adjacent = activeIndex + request.delta;
  if (entries[adjacent]) playPlaylistItem(adjacent);
  else {
    updatePlaylistUI();
    notify(`You’re at the ${request.delta < 0 ? 'first' : 'last'} image in this folder.`);
  }
}

async function browseImageFolder(delta) {
  if (folderRequest || !isStandaloneImage()) return;
  const request = { entry: source, delta };
  folderRequest = request;
  // Keep the chooser invocation inside the click or keyboard gesture.
  if (!window.showDirectoryPicker) {
    $('folder-input').click();
    updatePlaylistUI();
    return;
  }
  try {
    const selection = window.showDirectoryPicker({ mode: 'read', id: 'kahve-image-folder', startIn: 'pictures' });
    updatePlaylistUI();
    const handle = await selection;
    const files = [];
    for await (const item of handle.values()) {
      if (source !== request.entry || !isStandaloneImage()) break;
      if (item.kind === 'file' && isImageFile(item)) {
        try { files.push(await item.getFile()); }
        catch { /* A file may have been removed while the folder was open. */ }
      }
    }
    finishFolderRequest(request, files);
  } catch (error) {
    if (error.name === 'SecurityError' && navigator.userActivation?.isActive) {
      $('folder-input').click();
      return;
    }
    finishFolderRequest(request);
    if (error.name !== 'AbortError' && source === request.entry) notify('Chrome couldn’t read that image folder.');
  }
}

function setPlaylist(entries, append = false, activeIndex = 0) {
  if (append && playlistIndex >= 0 && entries.length) {
    playlist = playlist.concat(entries);
    updatePlaylistUI();
    return true;
  }
  playlist = entries;
  playlistIndex = -1;
  if (playlist.length) playPlaylistItem(Math.max(0, Math.min(playlist.length - 1, activeIndex)));
  else void loadSource(null);
  return false;
}

function removePlaylistItem(index) {
  playlist.splice(index, 1);
  if (index === playlistIndex) {
    playlistIndex = -1;
    if (playlist.length) playPlaylistItem(Math.min(index, playlist.length - 1));
    else void loadSource(null);
  } else {
    if (index < playlistIndex) playlistIndex--;
    updatePlaylistUI();
  }
}

function pickFiles(append = false) {
  appendPickedFiles = append;
  $('file-input').click();
}

async function openFiles(files, append = false) {
  const { entries, unattached, skipped } = collectFiles(files);
  if (entries.length) {
    const added = setPlaylist(entries, append);
    const count = skipped + unattached.length;
    if (added) {
      notify(`Added ${entries.length} ${entries.length === 1 ? 'item' : 'items'} to the playlist.${count ? ` ${count} skipped.` : ''}`);
    } else if (count) {
      notify(`Skipped ${count} ${count === 1 ? 'file' : 'files'} that couldn’t be queued.`);
    }
  } else if (unattached.length) {
    const request = sourceRequest;
    for (const file of unattached) {
      if (request !== sourceRequest) break;
      await addSubtitles(file);
    }
  } else if (skipped) notify('No videos or images were found in those files.');
}

function toggleMute() {
  if (!video.volume) video.volume = previousVolume || 1;
  else video.muted = !video.muted;
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stage.requestFullscreen();
  } catch { notify('Fullscreen is not available in this window.'); }
}

for (const type of mediaEvents) video.addEventListener(type, updateControls);
for (const type of ['loadedmetadata', 'resize']) video.addEventListener(type, refreshMusicMode);
for (const type of ['loadedmetadata', 'resize', 'durationchange']) video.addEventListener(type, renderVideoInfo);
video.addEventListener('playing', () => {
  hasPlayed = true;
  wakeControls();
});
video.addEventListener('pause', wakeControls);
video.addEventListener('ended', () => {
  wakeControls();
  if (source && source.kind !== 'image' && !loading && video.ended) movePlaylist(1);
});
video.addEventListener('error', () => {
  if (!source || source.kind === 'image' || !video.src || streamPlayer || loading) return;
  playbackError(source.kind === 'local'
    ? 'Chrome couldn’t play this file. Try an MP4 with H.264/AAC, or a WebM.'
    : 'Chrome couldn’t open this video. Check the URL or try another format.');
});
video.textTracks.addEventListener('change', syncCaptions);
for (const type of ['addtrack', 'removetrack']) {
  video.textTracks.addEventListener(type, () => { if (openMenu === 'captions') renderMenu(true); });
}

for (const type of ['pointermove', 'pointerdown', 'focusin', 'focusout']) stage.addEventListener(type, wakeControls);
video.addEventListener('click', togglePlay);
video.addEventListener('dblclick', fullscreen);
imageViewport.addEventListener('dblclick', fullscreen);
$('hero-play').addEventListener('click', (event) => {
  if (event.detail === 0) $('play').focus({ preventScroll: true });
  togglePlay();
});
$('play').addEventListener('click', togglePlay);
$('previous-item').addEventListener('click', () => movePlaylist(-1));
$('next-item').addEventListener('click', () => movePlaylist(1));
$('back').addEventListener('click', () => skip(-10));
$('forward').addEventListener('click', () => skip(10));
$('mute').addEventListener('click', toggleMute);
$('volume').addEventListener('input', (event) => {
  video.muted = false;
  video.volume = Number(event.target.value);
  if (video.volume) previousVolume = video.volume;
});
seek.addEventListener('pointerdown', () => { isSeeking = true; });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) {
  seek.addEventListener(type, () => { isSeeking = false; updateControls(); });
}
seek.addEventListener('input', () => {
  const { start, end } = seekWindow();
  if (end > start) video.currentTime = start + (end - start) * Number(seek.value) / 1000;
  updateControls();
});
$('fullscreen').addEventListener('click', fullscreen);
document.addEventListener('fullscreenchange', () => {
  const full = document.fullscreenElement === stage;
  setIcon('fullscreen', full ? 'Minimize' : 'Expand', full ? 'Exit fullscreen' : 'Enter fullscreen');
});
$('pip').addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
  } catch { notify('Picture in picture is not available for this video.'); }
});
for (const id of ['open-source', 'hdr', 'playlist', 'audio', 'captions', 'settings']) {
  $(id).addEventListener('click', (event) => toggleMenu(id, event));
}
document.addEventListener('pointerdown', (event) => {
  if (openMenu === 'playlist' && event.target.closest('.controls')) return;
  if (openMenu && !menu.contains(event.target) && !$(openMenu).contains(event.target)) closeMenu();
});

$('file-input').addEventListener('change', (event) => {
  void openFiles(event.target.files, appendPickedFiles);
  event.target.value = '';
});
$('folder-input').addEventListener('change', (event) => {
  finishFolderRequest(folderRequest, event.target.files);
  event.target.value = '';
});
$('folder-input').addEventListener('cancel', () => finishFolderRequest(folderRequest));
$('initial-files').addEventListener('click', () => pickFiles());
$('initial-streams').addEventListener('click', () => streamDialog.showModal());
$('subtitle-input').addEventListener('change', (event) => {
  if (event.target.files[0]) void addSubtitles(event.target.files[0]);
  event.target.value = '';
});

const dropLayer = stage.querySelector('.drop-layer');
function shouldAppendDrop() {
  return !source || source.kind === 'image' || video.paused || video.ended;
}

function showDrop(visible) {
  if (visible) {
    $('drop-title').textContent = !shouldAppendDrop() ? 'Drop to play now'
      : playlist.length ? 'Drop to add to playlist' : 'Drop to open';
  }
  dropLayer.hidden = !visible;
  if (visible) wakeControls();
}
window.addEventListener('dragenter', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  dragDepth++;
  showDrop(true);
});
window.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) showDrop(false);
});
window.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  dragDepth = 0;
  showDrop(false);
  void openFiles(event.dataTransfer.files, shouldAppendDrop());
});

$('stream-url').addEventListener('input', () => { $('stream-error').hidden = true; });
$('stream-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const error = $('stream-error');
  try {
    const url = new URL($('stream-url').value.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP or HTTPS video URL without a username or password.');
    if (location.protocol === 'https:' && url.protocol === 'http:') throw new Error('Use an HTTPS video URL when Kahve is opened over HTTPS.');
    const format = $('stream-format').value;
    const kind = format === 'auto' ? (/\.m3u8$/i.test(url.pathname) ? 'hls' : /\.mpd$/i.test(url.pathname) ? 'dash' : 'direct') : format;
    let title = url.pathname.split('/').filter(Boolean).at(-1) || url.hostname;
    try { title = decodeURIComponent(title); } catch { /* keep the encoded name */ }
    streamDialog.close();
    setPlaylist([{ kind, url: url.href, title }]);
  } catch (failure) {
    error.textContent = failure.message;
    error.hidden = false;
  }
});

$('shortcuts').addEventListener('click', () => $('shortcut-dialog').showModal());
$('about').addEventListener('click', () => {
  closeMenu();
  $('about-dialog').showModal();
});
$('video-info').addEventListener('click', () => {
  closeMenu();
  infoDialog.showModal();
  void readVideoInfo();
});
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => {
  if (event.target === dialog) {
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
  }
}));

const installedMode = matchMedia('(display-mode: standalone), (display-mode: window-controls-overlay), (display-mode: minimal-ui), (display-mode: tabbed)');
const windowControls = navigator.windowControlsOverlay;
let installedHere = false;

function syncWindowChrome() {
  const rect = windowControls?.visible && !document.fullscreenElement
    ? windowControls.getTitlebarAreaRect() : null;
  stage.classList.toggle('window-overlay', Boolean(rect));
  stage.classList.toggle('compact-window-overlay', Boolean(rect && rect.width < 290));
  stage.classList.toggle('narrow-window-overlay', Boolean(rect && rect.width < 210));
  if (rect) {
    for (const key of ['x', 'y', 'width', 'height']) {
      stage.style.setProperty(`--titlebar-${key}`, `${rect[key]}px`);
    }
  }
  $('install').hidden = !installPrompt || installedHere || installedMode.matches
    || Boolean(rect || document.fullscreenElement);
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  syncWindowChrome();
});
installedMode.addEventListener('change', syncWindowChrome);
windowControls?.addEventListener('geometrychange', syncWindowChrome);
document.addEventListener('fullscreenchange', syncWindowChrome);
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installedHere = true;
  syncWindowChrome();
});
$('install').addEventListener('click', async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = null;
  syncWindowChrome();
  try { await prompt.prompt(); } catch { $('install-dialog').showModal(); }
});
syncWindowChrome();

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openMenu) {
    event.preventDefault();
    return closeMenu(true);
  }
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')
    || event.target.closest('input, select, textarea, [contenteditable]')) return;
  if ((event.key === ' ' || event.key === 'Enter') && event.target.closest('button, a')) return;
  const navigate = (delta) => source?.kind === 'image' ? movePlaylist(delta) : skip(delta * 10);
  const actions = {
    ' ': togglePlay, k: togglePlay, ArrowLeft: () => navigate(-1), ArrowRight: () => navigate(1),
    '[': () => movePlaylist(-1), ']': () => movePlaylist(1),
    ArrowUp: () => changeVolume(0.1), ArrowDown: () => changeVolume(-0.1),
    m: toggleMute, c: toggleCaptions, f: fullscreen, Enter: fullscreen, o: () => pickFiles(), '?': () => $('shortcuts').click(),
  };
  const action = actions[event.key] ?? actions[event.key.toLowerCase()];
  if (!action) return;
  event.preventDefault();
  if (!event.repeat || event.key.startsWith('Arrow')) action();
});

function changeVolume(delta) {
  video.muted = false;
  video.volume = Math.max(0, Math.min(1, video.volume + delta));
  if (video.volume) previousVolume = video.volume;
}

updatePlaylistUI();
updateControls();
const controls = stage.querySelector('.controls');
new ResizeObserver(() => stage.style.setProperty('--controls-height', `${controls.offsetHeight}px`)).observe(controls);
