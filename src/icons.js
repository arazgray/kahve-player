import {
  ArrowDownToLine, Captions, Check, ChevronDown, ChevronRight,
  Expand, FileVideoCamera, Film, FolderOpen, Headphones, Image, Info, Keyboard, Link2, ListVideo, Music2, Plus, Tv,
  Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Settings2,
  SkipBack, SkipForward, Volume2, VolumeX, X,
} from 'lucide';

const icons = {
  ArrowDownToLine, Captions, Check, ChevronDown, ChevronRight,
  Expand, FileVideoCamera, Film, FolderOpen, Headphones, Image, Info, Keyboard, Link2, ListVideo, Music2, Plus, Tv,
  Minimize, Pause, PictureInPicture2, Play, RotateCcw, RotateCw, Settings2,
  SkipBack, SkipForward, Volume2, VolumeX, X,
};

export function icon(name, solid = false) {
  const children = icons[name].map(([tag, attrs]) =>
    `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}></${tag}>`,
  ).join('');
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="${solid ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
}

export function iconButton(id, label, name, extra = '') {
  return `<button type="button" class="icon-button" id="${id}" aria-label="${label}" title="${label}" ${extra}>${icon(name, name === 'Play' || name === 'Pause')}</button>`;
}
