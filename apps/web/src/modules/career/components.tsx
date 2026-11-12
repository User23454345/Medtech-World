import { ENTITY_TYPE_DEFS, entityPath, type ProgressEntry } from '@medtech/core';
import { Badge, Icon, ProgressBar, useUi } from '@medtech/ui';
import { itemStatus, pathItemLink, readinessLabel, type ItemStatus, type PathItem, type Readiness } from './career-logic.ts';
import './career.css';

const STATUS_UI: Record<ItemStatus, { label: string; tone?: 'ok' | 'warn'; icon: string }> = {
  completed: { label: 'Abgeschlossen', tone: 'ok', icon: 'check' },
  started: { label: 'Begonnen', tone: 'warn', icon: 'history' },
  open: { label: 'Offen', icon: 'target' },
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  const s = STATUS_UI[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
    </Badge>
  );
}

/** Bereitschaftsanzeige (Kompetenzcheck) */
export function ReadinessMeter({ readiness, title }: { readiness: Readiness; title: string }) {
  return (
    <div className="mw-career-readiness">
      <div className="mw-spread mw-small">
        <span>{readinessLabel(readiness)}</span>
        <strong className="mw-career-readiness__value">{readiness.total ? `${readiness.percent} %` : '–'}</strong>
      </div>
      <ProgressBar value={readiness.percent} label={`Bereitschaft für ${title}: ${readiness.percent} Prozent`} />
    </div>
  );
}

/** Link zum nächsten empfohlenen Lernmodul */
export function NextStep({ readiness }: { readiness: Readiness }) {
  const { Link } = useUi();
  if (!readiness.next) {
    return readiness.total ? (
      <p className="mw-small mw-career-done">
        <Icon name="check" size={14} /> Alle geforderten Lernmodule abgeschlossen.
      </p>
    ) : null;
  }
  return (
    <p className="mw-small mw-career-next">
      <span className="mw-muted">Empfohlen als Nächstes: </span>
      <Link to={pathItemLink(readiness.next)}>
        <Icon name="play" size={12} /> {readiness.next.title}
      </Link>
    </p>
  );
}

/** Geordneter Lernpfad mit Status und Links */
export function LearningPath({ items, progress, loggedIn }: { items: PathItem[]; progress: Map<string, ProgressEntry>; loggedIn: boolean }) {
  const { Link } = useUi();
  if (!items.length) return <p className="mw-muted mw-small">Für dieses Berufsbild ist noch kein Lernpfad hinterlegt.</p>;
  return (
    <ol className="mw-career-path">
      {items.map((it, i) => {
        const def = ENTITY_TYPE_DEFS[it.type];
        const status = itemStatus(it.id, progress);
        const isModule = it.type === 'learning_module';
        return (
          <li key={it.id} className={`mw-career-path__item is-${loggedIn ? status : 'open'}`}>
            <span className="mw-career-path__step" aria-hidden>
              {loggedIn && status === 'completed' ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <div className="mw-career-path__body">
              <div className="mw-row" style={{ gap: 6 }}>
                <span className="mw-small mw-muted">
                  <Icon name={def.icon} size={12} /> {def.label}
                </span>
                {loggedIn ? <StatusBadge status={status} /> : null}
              </div>
              <Link to={pathItemLink(it)} className="mw-career-path__title">
                {it.title}
              </Link>
              {it.note ? <div className="mw-small mw-muted">{it.note}</div> : null}
              {isModule ? (
                <Link to={entityPath(it.id)} className="mw-small">
                  Details zum Lernmodul
                </Link>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
