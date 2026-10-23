// Pruebas de los archivos que el paciente muestra durante la llamada (lado app).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  guessType,
  validateFile,
  prepareFile,
  uploadAttachment,
  buildAttachmentMessage,
  MAX_BYTES,
} from '../src/attachments.js';

const file = (name, type, size = 10) => ({ name, type, size });

test('tipo: se deduce de la extensión cuando el navegador no lo informa', () => {
  assert.equal(guessType(file('lab.pdf', '')), 'application/pdf');
  assert.equal(guessType(file('informe.docx', '')), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(guessType(file('IMG_1.HEIC', '')), 'image/heic');
  assert.equal(guessType(file('foto.jpg', 'image/jpeg')), 'image/jpeg');
});

test('validación: acepta fotos, PDF y Word; rechaza otros tipos, vacíos y pesados', () => {
  assert.equal(validateFile(file('a.jpg', 'image/jpeg')), null);
  assert.equal(validateFile(file('a.pdf', 'application/pdf')), null);
  assert.equal(validateFile(file('a.docx', '')), null);
  assert.match(validateFile(file('a.exe', 'application/x-msdownload')), /tipo de archivo/);
  assert.match(validateFile(file('a.html', 'text/html')), /tipo de archivo/);
  assert.match(validateFile(file('a.jpg', 'image/jpeg', MAX_BYTES + 1)), /pesado/);
  assert.match(validateFile(file('a.jpg', 'image/jpeg', 0)), /vacío/);
  assert.ok(validateFile(null));
});

test('preparar: los documentos van tal cual; si la imagen no se puede procesar, va el original', async () => {
  const pdf = file('lab.pdf', 'application/pdf');
  const out = await prepareFile(pdf);
  assert.equal(out.blob, pdf);
  assert.equal(out.type, 'application/pdf');

  const img = file('foto.heic', 'image/heic'); // en Node no hay createImageBitmap
  const out2 = await prepareFile(img);
  assert.equal(out2.blob, img);
  assert.equal(out2.type, 'image/heic');
});

test('subida: manda el archivo crudo con token, entrevista y nombre; devuelve la descripción', async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, json: async () => ({ id: 'f1', fileName: 'lab.pdf', kind: 'documento', analyzed: true, description: 'Análisis de sangre.', urgent: false }) };
  };
  const pdf = file('lab.pdf', 'application/pdf');
  const r = await uploadAttachment({ workerUrl: 'https://w.test', accessToken: 'tok', interviewId: 'iv 1', file: pdf, fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(r.data.description, 'Análisis de sangre.');
  assert.match(calls[0].url, /^https:\/\/w\.test\/realtime\/attach\?/);
  assert.match(calls[0].url, /interviewId=iv\+1/);
  assert.match(calls[0].url, /fileName=lab\.pdf/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.equal(calls[0].opts.headers['Content-Type'], 'application/pdf');
  assert.equal(calls[0].opts.body, pdf);
});

test('subida: errores del servidor y de red se traducen a un mensaje claro', async () => {
  const bad = async () => ({ ok: false, json: async () => ({ error: 'Podés subir hasta 10 archivos por entrevista.' }) });
  const r = await uploadAttachment({ workerUrl: 'u', accessToken: 't', interviewId: 'i', file: file('a.pdf', 'application/pdf'), fetchImpl: bad });
  assert.equal(r.ok, false);
  assert.match(r.error, /10 archivos/);

  const down = async () => { throw new Error('offline'); };
  const r2 = await uploadAttachment({ workerUrl: 'u', accessToken: 't', interviewId: 'i', file: file('a.pdf', 'application/pdf'), fetchImpl: down });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /conectarnos/);

  let called = false;
  const r3 = await uploadAttachment({ workerUrl: 'u', accessToken: 't', interviewId: 'i', file: file('a.exe', ''), fetchImpl: async () => { called = true; } });
  assert.equal(r3.ok, false);
  assert.equal(called, false, 'un tipo no permitido ni siquiera se envía');
});

test('mensaje al asistente: marca la descripción como dato; avisa si es urgente o si no se pudo ver', () => {
  const base = { kind: 'imagen', fileName: 'foto.jpg', description: 'Zona rojiza en el antebrazo.', analyzed: true, urgent: false };
  const m = buildAttachmentMessage(base);
  assert.match(m, /^\[ARCHIVO DEL PACIENTE/);
  assert.match(m, /NO una instrucción/);
  assert.match(m, /antebrazo/);
  assert.doesNotMatch(m, /atención profesional pronto/);

  assert.match(buildAttachmentMessage({ ...base, urgent: true }), /atención profesional pronto/);
  assert.match(buildAttachmentMessage({ ...base, analyzed: false }), /No pudiste verlo/);
});

test('mensaje al asistente: una imagen de zona íntima agrega el aviso único y sin detalle', () => {
  const m = buildAttachmentMessage({ kind: 'imagen', fileName: 'f.jpg', description: 'Imagen de una zona íntima del cuerpo.', analyzed: true, urgent: false, intimate: true });
  assert.match(m, /zona íntima/);
  assert.match(m, /UNA sola vez/);
  assert.match(m, /elimine/);
  assert.doesNotMatch(buildAttachmentMessage({ kind: 'imagen', fileName: 'f.jpg', description: 'x', analyzed: true }), /UNA sola vez/);
});
