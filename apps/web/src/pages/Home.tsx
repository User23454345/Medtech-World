import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { ENTITY_TYPE_DEFS, ENTITY_TYPE_LIST, MODULE_LIST, entityPath } from '@medtech/core';
import { Badge, ButtonLink, Card, EntityChip, Icon, Section, Stat } from '@medtech/ui';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useAsync, useDocumentTitle } from '../lib/hooks.ts';

const EXAMPLES = ['SpO2', 'Ableitstrom', 'STK', 'Beatmung', 'Defibrillator', 'Infusionspumpe'];

export function Home() {
  useDocumentTitle(undefined);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const meta = useAsync((s) => api.meta(s), [], 'meta');
  const history = useAsync(() => api.me.history(6), [user?.id], user ? 'me:history:home' : null);
  const progress = useAsync(() => api.me.progress(), [user?.id], user ? 'me:progress:home' : null);

  const counts = meta.data?.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : undefined;

  return (
    <div>
      <section className="mw-home-hero">
        <div className="mw-container">
          <h1>
            Medizintechnik verstehen, prüfen, instand halten – <span className="mw-home-hero__accent">auf einer Plattform.</span>
          </h1>
          <p>
            Acht Module, eine zentrale und geprüfte Datenbasis: Vom Messprinzip im Wiki über die Fehlerdiagnose im Repair Lab bis zum
            Prüfverfahren in der Akademie ist jedes Gerät mit Herstellern, Komponenten, Lerninhalten und Quellen verknüpft.
          </p>
          <form
            className="mw-home-search"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) navigate(`/suche?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Icon name="search" size={22} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Alle Module durchsuchen, z. B. „SpO2“" aria-label="Alle Module durchsuchen" />
            <button type="submit" className="mw-btn mw-btn--primary">
              Suchen
            </button>
          </form>
          <div className="mw-row" style={{ marginTop: 12, gap: 6 }}>
            <span className="mw-small" style={{ opacity: 0.8 }}>
              Beispiele:
            </span>
            {EXAMPLES.map((ex) => (
              <Link key={ex} to={`/suche?q=${encodeURIComponent(ex)}`} className="mw-home-chip">
                {ex}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mw-container mw-page" style={{ paddingTop: 32 }}>
        {user && (history.data?.items.length || progress.data?.items.length) ? (
          <Section title={`Willkommen zurück, ${user.displayName}`} icon="history" actions={<ButtonLink to="/konto" size="sm">Mein Bereich</ButtonLink>}>
            <div className="mw-grid" style={{ '--mw-grid-min': '300px' } as CSSProperties}>
              <Card>
                <h3 className="mw-card__title">Zuletzt angesehen</h3>
                <div className="mw-row" style={{ gap: 6 }}>
                  {history.data?.items.filter((h) => h.entity).map((h) => <EntityChip key={h.entityId + h.at} entity={h.entity!} />)}
                </div>
              </Card>
              <Card>
                <h3 className="mw-card__title">Lernfortschritt</h3>
                <ul className="mw-list-plain mw-stack" style={{ gap: 6 }}>
                  {progress.data?.items.slice(0, 4).map((p) => (
                    <li key={p.entityId} className="mw-spread">
                      {p.entity ? <Link to={entityPath(p.entityId)}>{p.entity.title}</Link> : <span className="mw-muted">Entfernter Inhalt</span>}
                      <Badge tone={p.status === 'completed' ? 'ok' : 'info'}>{p.status === 'completed' ? 'Abgeschlossen' : 'Begonnen'}{p.score !== null ? ` · ${p.score} %` : ''}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </Section>
        ) : null}

        <Section title="Module" icon="layers">
          <div className="mw-grid" style={{ '--mw-grid-min': '270px' } as CSSProperties}>
            {MODULE_LIST.map((m) => {
              const types = ENTITY_TYPE_LIST.filter((t) => t.homeModule === m.id);
              const n = counts ? types.reduce((a, t) => a + (counts[t.type] ?? 0), 0) : null;
              return (
                <Link key={m.id} to={m.path} className="mw-module-card" style={{ '--mw-accent': m.accent } as CSSProperties}>
                  <span className="mw-module-card__icon">
                    <Icon name={m.icon} size={22} />
                  </span>
                  <span className="mw-module-card__name">{m.name}</span>
                  <span className="mw-module-card__tagline">{m.tagline}</span>
                  <span className="mw-module-card__meta">
                    {n ? `${n} Inhalte · ` : ''}
                    {types.map((t) => t.plural).join(', ') || 'nutzt alle Inhalte'}
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>

        <Section title="Eine Datenbasis statt vieler Inseln" icon="link">
          <div className="mw-two-col">
            <Card>
              <p>
                Jedes Gerät existiert genau <strong>einmal</strong> in der zentralen Datenbasis und ist mit allem verknüpft, was dazu gehört. Am Beispiel
                Pulsoximeter:
              </p>
              <div className="mw-graph-example">
                {[
                  ['device:pulsoximeter', 'Gerät'],
                  ['term:pulsoximetrie', 'Messprinzip'],
                  ['component:spo2-sensor', 'Komponente'],
                  ['fault:spo2-kein-signal', 'Fehlerbild'],
                  ['simulation:pulsoximetrie', 'Simulation'],
                  ['learning_module:pulsoximetrie-grundlagen', 'Lernmodul'],
                  ['test_procedure:elektrische-sicherheit-62353', 'Prüfverfahren'],
                  ['manufacturer:masimo', 'Hersteller'],
                ].map(([id, label]) => {
                  const type = id!.split(':')[0] as keyof typeof ENTITY_TYPE_DEFS;
                  return (
                    <Link key={id} to={entityPath(id!)} className="mw-graph-node">
                      <Icon name={ENTITY_TYPE_DEFS[type].icon} size={16} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
              <p className="mw-small mw-muted" style={{ marginTop: 12 }}>
                Wer im Repair Lab einen Fehler diagnostiziert, findet dieselben Komponenten, Ersatzteile und Prüfverfahren wie im Wiki, in der Akademie oder im Market.
              </p>
            </Card>
            <Card>
              <h3 className="mw-card__title">Wissensbasis</h3>
              <div className="mw-stack" style={{ gap: 14 }}>
                <Stat value={total ?? '–'} label="geprüfte, verknüpfte Inhalte" />
                <Stat value={counts?.device ?? '–'} label="Medizingeräte" />
                <Stat value={counts?.learning_module ?? '–'} label="Lernmodule" />
                <Stat value={counts?.fault ?? '–'} label="Fehlerbilder" />
              </div>
              <p className="mw-small mw-muted" style={{ marginTop: 12 }}>
                Jede technische Angabe ist mit einer Quelle belegt. <Link to="/ueber">Qualitätsgrundsätze</Link>
              </p>
            </Card>
          </div>
        </Section>
      </div>
    </div>
  );
}
