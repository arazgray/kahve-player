export function createImageViewer(container) {
  let current;
  let previous;
  let pending;
  let fadeTimer;

  function release(frame) {
    if (!frame) return;
    frame.element.remove();
    frame.element.removeAttribute('src');
    URL.revokeObjectURL(frame.url);
  }

  function cancelPending() {
    release(pending);
    pending = undefined;
  }

  function finishFade() {
    clearTimeout(fadeTimer);
    release(previous);
    previous = undefined;
    current?.element.classList.remove('image-enter');
  }

  return {
    cancelPending,
    clear() {
      cancelPending();
      finishFade();
      release(current);
      current = undefined;
    },
    async show(file) {
      cancelPending();
      const element = new Image();
      const frame = { element, url: URL.createObjectURL(file) };
      pending = frame;
      element.className = 'image-frame';
      element.alt = file.name;
      element.draggable = false;
      element.src = frame.url;
      try {
        await element.decode();
      } catch (error) {
        if (pending !== frame) return null;
        cancelPending();
        throw error;
      }
      if (pending !== frame) return null;
      pending = undefined;
      finishFade();
      previous = current;
      current = frame;
      if (previous) {
        previous.element.setAttribute('aria-hidden', 'true');
        previous.element.alt = '';
        element.classList.add('image-enter');
        fadeTimer = setTimeout(finishFade, 280);
      }
      container.append(element);
      return { width: element.naturalWidth, height: element.naturalHeight };
    },
  };
}
