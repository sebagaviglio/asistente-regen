// src/TrendChart.jsx
//
// Gráfico de evolución de un biomarcador (SVG propio, sin dependencias).
//
//  - Eje X: tiempo real (las mediciones separadas por meses se ven separadas).
//  - Banda gris-verdosa: rango de referencia INFORMADO por el laboratorio o el
//    profesional (si hay solo un límite, una línea punteada). No es un juicio:
//    este componente no marca nada como normal o alterado.
//  - Punto relleno = verificada por el equipo; punto con aro = cargada por el
//    paciente, todavía sin verificar.

const W = 320;
const PAD = { l: 44, r: 14, t: 12, b: 26 };

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

export default function TrendChart({ points, unit, decimals = 1, refLow = null, refHigh = null, height = 130, label = '' }) {
  if (!points || points.length === 0) return null;

  const H = height;
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const times = points.map((p) => Date.parse(`${p.date}T00:00:00Z`));
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const xFor = (t) => (tMax === tMin ? PAD.l + innerW / 2 : PAD.l + ((t - tMin) / (tMax - tMin)) * innerW);

  const values = points.map((p) => p.value);
  const domainVals = [...values];
  if (refLow !== null) domainVals.push(refLow);
  if (refHigh !== null) domainVals.push(refHigh);
  let vMin = Math.min(...domainVals);
  let vMax = Math.max(...domainVals);
  if (vMin === vMax) {
    const pad = Math.abs(vMin) * 0.1 || 1;
    vMin -= pad;
    vMax += pad;
  } else {
    const pad = (vMax - vMin) * 0.12;
    vMin -= pad;
    vMax += pad;
  }
  const yFor = (v) => PAD.t + (1 - (v - vMin) / (vMax - vMin)) * innerH;
  const clampY = (y) => Math.max(PAD.t, Math.min(PAD.t + innerH, y));
  const fmt = (v) => Number(v).toFixed(decimals);

  const coords = points.map((p, i) => ({ x: xFor(times[i]), y: yFor(p.value), p }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const bandTop = refHigh !== null ? clampY(yFor(refHigh)) : null;
  const bandBottom = refLow !== null ? clampY(yFor(refLow)) : null;

  return (
    <svg className="tc-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución de ${label || 'la medición'}`}>
      {/* Rango de referencia */}
      {bandTop !== null && bandBottom !== null && (
        <rect className="tc-band" x={PAD.l} y={bandTop} width={innerW} height={Math.max(bandBottom - bandTop, 1)} />
      )}
      {bandTop !== null && bandBottom === null && (
        <line className="tc-bound" x1={PAD.l} x2={PAD.l + innerW} y1={bandTop} y2={bandTop} />
      )}
      {bandBottom !== null && bandTop === null && (
        <line className="tc-bound" x1={PAD.l} x2={PAD.l + innerW} y1={bandBottom} y2={bandBottom} />
      )}

      {/* Ejes */}
      <line className="tc-axis" x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={PAD.t + innerH} />
      <line className="tc-axis" x1={PAD.l} x2={PAD.l + innerW} y1={PAD.t + innerH} y2={PAD.t + innerH} />
      <text className="tc-tick" x={PAD.l - 6} y={PAD.t + 4} textAnchor="end">
        {fmt(vMax)}
      </text>
      <text className="tc-tick" x={PAD.l - 6} y={PAD.t + innerH} textAnchor="end">
        {fmt(vMin)}
      </text>
      <text className="tc-tick tc-unit" x={4} y={H / 2} transform={`rotate(-90 4 ${H / 2})`} textAnchor="middle">
        {unit}
      </text>
      <text className="tc-tick" x={PAD.l} y={H - 8} textAnchor={points.length === 1 ? 'middle' : 'start'} dx={points.length === 1 ? innerW / 2 : 0}>
        {fmtDate(points[0].date)}
      </text>
      {points.length > 1 && (
        <text className="tc-tick" x={PAD.l + innerW} y={H - 8} textAnchor="end">
          {fmtDate(points[points.length - 1].date)}
        </text>
      )}

      {/* Línea y puntos */}
      {points.length > 1 && <path className="tc-line" d={path} />}
      {coords.map((c, i) => (
        <circle key={i} className={`tc-dot ${c.p.verified ? 'is-verified' : 'is-unverified'}`} cx={c.x} cy={c.y} r={4}>
          <title>
            {`${fmt(c.p.value)} ${unit} — ${fmtDate(c.p.date)}${c.p.verified ? ' (verificada)' : ' (sin verificar)'}`}
          </title>
        </circle>
      ))}
    </svg>
  );
}
