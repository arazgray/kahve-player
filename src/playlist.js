const imageExtensions = /\.(avif|bmp|gif|ico|jpe?g|jfif|png|apng|svg|webp|heic|heif|tiff?)$/i;
const mediaExtensions = /\.(avi|flac|m4a|m4v|mka|mkv|mov|mp[234]|mpg|mpeg|oga|ogg|ogv|opus|ts|wav|webm)$/i;
const audioExtensions = /\.(aac|aiff?|alac|ape|flac|m4a|mka|mp[23]|oga|opus|wav|wma)$/i;
const subtitleExtensions = /\.(srt|vtt)$/i;
const stem = (name) => name.replace(/\.[^.]+$/, '').toLowerCase();

export function collectFiles(files) {
  const entries = [];
  const subtitles = [];
  let skipped = 0;
  for (const file of files) {
    if (subtitleExtensions.test(file.name)) subtitles.push(file);
    else if (file.type.startsWith('image/') || imageExtensions.test(file.name)) {
      entries.push({ kind: 'image', title: file.name, file });
    } else if (/^(video|audio)\//.test(file.type) || mediaExtensions.test(file.name) || audioExtensions.test(file.name)) {
      const audioHint = file.type.startsWith('audio/') || audioExtensions.test(file.name);
      entries.push({ kind: 'local', title: file.name, file, audioHint });
    } else skipped++;
  }
  const videos = entries.filter((entry) => entry.kind === 'local');
  let unattached = subtitles;
  if (entries.length) {
    unattached = subtitles.filter((file) => {
      const name = stem(file.name);
      const target = videos.filter((entry) => name === stem(entry.title) || name.startsWith(`${stem(entry.title)}.`))
        .sort((a, b) => b.title.length - a.title.length)[0] ?? (videos.length === 1 ? videos[0] : null);
      if (!target) return true;
      (target.subtitles ??= []).push(file);
      return false;
    });
  }
  return { entries, unattached, skipped };
}

export function imageFormat(file) {
  const type = file.type.split('/')[1] || file.name.match(/\.([^.]+)$/)?.[1];
  return { jpg: 'JPEG', jfif: 'JPEG', 'svg+xml': 'SVG', 'x-icon': 'ICO', 'vnd.microsoft.icon': 'ICO' }[type?.toLowerCase()]
    ?? type?.toUpperCase() ?? '';
}
