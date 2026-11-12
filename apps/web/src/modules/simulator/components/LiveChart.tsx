import { useEffect, useRef, type MutableRefObject } from 'react';
import { buildLanes, gridStep, viewWindow } from '../chart-math.ts';
import type { Engine, Params, Timebase, Trace } from '../engines/types.ts';

interface Props {
  engine: Engine & { timebase: Timebase };
  params: Params;
  /** Laufende Animation (bei reduzierter Bewegung immer false) */
  running: boolean;
  speed: number;
  /** Aktuelle Simulationszeit (s) – wird bei laufender Animation fortgeschrieben */
  timeRef: MutableRefObject<number>;
  /** Wird gedrosselt (ca. 4×/s) mit der aktuellen Simulationszeit aufgerufen */
  onTick: (t: number) => void;
  /** Ändert sich, wenn die Zeit von außen gesetzt wurde (Reset, Schritt) → Neuzeichnen */
  version: number;
}

const LANE_H = 120;
const AXIS_H = 22;

function readVar(el: Element, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function fmtTime(s: number, unit: 's' | 'min') {
  if (unit === 'min') return `${Math.round(s / 60)} min`;
  return `${Math.round(s * 10) / 10} s`.replace('.', ',');
}

function fmtVal(v: number) {
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Zeichnet alle Kurven in Spuren auf ein Canvas */
export function drawTraces(canvas: HTMLCanvasElement, traces: Trace[], t: number, tb: Timebase) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const lanes = buildLanes(traces);
  const laneH = lanes.length === 1 ? LANE_H * 1.6 : LANE_H;
  const cssW = canvas.clientWidth || 600;
  const cssH = lanes.length * laneH + AXIS_H;
  if (canvas.height !== Math.round(cssH * dpr) || canvas.width !== Math.round(cssW * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = `${cssH}px`;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = readVar(canvas, '--mw-simulator-screen', '#0b1520');
  const grid = readVar(canvas, '--mw-simulator-grid', 'rgba(255,255,255,0.08)');
  const text = readVar(canvas, '--mw-simulator-screen-text', '#cbd5e1');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssW, cssH);

  const [t0, t1] = viewWindow(t, tb.window, tb.startsAtZero);
  const x = (s: number) => ((s - t0) / (t1 - t0)) * cssW;
  const step = gridStep(tb.window);

  // Vertikale Gitterlinien + Zeitachse
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = text;
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (let g = Math.ceil(t0 / step) * step; g <= t1 + 1e-9; g += step) {
    const gx = Math.round(x(g)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, cssH - AXIS_H);
    ctx.stroke();
    if (g >= 0 || !tb.startsAtZero) {
      const label = fmtTime(g, tb.axisUnit);
      const w = ctx.measureText(label).width;
      ctx.fillText(label, Math.min(cssW - w - 2, Math.max(2, gx - w / 2)), cssH - AXIS_H / 2);
    }
  }

  lanes.forEach((lane, li) => {
    const top = li * laneH;
    const [lo, hi] = lane.range;
    const pad = 8;
    const y = (v: number) => top + pad + (1 - (v - lo) / (hi - lo)) * (laneH - 2 * pad);
    // Spurtrenner und Nulllinie
    ctx.strokeStyle = grid;
    ctx.beginPath();
    ctx.moveTo(0, top + laneH - 0.5);
    ctx.lineTo(cssW, top + laneH - 0.5);
    ctx.stroke();
    if (lo < 0 && hi > 0) {
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y(0)) + 0.5);
      ctx.lineTo(cssW, Math.round(y(0)) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, cssW, laneH);
    ctx.clip();
    for (const tr of lane.traces) {
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = tr.dashed ? 1.5 : 2;
      ctx.setLineDash(tr.dashed ? [6, 4] : []);
      ctx.beginPath();
      tr.points.forEach(([ts, v], i) => {
        const px = x(ts);
        const py = y(v);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([]);
    // Beschriftung: Name, Einheit, aktueller Wert
    ctx.textBaseline = 'top';
    let lx = 8;
    for (const tr of lane.traces) {
      const last = tr.points[tr.points.length - 1];
      const label = `${tr.label}${last ? `: ${fmtVal(last[1])}` : ''} ${tr.unit}`;
      ctx.fillStyle = tr.color;
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText(label, lx, top + 6);
      lx += ctx.measureText(label).width + 16;
    }
    ctx.fillStyle = text;
    ctx.font = '10px system-ui, sans-serif';
    const hiL = fmtVal(hi);
    const loL = fmtVal(lo);
    ctx.fillText(hiL, cssW - ctx.measureText(hiL).width - 4, top + 4);
    ctx.textBaseline = 'bottom';
    ctx.fillText(loL, cssW - ctx.measureText(loL).width - 4, top + laneH - 4);
    ctx.textBaseline = 'middle';
  });
}

/**
 * Canvas-Kurvendarstellung mit requestAnimationFrame. Die Simulationszeit läuft mit
 * `speed` × Echtzeit; die Engine berechnet in jedem Frame das sichtbare Fenster neu
 * (deterministisch, daher ruckelfreies Scrollen). Pausiert/reduzierte Bewegung → statisches Bild.
 */
export function LiveChart({ engine, params, running, speed, timeRef, onTick, version }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  // Statisches Zeichnen (Pause, Parameteränderung, Größen- oder Themenwechsel)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const redraw = () => drawTraces(canvas, engine.simulate(paramsRef.current, timeRef.current).traces, timeRef.current, engine.timebase);
    redraw();
    const ro = new ResizeObserver(() => redraw());
    ro.observe(canvas);
    const mo = new MutationObserver(() => redraw());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [engine, params, version, timeRef]);

  // Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !running) return;
    let raf = 0;
    let last = performance.now();
    let lastTick = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      timeRef.current += dt * speed;
      drawTraces(canvas, engine.simulate(paramsRef.current, timeRef.current).traces, timeRef.current, engine.timebase);
      if (now - lastTick > 250) {
        lastTick = now;
        onTickRef.current(timeRef.current);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      onTickRef.current(timeRef.current);
    };
  }, [running, speed, engine, timeRef]);

  const labels = engine.simulate(params, timeRef.current).traces.map((t) => `${t.label} (${t.unit})`);
  return (
    <figure className="mw-simulator-chart">
      <canvas
        ref={canvasRef}
        className="mw-simulator-chart__canvas"
        role="img"
        aria-label={`Kurvendarstellung ${engine.label}: ${labels.join(', ')}. Die Messwerte stehen zusätzlich als Text in der Anzeige.`}
      />
    </figure>
  );
}
