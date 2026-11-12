import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { entityPath, type Scene3D } from '@medtech/core';
import { Alert, Button, ButtonLink, Icon, Loading } from '@medtech/ui';
import { useAuth } from '../../lib/auth.tsx';
import { useEntity } from '../../lib/hooks.ts';
import { componentFacts, plural } from './relations.ts';
import type { SceneRenderer } from './three-renderer.ts';
import './explorer.css';

export interface SceneViewerProps {
  scene: Scene3D;
  /** Name des Geräts – für Beschriftungen/Screenreader */
  title: string;
  /** Kompakte Darstellung für eingebettete Panels */
  compact?: boolean;
}

type Status = 'loading' | 'ready' | 'unsupported';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Wiederverwendbarer 3D-Viewer für data.scene (Geräte, Produktmodelle).
 * three.js wird erst beim Mounten per dynamic import nachgeladen.
 */
export default function SceneViewer({ scene, title, compact }: SceneViewerProps) {
  const { effectiveSettings } = useAuth();
  const reducedMotion = effectiveSettings.reducedMotion || prefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SceneRenderer | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [exploded, setExploded] = useState(false);
  const [transparent, setTransparent] = useState(false);
  const helpId = useId();
  const listId = useId();

  // Renderer aufbauen / abbauen
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    setStatus('loading');
    import('./three-renderer.ts')
      .then(({ SceneRenderer, webglAvailable }) => {
        if (cancelled) return;
        if (!webglAvailable()) {
          setStatus('unsupported');
          return;
        }
        try {
          rendererRef.current = new SceneRenderer(
            el,
            scene,
            {
              onHover: (id) => setHovered(id),
              onSelect: (id) => setSelected(id),
            },
            { reducedMotion, dark: document.documentElement.dataset.theme === 'dark', wheelRequiresFocus: compact },
          );
          setStatus('ready');
        } catch {
          setStatus('unsupported');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('unsupported');
      });
    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // Neuaufbau nur bei neuer Szene; Einstellungen werden unten nachgeführt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Zustand an den Renderer übergeben
  useEffect(() => rendererRef.current?.setSelected(selected), [selected, status]);
  useEffect(() => rendererRef.current?.setHovered(hovered), [hovered, status]);
  useEffect(() => rendererRef.current?.setExploded(exploded), [exploded, status]);
  useEffect(() => rendererRef.current?.setTransparent(transparent), [transparent, status]);
  useEffect(() => rendererRef.current?.setReducedMotion(reducedMotion), [reducedMotion, status]);

  const selectedPart = useMemo(() => scene.parts.find((p) => p.id === selected) ?? null, [scene, selected]);

  const onStageKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const r = rendererRef.current;
    if (!r) return;
    const step = Math.PI / 18;
    const map: Record<string, () => void> = {
      ArrowLeft: () => r.rotateBy(-step, 0),
      ArrowRight: () => r.rotateBy(step, 0),
      ArrowUp: () => r.rotateBy(0, -step),
      ArrowDown: () => r.rotateBy(0, step),
      '+': () => r.zoomBy(0.85),
      '=': () => r.zoomBy(0.85),
      '-': () => r.zoomBy(1 / 0.85),
      Home: () => r.resetView(),
      '0': () => r.resetView(),
      Escape: () => setSelected(null),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  };

  const unsupported = status === 'unsupported';

  return (
    <div className={`mw-explorer-viewer${compact ? ' mw-explorer-viewer--compact' : ''}`}>
      {!unsupported ? (
      <div className="mw-explorer-toolbar" role="toolbar" aria-label="3D-Ansicht steuern">
        <Button size="sm" variant={exploded ? 'primary' : 'secondary'} aria-pressed={exploded} onClick={() => setExploded((v) => !v)} icon="layers" disabled={unsupported}>
          Explosionsansicht
        </Button>
        <Button size="sm" variant={transparent ? 'primary' : 'secondary'} aria-pressed={transparent} onClick={() => setTransparent((v) => !v)} icon="target" disabled={unsupported}>
          Transparenz
        </Button>
        <Button
          size="sm"
          icon="reset"
          disabled={unsupported}
          onClick={() => {
            rendererRef.current?.resetView();
            setExploded(false);
            setTransparent(false);
          }}
        >
          Ansicht zurücksetzen
        </Button>
        {!unsupported ? (
          <span className="mw-explorer-zoom" role="group" aria-label="Zoom">
            <Button size="sm" iconOnly icon="plus" onClick={() => rendererRef.current?.zoomBy(0.8)}>
              Heranzoomen
            </Button>
            <Button size="sm" aria-label="Herauszoomen" onClick={() => rendererRef.current?.zoomBy(1.25)}>
              <span aria-hidden>−</span>
            </Button>
          </span>
        ) : null}
      </div>
      ) : null}

      <div className="mw-explorer-layout">
        <div className="mw-explorer-main">
          {unsupported ? (
            <Alert tone="info" icon="info">
              3D-Darstellung ist in diesem Browser nicht verfügbar (WebGL wird nicht unterstützt oder ist deaktiviert). Alle Bauteile sind in der Liste
              erreichbar.
            </Alert>
          ) : (
            <div
              className="mw-explorer-stage"
              tabIndex={0}
              role="application"
              aria-roledescription="3D-Ansicht"
              aria-label={`3D-Modell: ${title}`}
              aria-describedby={helpId}
              onKeyDown={onStageKey}
            >
              <div ref={containerRef} className="mw-explorer-canvas-host" />
              {status === 'loading' ? (
                <div className="mw-explorer-overlay">
                  <Loading label="3D-Ansicht wird geladen …" />
                </div>
              ) : null}
              {hovered && hovered !== selected ? (
                <div className="mw-explorer-hover" aria-hidden>
                  {scene.parts.find((p) => p.id === hovered)?.label}
                </div>
              ) : null}
            </div>
          )}
          {!unsupported ? (
            <p id={helpId} className="mw-small mw-muted mw-explorer-help">
              Ziehen zum Drehen, {compact ? 'Strg + Mausrad' : 'Mausrad'} oder Zwei-Finger-Geste zum Zoomen, Klick wählt ein Bauteil. Tastatur: Pfeiltasten drehen,
              +/− zoomen, Pos1 setzt zurück, Esc hebt die Auswahl auf.
            </p>
          ) : null}
        </div>

        <aside className="mw-explorer-side" aria-label="Bauteile">
          <div aria-live="polite">
            {selectedPart ? <PartDetails part={selectedPart} onClose={() => setSelected(null)} /> : (
              <p className="mw-small mw-muted mw-explorer-hint">Bauteil im Modell oder in der Liste auswählen, um Details zu sehen.</p>
            )}
          </div>
          <h3 className="mw-explorer-list-title" id={listId}>
            Bauteile ({scene.parts.length})
          </h3>
          <ul className="mw-explorer-parts" aria-labelledby={listId}>
            {scene.parts.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="mw-explorer-part"
                  aria-pressed={p.id === selected}
                  onClick={() => setSelected(p.id === selected ? null : p.id)}
                  onMouseEnter={() => setHovered(p.id)}
                  onMouseLeave={() => setHovered((h) => (h === p.id ? null : h))}
                  onFocus={() => setHovered(p.id)}
                  onBlur={() => setHovered((h) => (h === p.id ? null : h))}
                >
                  <span className="mw-explorer-swatch" style={{ background: p.color }} aria-hidden />
                  <span className="mw-explorer-part__label">{p.label}</span>
                  {p.component ? <Icon name="link" size={14} title="Mit Komponente verknüpft" /> : null}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function PartDetails({ part, onClose }: { part: Scene3D['parts'][number]; onClose: () => void }) {
  const comp = useEntity(part.component);
  const facts = comp.data ? componentFacts(comp.data.relations) : null;
  return (
    <div className="mw-explorer-detail">
      <div className="mw-explorer-detail__head">
        <h3 className="mw-explorer-detail__title">{part.label}</h3>
        <Button size="sm" variant="ghost" iconOnly icon="x" onClick={onClose}>
          Auswahl aufheben
        </Button>
      </div>
      {part.description ? <p className="mw-small">{part.description}</p> : null}
      {part.component ? (
        comp.loading ? (
          <Loading label="Komponente wird geladen …" />
        ) : comp.error || !comp.data ? (
          <p className="mw-small mw-muted">Verknüpfte Komponente konnte nicht geladen werden.</p>
        ) : (
          <div className="mw-explorer-component">
            <div className="mw-small mw-muted">
              <Icon name="chip" size={14} /> Komponente
            </div>
            <div className="mw-explorer-component__title">{comp.data.title}</div>
            <p className="mw-small">{comp.data.summary}</p>
            {facts ? (
              <ul className="mw-list-plain mw-small mw-explorer-facts">
                <li>
                  <Icon name="alert" size={14} /> {plural(facts.faults.length, 'verknüpftes Fehlerbild', 'verknüpfte Fehlerbilder')}
                </li>
                <li>
                  <Icon name="box" size={14} /> {plural(facts.spareParts.length, 'Ersatzteil', 'Ersatzteile')}
                </li>
              </ul>
            ) : null}
            <ButtonLink to={entityPath(comp.data.id)} size="sm" variant="primary" icon="book">
              Zur Komponente
            </ButtonLink>
          </div>
        )
      ) : null}
    </div>
  );
}
