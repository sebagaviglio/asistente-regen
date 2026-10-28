// src/captions.js
//
// Subtítulos de la llamada: las últimas intervenciones, tomadas de la
// transcripción en vivo que entrega la sesión Realtime (history_updated).
// Lógica pura, sin React, para poder probarla.

const MAX_CHARS = 220;

// Lo que se dijo en una intervención, tal cual.
function spokenText(item) {
  return (item.content || [])
    .map((c) => {
      if (c.type === 'text') return c.text;
      if (c.type === 'output_audio' || c.type === 'input_audio') return c.transcript || '';
      return ''; // 'input_text' son los avisos internos (p. ej. archivos): no son lo que dijo la persona
    })
    .filter(Boolean)
    .join(' ');
}

// Para los subtítulos: en una sola línea.
function itemText(item) {
  return spokenText(item).replace(/\s+/g, ' ').trim();
}

// Transcripción completa que se guarda al cerrar la entrevista.
export function transcriptText(history) {
  return (history || [])
    .filter((item) => item?.type === 'message')
    .map((item) => {
      const text = spokenText(item);
      return text ? `${item.role === 'assistant' ? 'Asistente' : 'Paciente'}: ${text}` : null;
    })
    .filter(Boolean)
    .join('\n\n');
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
