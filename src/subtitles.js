const timing = /^[ \t]*(\d{2,}:\d{2}:\d{2}),(\d{3})([ \t]+-->[ \t]+)(\d{2,}:\d{2}:\d{2}),(\d{3})/gm;

export function asWebVtt(text, filename) {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (/\.vtt$/i.test(filename) && /^WEBVTT(?:[ \t\n]|$)/.test(clean)) return clean;
  if (/\.srt$/i.test(filename)) {
    const converted = clean.replace(timing, '$1.$2$3$4.$5');
    if (converted !== clean) return `WEBVTT\n\n${converted}`;
  }
  throw new Error('Choose a valid .srt or .vtt subtitle file.');
}
