// src/InterviewThread.jsx
import { useEffect, useRef, useState } from 'react';
import './InterviewThread.css';

const WORKER_URL = 'https://regen-agente.sebagaviglio.workers.dev';
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_TYPES =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InterviewThread({ interviewId, accessToken, currentSenderType }) {
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const authedFetch = (path, body) =>
    fetch(`${WORKER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: body ? JSON.stringify(body) : undefined,
    });

  function loadMessages() {
    authedFetch('/interview/messages', { interviewId })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(`Error cargando mensajes: ${JSON.stringify(data)}`);
          setMessages([]);
          return;
        }
        setMessages(data.messages || []);
      })
      .catch((err) => {
        setError(`Error cargando mensajes: ${err.message}`);
        setMessages([]);
      });
  }

  useEffect(loadMessages, [interviewId]);

  function handleFilePick(e) {
    const files = Array.from(e.target.files || []);
    const tooBig = files.find((f) => f.size > MAX_FILE_SIZE);
    if (tooBig) {
      setError(`"${tooBig.name}" supera el límite de 20 MB.`);
      return;
    }
    setError(null);
    setPendingFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  }

  function removePendingFile(idx) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function uploadOne(file) {
    const res = await fetch(
      `${WORKER_URL}/interview/upload?interviewId=${encodeURIComponent(interviewId)}&fileName=${encodeURIComponent(file.name)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream', Authorization: `Bearer ${accessToken}` },
        body: file,
      }
    );
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Error subiendo archivo: ${JSON.stringify(errData)}`);
    }
    return res.json();
  }

  async function handleSend() {
    if (!text.trim() && pendingFiles.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const uploaded = [];
      for (const file of pendingFiles) {
        uploaded.push(await uploadOne(file));
      }
      const res = await authedFetch('/interview/messages/send', {
        interviewId,
        text: text.trim() || null,
        attachments: uploaded,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'No se pudo enviar.');
      setText('');
      setPendingFiles([]);
      loadMessages();
    } catch (err) {
      setError(err.message || 'No se pudo enviar el mensaje.');
    } finally {
      setSending(false);
    }
  }

  async function openAttachment(att) {
    try {
      const res = await fetch(`${WORKER_URL}/interview/file?key=${encodeURIComponent(att.r2Key || att.r2_key)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('No se pudo abrir el archivo.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      setError('No se pudo abrir el archivo.');
    }
  }

  return (
    <div className="it-thread">
      <h3 className="it-thread__title">Mensajes con el equipo</h3>

      <div className="it-thread__messages">
        {messages === null && <p className="it-thread__empty">Cargando…</p>}
        {messages && messages.length === 0 && (
          <p className="it-thread__empty">Todavía no hay mensajes acá. Podés escribir o adjuntar algo abajo.</p>
        )}
        {messages?.map((m) => (
          <div key={m.id} className={`it-msg ${m.sender_type === currentSenderType ? 'is-own' : ''}`}>
            <div className="it-msg__meta">
              <span className="it-msg__sender">{m.sender_type === 'staff' ? m.sender_name || 'Equipo REGEN' : m.sender_name || 'Paciente'}</span>
              <span className="it-msg__date">{formatDate(m.created_at)}</span>
            </div>
            {m.body && <p className="it-msg__body">{m.body}</p>}
            {m.attachments?.length > 0 && (
              <div className="it-msg__attachments">
                {m.attachments.map((a) => (
                  <button key={a.id} type="button" className="it-attachment" onClick={() => openAttachment(a)}>
                    📎 {a.fileName} {a.fileSize ? `(${formatSize(a.fileSize)})` : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <p className="it-thread__error">{error}</p>}

      {pendingFiles.length > 0 && (
        <div className="it-pending-files">
          {pendingFiles.map((f, i) => (
            <span key={i} className="it-pending-file">
              {f.name}
              <button type="button" onClick={() => removePendingFile(i)} aria-label="Quitar">
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="it-compose">
        <textarea
          className="it-compose__input"
          placeholder="Escribí un mensaje…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
        />
        <div className="it-compose__actions">
          <button type="button" className="it-compose__attach" onClick={() => fileInputRef.current?.click()}>
            📎 Adjuntar
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            multiple
            hidden
            onChange={handleFilePick}
          />
          <button
            type="button"
            className="it-compose__send"
            onClick={handleSend}
            disabled={sending || (!text.trim() && pendingFiles.length === 0)}
          >
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
