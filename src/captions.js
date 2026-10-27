// src/captions.js
//
// Subtítulos de la llamada: las últimas intervenciones, tomadas de la
// transcripción en vivo que entrega la sesión Realtime (history_updated).
// Lógica pura, sin React, para poder probarla.

const MAX_CHARS = 220;

function itemText(item) {
  return (item.content || [])
    .map((c) => {
      if (c.type === 'text') return c.text;
      if (c.type === 'output_audio' || c.type === 'input_audio') return c.transcript || '';
      return ''; // 'input_text' son los avisos internos (p. ej. archivos): no son lo que dijo la persona
    })
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Si la intervención es larga, mostramos el final (lo que se está diciendo ahora).
export function clipCaption(text, max = MAX_CHARS) {
  if (text.length <= max) return text;
  const tail = text.slice(-max);
  const cut = tail.indexOf(' ');
  return `…${cut > 0 && cut < 30 ? tail.slice(cut + 1) : tail}`;
}

// [{ id, who: 'a' | 'p', text }] con las últimas `max` intervenciones que tienen texto.
export function latestCaptions(history, max = 2) {
  const out = [];
  (history || []).forEach((item, i) => {
    if (item?.type !== 'message') return;
    if (item.role !== 'assistant' && item.role !== 'user') return;
    const text = itemText(item);
    if (!text) return;
    out.push({ id: item.itemId || `i${i}`, who: item.role === 'assistant' ? 'a' : 'p', text: clipCaption(text) });
  });
  return out.slice(-max);
}

export function sameCaptions(a, b) {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.id === b[i].id && x.who === b[i].who && x.text === b[i].text);
}
