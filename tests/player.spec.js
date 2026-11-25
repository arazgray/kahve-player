import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
import { readFile } from 'node:fs/promises';

const localClip = fileURLToPath(new URL('./fixtures/playback.mp4', import.meta.url));
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

test('loads its installed app shell offline and plays local files', async ({ page, context }) => {
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No media open' })).toBeVisible();
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
  const hdr = page.getByRole('button', { name: 'HDR settings' });
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt', { cancelable: true })));
  await expect(page.getByRole('button', { name: 'Install app' })).toBeHidden();
  expect((await open.boundingBox()).x).toBeGreaterThan(105);
  const hdrBounds = await hdr.boundingBox();
  expect(hdrBounds.x + hdrBounds.width).toBeLessThan(400);
  const playlistBounds = await page.getByRole('button', { name: 'Playlist', exact: true }).boundingBox();
  expect(playlistBounds.x + playlistBounds.width).toBeLessThan(400);
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
  const appArtwork = await page.locator('link[rel="icon"]').getAttribute('href');
  await expect(page.locator('.brand-mark')).toHaveAttribute('src', appArtwork);
  await expect(page.locator('.empty-icon')).toHaveAttribute('src', appArtwork);
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
