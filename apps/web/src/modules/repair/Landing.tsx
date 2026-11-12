import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router';
import { ENTITY_TYPE_DEFS, entityPath } from '@medtech/core';
import { Alert, ButtonLink, EmptyState, ErrorState, Field, Input, Loading, ModuleHero, Section, Select, Stat } from '@medtech/ui';
import { useAuth } from '../../lib/auth.tsx';
import { useDebounced, useDocumentTitle } from '../../lib/hooks.ts';
import { FaultCard } from './components.tsx';
import { useFaultInfos } from './data.ts';
import { collectAffected, filterFaults, isSeverity, SEVERITIES, SEVERITY_META, type AffectedEntry, type FaultInfo, type Severity } from './logic.ts';

const GROUPS = ['device', 'product_model', 'component'] as const;

/** Startseite des Repair Labs */
export default function Landing() {
  useDocumentTitle('MedTech Repair Lab');
  const faults = useFaultInfos();
  const items = faults.data ?? [];
  const affected = useMemo(() => collectAffected(items), [items]);
  const critical = items.filter((f) => f.data.severity === 'kritisch' || f.data.severity === 'hoch').length;
  const deviceCount = GROUPS.reduce((n, g) => n + affected[g].length, 0);

  return (
    <div className="mw-container mw-page">
      <ModuleHero module="repair">
        <div className="mw-row mw-repair-hero">
          <a href="#diagnose-start" className="mw-btn mw-btn--primary mw-btn--lg mw-repair-hero__cta">
            Diagnose starten
          </a>
          <a href="#fehlerbilder" className="mw-btn mw-btn--secondary mw-btn--lg">
            Alle Fehlerbilder
          </a>
        </div>
        {faults.data ? (
          <div className="mw-row mw-repair-hero__stats">
            <Stat value={items.length} label="Fehlerbilder" />
            <Stat value={deviceCount} label="betroffene Geräte & Bauteile" />
            <Stat value={critical} label="hoher/kritischer Schweregrad" />
          </div>
        ) : null}
      </ModuleHero>

      <Alert tone="warn" icon="shield">
        Das Repair Lab unterstützt die systematische Fehlersuche und ersetzt keine Herstellerunterlagen. Instandsetzungen an Medizinprodukten dürfen nur
        Personen mit entsprechender Qualifikation durchführen (Medizinprodukte-Betreiberverordnung, MPBetreibV). Bei Gefahr für Patienten: Gerät sofort außer Betrieb nehmen.
      </Alert>

      {faults.loading && !faults.data ? (
        <Loading label="Fehlerbilder werden geladen …" />
      ) : faults.error ? (
        <ErrorState error={faults.error} onRetry={faults.reload} />
      ) : (
        <>
          <DiagnoseStart faults={items} affected={affected} />
          <FaultBrowser faults={items} affected={affected} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Einstieg: Gerät → Fehlerbild → Diagnose
function DiagnoseStart({ faults, affected }: { faults: FaultInfo[]; affected: ReturnType<typeof collectAffected> }) {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('geraet') ?? '';
  const all = GROUPS.flatMap((g) => affected[g]);
  const selected = all.find((a) => a.entity.id === selectedId);
  const sectionRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const { effectiveSettings } = useAuth();

  // Bei Aufruf mit ?geraet=… direkt zum Einstieg scrollen
  useEffect(() => {
    if (selectedId) sectionRef.current?.scrollIntoView({ behavior: effectiveSettings.reducedMotion ? 'auto' : 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('geraet', id);
    else next.delete('geraet');
    setParams(next, { replace: true });
    if (id) requestAnimationFrame(() => resultRef.current?.focus());
  };

  const forDevice = selected ? filterFaults(faults, { device: selected.entity.id }) : [];

  return (
    <div ref={sectionRef} id="diagnose-start" className="mw-repair-anchor">
      <Section title="Diagnose starten" icon="route">
        <ol className="mw-repair-flow" aria-label="Ablauf">
          <li className={selected ? 'is-done' : 'is-active'}>
            <span>1</span> Gerät wählen
          </li>
          <li className={selected ? 'is-active' : ''}>
            <span>2</span> Fehlerbild wählen
          </li>
          <li>
            <span>3</span> Geführte Diagnose
          </li>
        </ol>

        {all.length === 0 ? (
          <EmptyState title="Noch keine Fehlerbilder mit Gerätezuordnung erfasst." icon="device" />
        ) : (
          <div className="mw-stack" style={{ gap: 16 }}>
            {GROUPS.map((g) =>
              affected[g].length ? (
                <fieldset key={g} className="mw-repair-devices">
                  <legend className="mw-label">{ENTITY_TYPE_DEFS[g].plural}</legend>
                  <div className="mw-repair-devices__list">
                    {affected[g].map((a) => (
                      <DeviceButton key={a.entity.id} entry={a} pressed={a.entity.id === selectedId} onSelect={select} />
                    ))}
                  </div>
                </fieldset>
              ) : null,
            )}
          </div>
        )}

        {selectedId && !selected ? (
          <Alert tone="info">Für die gewählte Auswahl sind keine Fehlerbilder erfasst.</Alert>
        ) : null}

        {selected ? (
          <div className="mw-repair-flow__result">
            <div className="mw-spread">
              <h3 ref={resultRef} tabIndex={-1} className="mw-repair-flow__heading">
                Fehlerbilder für {selected.entity.title}
              </h3>
              <div className="mw-row">
                <ButtonLink to={entityPath(selected.entity.id)} size="sm" variant="ghost" icon="book">
                  {ENTITY_TYPE_DEFS[selected.entity.type].label} ansehen
                </ButtonLink>
                <button type="button" className="mw-btn mw-btn--ghost mw-btn--sm" onClick={() => select('')}>
                  Auswahl aufheben
                </button>
              </div>
            </div>
            <div className="mw-grid" style={{ '--mw-grid-min': '300px' } as CSSProperties}>
              {forDevice.map((f) => (
                <FaultCard key={f.summary.id} fault={f} headingLevel={4} />
              ))}
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

function DeviceButton({ entry, pressed, onSelect }: { entry: AffectedEntry; pressed: boolean; onSelect: (id: string) => void }) {
  return (
    <button type="button" className="mw-repair-device" aria-pressed={pressed} onClick={() => onSelect(pressed ? '' : entry.entity.id)}>
      {entry.entity.thumbnail ? <img src={entry.entity.thumbnail} alt="" className="mw-repair-device__thumb" loading="lazy" /> : null}
      <span className="mw-repair-device__title">{entry.entity.title}</span>
      <span className="mw-repair-device__count">
        {entry.faultCount} {entry.faultCount === 1 ? 'Fehlerbild' : 'Fehlerbilder'}
      </span>
    </button>
  );
}

// ------------------------------------------------------------------ Fehlerbild-Katalog mit Filtern
function FaultBrowser({ faults, affected }: { faults: FaultInfo[]; affected: ReturnType<typeof collectAffected> }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 150);
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [device, setDevice] = useState('');
  const visible = useMemo(() => filterFaults(faults, { q: dq, severity, device }), [faults, dq, severity, device]);
  const filtered = !!(dq.trim() || severity || device);

  return (
    <div id="fehlerbilder" className="mw-repair-anchor">
      <Section title="Fehlerbilder" icon="alert">
        <form className="mw-repair-filters" role="search" aria-label="Fehlerbilder filtern" onSubmit={(e) => e.preventDefault()}>
          <Field label="Suche">
            {(id) => <Input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symptom, Ursache, Gerät …" />}
          </Field>
          <Field label="Schweregrad">
            {(id) => (
              <Select id={id} value={severity} onChange={(e) => setSeverity(isSeverity(e.target.value) ? e.target.value : '')}>
                <option value="">Alle</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_META[s].label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Betroffenes Gerät / Bauteil">
            {(id) => (
              <Select id={id} value={device} onChange={(e) => setDevice(e.target.value)}>
                <option value="">Alle</option>
                {GROUPS.map((g) =>
                  affected[g].length ? (
                    <optgroup key={g} label={ENTITY_TYPE_DEFS[g].plural}>
                      {affected[g].map((a) => (
                        <option key={a.entity.id} value={a.entity.id}>
                          {a.entity.title} ({a.faultCount})
                        </option>
                      ))}
                    </optgroup>
                  ) : null,
                )}
              </Select>
            )}
          </Field>
          {filtered ? (
            <button
              type="button"
              className="mw-btn mw-btn--ghost mw-btn--sm mw-repair-filters__reset"
              onClick={() => {
                setQ('');
                setSeverity('');
                setDevice('');
              }}
            >
              Filter zurücksetzen
            </button>
          ) : null}
        </form>
        <p className="mw-small mw-muted" aria-live="polite">
          {visible.length} von {faults.length} Fehlerbildern
        </p>
        {visible.length ? (
          <div className="mw-grid" style={{ '--mw-grid-min': '300px' } as CSSProperties}>
            {visible.map((f) => (
              <FaultCard key={f.summary.id} fault={f} />
            ))}
          </div>
        ) : (
          <EmptyState title="Keine passenden Fehlerbilder gefunden." icon="search">
            <p className="mw-small">Suchbegriff oder Filter anpassen.</p>
          </EmptyState>
        )}
      </Section>
    </div>
  );
}
