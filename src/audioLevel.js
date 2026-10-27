// src/audioLevel.js
//
// Nivel de volumen REAL de la llamada, para animar la esfera de voz.
// Dos medidores de Web Audio (AnalyserNode): uno sobre la voz del asistente
// (la pista remota que llega por WebRTC) y otro sobre el micrófono del paciente.
//
// Importante: los analizadores NO se conectan a la salida (destination), así que
// esto no agrega ni duplica audio: solo "mira" el volumen. Si el navegador no
// tiene Web Audio, createAudioLevels() devuelve null y la pantalla usa un
// movimiento suave de respaldo.

const FFT_SIZE = 512;
const NOISE_GATE = 0.012; // por debajo de esto es ruido de fondo, no voz
const GAIN = 4.5; // el RMS de una voz normal ronda 0.05–0.2: lo llevamos a ~0.2–0.9

// Convierte el RMS crudo (0..1) a un nivel 0..1 usable para animar.
export function normalizeLevel(rms) {
  if (!(rms > NOISE_GATE)) return 0;
  return Math.min(1, (rms - NOISE_GATE) * GAIN);
}

// RMS de un buffer de muestras de 8 bits (centradas en 128), como lo entrega
// AnalyserNode.getByteTimeDomainData.
export function rmsFromBytes(bytes) {
  if (!bytes || !bytes.length) return 0;
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const x = (bytes[i] - 128) / 128;
    sum += x * x;
  }
  return Math.sqrt(sum / bytes.length);
}

// Combina los dos niveles en uno solo para la esfera:
// asistente hablando = amplitud completa; paciente hablando = amplitud media.
export function combineLevels({ remote = 0, mic = 0 }) {
  return Math.max(remote, mic * 0.65);
}

export function createAudioLevels() {
  const Ctx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!Ctx) return null;

  let ctx;
  try {
    ctx = new Ctx();
  } catch {
    return null;
  }
  // En Safari/iOS el contexto nace suspendido: se reanuda en el gesto del usuario.
  ctx.resume?.().catch?.(() => {});

  function channel() {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    return { analyser, bytes: new Uint8Array(analyser.fftSize), source: null, stream: null };
  }
  const mic = channel();
  const remote = channel();
  let remoteElement = null;

  function attach(ch, stream) {
    if (!stream || ch.stream === stream) return;
    try {
      ch.source?.disconnect();
      ch.source = ctx.createMediaStreamSource(stream);
      ch.source.connect(ch.analyser);
      ch.stream = stream;
    } catch {
      /* si el navegador no deja medir esta pista, la esfera simplemente se mueve menos */
    }
  }

  function level(ch) {
    if (!ch.stream) return 0;
    try {
      ch.analyser.getByteTimeDomainData(ch.bytes);
    } catch {
      return 0;
    }
    return normalizeLevel(rmsFromBytes(ch.bytes));
  }

  return {
    attachMic(stream) {
      attach(mic, stream);
    },
    // El SDK le asigna la pista remota al <audio> cuando llega: la tomamos de ahí,
    // cuando esté disponible (se reintenta en cada lectura).
    watchRemoteElement(audioElement) {
      remoteElement = audioElement;
    },
    read() {
      if (ctx.state === 'suspended') ctx.resume?.().catch?.(() => {});
      if (remoteElement && !remote.stream && remoteElement.srcObject) attach(remote, remoteElement.srcObject);
      return { remote: level(remote), mic: level(mic) };
    },
    close() {
      try {
        mic.source?.disconnect();
        remote.source?.disconnect();
      } catch {
        /* ya estaba desconectado */
      }
      remoteElement = null;
      ctx.close?.().catch?.(() => {});
    },
  };
}
