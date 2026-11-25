import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { extname, join, relative } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

const localClip = fileURLToPath(new URL('./fixtures/playback.mp4', import.meta.url));
const coveredTrack = fileURLToPath(new URL('./fixtures/cover.mp3', import.meta.url));
const unillustratedTrack = fileURLToPath(new URL('./fixtures/tags.mp3', import.meta.url));
const webmRecording = fileURLToPath(new URL('./fixtures/recording.webm', import.meta.url));
const duration = (page) => page.locator('#video').evaluate((video) => video.duration);
const playhead = (page) => page.locator('#video').evaluate((video) => video.currentTime);
const mediaTypes = {
  '.m3u8': 'application/vnd.apple.mpegurl', '.mpd': 'application/dash+xml', '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment', '.mp4': 'video/mp4', '.vtt': 'text/vtt',
};
const runtimeErrors = new WeakMap();

async function openStream(page, path) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('button', { name: /Open a stream/ }).click();
  await page.getByLabel('Video URL').fill(new URL(path, page.url()).href);
  await page.getByRole('button', { name: 'Open stream', exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/fixture/**/*', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/fixture\//, '');
    const range = /^bytes=(\d+)-(\d+)$/.exec(route.request().headers().range ?? '');
    if (path === 'playback.mp4' && range) {
      const bytes = await readFile(localClip);
      const start = Number(range[1]);
      const end = Number(range[2]);
      return route.fulfill({
        status: 206, contentType: mediaTypes['.mp4'], body: bytes.subarray(start, end + 1),
        headers: { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` },
      });
    }
    await route.fulfill({
      path: fileURLToPath(new URL(`./fixtures/${path}`, import.meta.url)),
      contentType: mediaTypes[extname(path)],
    });
  });
  await page.goto('/');
});

test('shows local container, codec, frame rate, and resolution in Video info', async ({ page }) => {
  await page.getByRole('button', { name: 'Video info', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Video info' });
  await expect(dialog).toContainText('Open a video to see');
  await page.keyboard.press('Escape');
  await page.locator('#file-input').setInputFiles(localClip);
  await page.getByRole('button', { name: 'Video info', exact: true }).click();
  await expect(dialog.locator('#video-info-format')).toHaveText('MP4 (MPEG-4)');
  await expect(dialog.locator('#video-info-videoCodec')).toHaveText('H.264 / AVC (avc1)');
  await expect(dialog.locator('#video-info-frameRate')).toHaveText('12 fps');
  await expect(dialog.locator('#video-info-resolution')).toHaveText('160 × 90');
});

test.afterEach(({ page }) => expect(runtimeErrors.get(page)).toEqual([]));

test('starts empty with toolbar actions for files, streams and HDR', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'No media open' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  expect(await page.locator('video').evaluate((v) => v.currentSrc)).toBe('');
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('button', { name: /Open a stream/ })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Open files/ }).click();
  await (await chooser).setFiles(localClip);
  await expect(page.locator('#media-title')).toHaveText('playback.mp4');
  await page.getByRole('button', { name: 'HDR settings' }).click();
  await expect(page.getByText(/Chrome manages HDR for local files/)).toBeVisible();
});

test('plays, pauses, seeks and adjusts playback speed', async ({ page }) => {
  await page.locator('#file-input').setInputFiles(localClip);
  await expect.poll(() => duration(page)).toBeGreaterThan(15);
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.15);
  await page.keyboard.press('k');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Forward 10 seconds' }).click();
  await expect.poll(() => playhead(page)).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Playback settings' }).click();
  await page.getByRole('button', { name: '1.5×' }).click();
  await expect(page.getByRole('button', { name: '1.5×' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('#video').evaluate((v) => v.playbackRate)).toBe(1.5);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Playback settings' })).toBeFocused();
});

test('opens a local file and toggles imported SRT captions', async ({ page }) => {
  await page.locator('#file-input').setInputFiles(localClip);
  await expect(page.locator('#media-title')).toHaveText('playback.mp4');
  await expect.poll(() => duration(page)).toBeGreaterThan(15);
  await page.getByRole('button', { name: 'Subtitles', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Add a subtitle file/ }).click();
  await (await chooser).setFiles({
    name: 'English.srt', mimeType: 'application/x-subrip',
    buffer: Buffer.from('1\r\n00:00:00,000 --> 00:00:10,000\r\nA test caption.\r\n'),
  });
  await expect.poll(() => page.locator('#video').evaluate(v => v.textTracks[0]?.cues?.[0]?.text)).toBe('A test caption.');
  await expect(page.getByRole('button', { name: 'English File' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Off', exact: true }).click();
  await expect.poll(() => page.locator('#video').evaluate(v => v.textTracks[0].mode)).toBe('disabled');
});

test('plays HLS and switches audio, subtitles and quality', async ({ page }) => {
  await openStream(page, '/fixture/hls/master.m3u8');
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'Audio tracks' }).click();
  await page.getByRole('button', { name: 'French' }).click();
  await expect(page.getByRole('button', { name: 'French' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Subtitles', exact: true }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page.getByRole('button', { name: 'English', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.locator('#video').evaluate(v =>
    [...v.textTracks].find(t => t.mode === 'showing')?.cues?.[0]?.text)).toBe('This is a stream caption.');
  await page.getByRole('button', { name: 'Off', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Off', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Playback settings' }).click();
  await page.getByRole('button', { name: '90p', exact: true }).click();
  await expect(page.getByRole('button', { name: '90p', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'HDR settings' }).click();
  await expect(page.getByRole('button', { name: /Prefer HDR/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Prefer SDR' }).click();
  await expect(page.getByRole('button', { name: 'Prefer SDR' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Automatic' }).click();
  await expect(page.getByRole('button', { name: 'Automatic' })).toHaveAttribute('aria-pressed', 'true');
});

test('plays DASH and switches back to native direct playback', async ({ page }) => {
  await openStream(page, '/fixture/dash/manifest.mpd');
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await openStream(page, '/fixture/playback.mp4');
  await expect.poll(() => duration(page)).toBeGreaterThan(15);
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Video info', exact: true }).click();
  await expect(page.locator('#video-info-format')).toHaveText('MP4 (MPEG-4)');
});

test('serves every built app asset offline and plays local files', async ({ page, context }) => {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No media open' })).toBeVisible();
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const assets = (await readdir(dist, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dist, join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
    .filter((path) => path !== 'sw.js');
  expect(assets).toContain('manifest.webmanifest');
  const unavailable = await page.evaluate(async (paths) => {
    const checks = await Promise.all(paths.map(async (path) => {
      try {
        const response = await fetch(new URL(path, location.href), { cache: 'no-store' });
        return response.ok ? null : `${path}: ${response.status}`;
      } catch {
        return path;
      }
    }));
    return checks.filter(Boolean);
  }, assets);
  expect(unavailable).toEqual([]);
  await page.locator('#file-input').setInputFiles(localClip);
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Video info', exact: true }).click();
  await expect(page.locator('#video-info-frameRate')).toHaveText('12 fps');
});

test('reports the active HLS rendition and codecs in Video info', async ({ page }) => {
  await openStream(page, '/fixture/hls/master.m3u8');
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Video info', exact: true }).click();
  await expect(page.locator('#video-info-format')).toHaveText('HLS · MPEG-TS');
  await expect(page.locator('#video-info-videoCodec')).toHaveText(/H\.264/);
  await expect(page.locator('#video-info-audioCodec')).toHaveText(/AAC/);
  await expect(page.locator('#video-info-frameRate')).toHaveText('12 fps');
  await expect(page.locator('#video-info-resolution')).toHaveText(/320 × 180|160 × 90/);
});

test('keeps the player and toolbar within a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Playlist', exact: true })).toBeVisible();
  const bounds = await page.evaluate(() => {
    const stage = document.querySelector('#stage').getBoundingClientRect();
    const fullscreen = document.querySelector('#fullscreen').getBoundingClientRect();
    const shortcuts = document.querySelector('#shortcuts').getBoundingClientRect();
    return document.documentElement.scrollWidth <= innerWidth && fullscreen.right <= stage.right && shortcuts.right <= stage.right;
  });
  expect(bounds).toBe(true);
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('opts into native window controls and follows changes in title-bar geometry', async ({ page }) => {
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(await manifest.json()).toMatchObject({
    display_override: ['window-controls-overlay'], display: 'standalone',
  });
  await page.setViewportSize({ width: 480, height: 480 });
  await page.addInitScript(() => {
    const controls = Object.assign(new EventTarget(), {
      visible: true,
      rect: new DOMRect(105, 0, 295, 38),
      getTitlebarAreaRect() { return this.rect; },
    });
    Object.defineProperty(navigator, 'windowControlsOverlay', { value: controls });
  });
  await page.reload();
  const open = page.getByRole('button', { name: 'Open', exact: true });
  const about = page.getByRole('button', { name: 'About Kahve' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
  await expect(page.getByRole('button', { name: 'Install app' })).toBeHidden();
  expect((await open.boundingBox()).x).toBeGreaterThan(105);
  const aboutBounds = await about.boundingBox();
  expect(aboutBounds.x + aboutBounds.width).toBeLessThan(400);
  await open.click();
  await expect(page.getByRole('button', { name: /Open files/ })).toBeVisible();
  await page.evaluate(() => {
    const controls = navigator.windowControlsOverlay;
    controls.rect = new DOMRect(0, 0, 255, 34);
    controls.dispatchEvent(new Event('geometrychange'));
  });
  expect((await open.boundingBox()).x).toBeLessThan(20);
  await expect(page.getByRole('button', { name: /Open files/ })).toBeVisible();
});

test('uses consistent app artwork and only offers installation on a browser prompt', async ({ page }) => {
  const appArtwork = await page.locator('link[rel="icon"]').evaluate((link) => link.href);
  expect(await page.locator('.brand-mark').evaluate((image) => image.src)).toBe(appArtwork);
  expect(await page.locator('.empty-icon').evaluate((image) => image.src)).toBe(appArtwork);
  const manifest = await page.request.get('/manifest.webmanifest');
  expect((await manifest.json()).icons.map((icon) => icon.src)).toEqual([
    'kahve-app-192.png', 'kahve-app-512.png', 'kahve-app-maskable.png',
  ]);
  const install = page.getByRole('button', { name: 'Install app' });
  await expect(install).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
  await expect(install).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(install).toBeHidden();
});

function testImage(name, color) {
  return {
    name: `${name}.svg`, mimeType: 'image/svg+xml',
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="45"><rect width="80" height="45" fill="${color}"/></svg>`),
  };
}

async function dropFiles(page, files) {
  await page.evaluate((entries) => {
    const transfer = new DataTransfer();
    for (const entry of entries) {
      const bytes = Uint8Array.from(atob(entry.base64), (char) => char.charCodeAt(0));
      transfer.items.add(new File([bytes], entry.name, { type: entry.mimeType }));
    }
    document.querySelector('#stage').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  }, files.map(({ name, mimeType, buffer }) => ({ name, mimeType, base64: buffer.toString('base64') })));
}

test('queues dropped images, appends more, and switches them with a fade', async ({ page }) => {
  await dropFiles(page, [testImage('First', 'orange'), testImage('Second', 'blue')]);
  await expect(page.getByRole('img', { name: 'First.svg' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous item' })).toBeDisabled();
  await dropFiles(page, [testImage('Third', 'purple')]);
  await expect(page.getByText('Image 1 of 3')).toBeVisible();
  await page.evaluate(() => {
    window.imageFades = 0;
    document.querySelector('#image-viewer').addEventListener('animationstart', () => window.imageFades++);
  });
  await page.getByRole('button', { name: 'Next item' }).click();
  await expect(page.getByRole('img', { name: 'Second.svg' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.imageFades)).toBe(1);
  await page.getByRole('button', { name: 'Previous item' }).click();
  await expect(page.getByRole('img', { name: 'First.svg' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Image 2 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Image info' }).click();
  await expect(page.getByRole('dialog', { name: 'Image info' })).toContainText('80 × 45');
  await expect(page.getByText('Frame rate', { exact: true })).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  const playlist = page.getByRole('region', { name: 'Playlist' });
  await expect(playlist.getByRole('button', { name: 'Second.svg', exact: true })).toHaveAttribute('aria-current', 'true');
  await playlist.getByRole('button', { name: 'Remove First.svg' }).click();
  await expect(page.getByText('Image 1 of 2')).toBeVisible();
  await playlist.getByRole('button', { name: 'Clear playlist' }).click();
  await expect(page.getByRole('heading', { name: 'No media open' })).toBeVisible();
  await expect(playlist).toContainText('0 items');
});

test('advances from a finished video into the next image in a mixed playlist', async ({ page }) => {
  const image = testImage('Photo', 'red');
  await page.locator('#file-input').setInputFiles([
    { name: 'Clip.mp4', mimeType: 'video/mp4', buffer: await readFile(localClip) }, image,
  ]);
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await page.locator('#video').evaluate((video) => { video.currentTime = video.duration - 0.05; });
  await expect(page.getByRole('img', { name: 'Photo.svg' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next item' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Previous item' }).click();
  await expect(page.locator('#media-title')).toHaveText('Clip.mp4');
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
});

test('offers Open Files, Open Streams and disabled IPTV from the empty player', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Open IPTV' })).toBeDisabled();
  await page.getByRole('button', { name: 'Open Streams', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Open a stream' })).toBeVisible();
  await page.keyboard.press('Escape');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open Files', exact: true }).click();
  await (await chooser).setFiles(localClip);
  await expect(page.locator('#media-title')).toHaveText('playback.mp4');
});

test('displays embedded album artwork and falls back to tagged artist, track and album', async ({ page }) => {
  await page.locator('#file-input').setInputFiles([coveredTrack, unillustratedTrack]);
  await expect(page.getByRole('img', { name: 'Album artwork' })).toBeVisible();
  await expect(page.locator('#music-track')).toHaveText('Copper Hour');
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Next item' }).click();
  await expect(page.locator('#music-track')).toHaveText('Paper Moon');
  await expect(page.locator('#music-artist')).toHaveText('The Test Ensemble');
  await expect(page.locator('#music-album')).toHaveText('Studio Notes');
  await expect(page.getByRole('img', { name: 'Album artwork' })).toBeHidden();
});

test('saves and loads ordered local files and the current item across an offline reload', async ({ page, context }) => {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.locator('#file-input').setInputFiles([testImage('First', 'orange'), testImage('Second', 'blue')]);
  await page.getByRole('button', { name: 'Next item' }).click();
  await expect(page.getByRole('img', { name: 'Second.svg' })).toBeVisible();
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  const playlist = page.getByRole('region', { name: 'Playlist' });
  await playlist.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await playlist.getByLabel('Playlist name').fill('Morning queue');
  await playlist.getByRole('button', { name: 'Save playlist', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved “Morning queue”' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await playlist.getByRole('button', { name: 'Load playlist', exact: true }).click();
  await playlist.getByRole('button', { name: /^Morning queue/ }).click();
  await expect(page.getByRole('img', { name: 'Second.svg' })).toBeVisible();
  await expect(playlist.locator('.playlist-entry')).toHaveText(['First.svg', 'Second.svg']);
  await playlist.getByRole('button', { name: 'Load playlist', exact: true }).click();
  await playlist.getByRole('button', { name: 'Remove saved playlist Morning queue' }).click();
  await playlist.getByRole('button', { name: 'Remove saved playlist', exact: true }).click();
  await expect(playlist).toContainText('No saved playlists in this browser yet.');
  await expect(page.getByRole('img', { name: 'Second.svg' })).toBeVisible();
});

test('reads format, codecs and frame rate from a live-style WebM recording offline', async ({ page, context }) => {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.locator('#file-input').setInputFiles(webmRecording);
  await page.getByRole('button', { name: 'Video info', exact: true }).click();
  await expect(page.locator('#video-info-format')).toHaveText('WebM');
  await expect(page.locator('#video-info-videoCodec')).toHaveText('VP9');
  await expect(page.locator('#video-info-audioCodec')).toHaveText(/^Opus/);
  await expect(page.locator('#video-info-frameRate')).toHaveText(/29\.97\d* fps/);
  await expect(page.locator('#video-info-resolution')).toHaveText('160 × 90');
});

test('asks for the folder for a standalone image and queues its adjacent images in filename order', async ({ page }) => {
  const images = [testImage('Photo 10', 'green'), testImage('Photo 2', 'blue'), testImage('Photo 1', 'red')];
  await page.evaluate((entries) => {
    Object.defineProperty(window, 'showDirectoryPicker', {
      configurable: true,
      value: async () => ({
        async *values() {
          for (const { base64, name, mimeType } of entries) {
            const file = new File([Uint8Array.from(atob(base64), (letter) => letter.charCodeAt(0))], name, { type: mimeType });
            yield { kind: 'file', name, getFile: async () => file };
          }
          yield { kind: 'directory', name: 'Nested folder' };
        },
      }),
    });
  }, images.map(({ name, mimeType, buffer }) => ({ name, mimeType, base64: buffer.toString('base64') })));
  await page.locator('#file-input').setInputFiles(images[1]);
  await expect(page.getByRole('img', { name: 'Photo 2.svg' })).toBeVisible();
  const next = page.getByRole('button', { name: 'Next item' });
  const previous = page.getByRole('button', { name: 'Previous item' });
  await expect(previous).toBeEnabled();
  await next.click();
  await expect(page.getByRole('img', { name: 'Photo 10.svg' })).toBeVisible();
  await expect(next).toBeDisabled();
  await previous.click();
  await expect(page.getByRole('img', { name: 'Photo 2.svg' })).toBeVisible();
  await previous.click();
  await expect(page.getByRole('img', { name: 'Photo 1.svg' })).toBeVisible();
  await expect(previous).toBeDisabled();
});

test('keeps About and shortcuts at the top, preserves the media title, and toggles fullscreen with Enter', async ({ page }) => {
  const order = await page.locator('.controls .control-group').first().locator('button').evaluateAll((buttons) => buttons.slice(0, 3).map((button) => button.id));
  expect(order).toEqual(['play', 'previous-item', 'next-item']);
  const tools = page.locator('.controls');
  await expect(tools.getByRole('button', { name: 'Playlist', exact: true })).toBeVisible();
  await expect(tools.getByRole('button', { name: 'HDR settings' })).toBeVisible();
  await expect(tools.getByRole('button', { name: 'Video info' })).toBeVisible();
  await page.locator('.stage-top').getByRole('button', { name: 'About Kahve' }).click();
  const about = page.getByRole('dialog', { name: 'Kahve Player' });
  await expect(about.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/arazgray/kahve-player');
  await expect(about.getByRole('link', { name: 'Made by Araz Gray' })).toHaveAttribute('target', '_blank');
  await page.keyboard.press('Escape');
  await page.locator('#file-input').setInputFiles(localClip);
  await expect(page.locator('#media-title')).toHaveText('playback.mp4');
  await expect(page).toHaveTitle('Kahve Player');
  expect(await page.evaluate(() => navigator.mediaSession.metadata.title)).toBe('playback.mp4');
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('stage');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
});

test('adds files to the queue from Open without replacing the active file', async ({ page }) => {
  await page.locator('#file-input').setInputFiles(localClip);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add files to queue', exact: true }).click();
  await (await chooser).setFiles(testImage('Queued', 'orange'));
  await expect(page.locator('#media-title')).toHaveText('playback.mp4');
  await page.getByRole('button', { name: 'Next item' }).click();
  await expect(page.getByRole('img', { name: 'Queued.svg' })).toBeVisible();
});

test('plays dropped media immediately instead of appending during playback', async ({ page }) => {
  const buffer = await readFile(localClip);
  await page.locator('#file-input').setInputFiles([
    { name: 'Playing.mp4', mimeType: 'video/mp4', buffer }, testImage('Old queue', 'red'),
  ]);
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await dropFiles(page, [{ name: 'Dropped.mp4', mimeType: 'video/mp4', buffer }]);
  await expect(page.locator('#media-title')).toHaveText('Dropped.mp4');
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Playlist', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Playlist' }).locator('.playlist-entry')).toHaveText(['Dropped.mp4']);
});

async function mockDesktopLaunch(page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'launchQueue', {
      value: { setConsumer: (consumer) => { window.receiveDesktopLaunch = consumer; } },
    });
  });
}

test('receives files from the installed app launch queue, even offline', async ({ page, context }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.launch_handler.client_mode).toBe('focus-existing');
  expect(manifest.file_handlers[0]).toMatchObject({
    action: './', launch_type: 'single-client',
    accept: { 'video/mp4': ['.mp4', '.m4v'], 'audio/mpeg': ['.mp3'], 'image/png': ['.png'] },
  });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await mockDesktopLaunch(page);
  await context.setOffline(true);
  await page.reload();
  await page.evaluate(async ({ name, mimeType, base64 }) => {
    const decode = (bytes) => Uint8Array.from(atob(bytes), (char) => char.charCodeAt(0));
    await window.receiveDesktopLaunch({
      files: [
        { getFile: async () => new File([decode(base64)], name, { type: mimeType }) },
        { getFile: async () => new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], 'Desktop.svg', { type: 'image/svg+xml' }) },
      ],
    });
    await window.receiveDesktopLaunch({ files: [] });
  }, { name: 'Desktop.mp4', mimeType: 'video/mp4', base64: (await readFile(localClip)).toString('base64') });
  await expect(page.locator('#media-title')).toHaveText('Desktop.mp4');
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await page.getByRole('button', { name: 'Next item' }).click();
  await expect(page.getByRole('img', { name: 'Desktop.svg' })).toBeVisible();
});

test('retries a temporary desktop read error and opens the file when it becomes readable', async ({ page }) => {
  await mockDesktopLaunch(page);
  await page.reload();
  const attempts = await page.evaluate(async () => {
    let attempts = 0;
    await window.receiveDesktopLaunch({
      files: [{
        async getFile() {
          if (++attempts === 1) throw new DOMException('Drive not ready', 'NotReadableError');
          return new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], 'External.svg', { type: 'image/svg+xml' });
        },
      }],
    });
    return attempts;
  });
  expect(attempts).toBe(2);
  await expect(page.getByRole('img', { name: 'External.svg' })).toBeVisible();
});

test('asks for permission from the retry button and opens the desktop file', async ({ page }) => {
  await mockDesktopLaunch(page);
  await page.reload();
  await page.evaluate(async () => {
    let allowed = false;
    await window.receiveDesktopLaunch({
      files: [{
        name: 'Permission.svg',
        async requestPermission({ mode }) {
          if (mode !== 'read') throw Error('Only read access is needed.');
          allowed = true;
          return 'granted';
        },
        async getFile() {
          if (!allowed) throw new DOMException('Permission required', 'NotAllowedError');
          return new File(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'], 'Permission.svg', { type: 'image/svg+xml' });
        },
      }],
    });
  });
  const dialog = page.getByRole('dialog', { name: 'Can’t open the desktop file' });
  await expect(dialog).toContainText('Chrome did not grant read access');
  await dialog.getByRole('button', { name: 'Allow and retry' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('img', { name: 'Permission.svg' })).toBeVisible();
});

test('offers the file picker when Chrome still cannot read a file from an external drive', async ({ page }) => {
  await mockDesktopLaunch(page);
  await page.reload();
  await page.evaluate(() => window.receiveDesktopLaunch({
    files: [{ name: 'External.mp4', async getFile() { throw new DOMException('Drive unavailable', 'NotFoundError'); } }],
  }));
  const dialog = page.getByRole('dialog', { name: 'Can’t open the desktop file' });
  await expect(dialog).toContainText('make sure the drive is mounted');
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Browse files' }).click();
  await (await chooser).setFiles(localClip);
  await expect(page.locator('#media-title')).toHaveText('playback.mp4');
});

test('reports a local playback stall without calling it a network stream', async ({ page }) => {
  await page.locator('#file-input').setInputFiles(localClip);
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.1);
  await page.locator('#video').evaluate((video) => {
    Object.defineProperty(video, 'readyState', { value: 2, configurable: true });
    video.dispatchEvent(new Event('waiting'));
  });
  await expect(page.locator('#stage-message')).toHaveText('Waiting for Chrome to read or decode the file…');
  await page.keyboard.press('k');
  await expect(page.locator('#stage-message')).toBeHidden();
});
