import { useId, useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import {
  ENTITY_TYPE_DEFS,
  MODULES,
  entityPath,
  type EntitySummary,
  type ModuleId,
  type QualityFlag,
  type RelationGroup,
  type SourceKind,
  type SourceRef,
  type SpecRow,
} from '@medtech/core';
import { useUi } from './context.tsx';
import { Icon, type IconName } from './icons.tsx';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ------------------------------------------------------------------ Buttons
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type BtnSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: IconName;
  iconOnly?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon, iconOnly, className, children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={cx('mw-btn', `mw-btn--${variant}`, size !== 'md' && `mw-btn--${size}`, iconOnly && 'mw-btn--icon', className)} {...rest}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 18} /> : null}
      {iconOnly ? <span className="mw-visually-hidden">{children}</span> : children}
    </button>
  );
}

export function ButtonLink({ to, variant = 'secondary', size = 'md', icon, children, className }: { to: string; variant?: BtnVariant; size?: BtnSize; icon?: IconName; children: ReactNode; className?: string }) {
  const { Link } = useUi();
  return (
    <Link to={to} className={cx('mw-btn', `mw-btn--${variant}`, size !== 'md' && `mw-btn--${size}`, className)}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 18} /> : null}
      {children}
    </Link>
  );
}

// ------------------------------------------------------------------ Layout-Bausteine
export function Card({ children, className, interactive, flush, style, as: As = 'div' }: { children: ReactNode; className?: string; interactive?: boolean; flush?: boolean; style?: CSSProperties; as?: 'div' | 'section' | 'article' | 'aside' }) {
  return (
    <As className={cx('mw-card', interactive && 'mw-card--interactive', flush && 'mw-card--flush', className)} style={style}>
      {children}
    </As>
  );
}

export function PageHeader({ title, lead, eyebrow, actions }: { title: ReactNode; lead?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mw-page-header">
      {eyebrow ? <div className="mw-page-header__eyebrow">{eyebrow}</div> : null}
      <div className="mw-spread" style={{ alignItems: 'flex-start' }}>
        <h1 className="mw-page-header__title">{title}</h1>
        {actions ? <div className="mw-row">{actions}</div> : null}
      </div>
      {lead ? <p className="mw-page-header__lead">{lead}</p> : null}
    </header>
  );
}

export function Section({ title, icon, actions, children, id }: { title?: ReactNode; icon?: IconName; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="mw-section" id={id} aria-labelledby={id ? `${id}-title` : undefined}>
      {title ? (
        <div className="mw-spread">
          <h2 className="mw-section__title" id={id ? `${id}-title` : undefined}>
            {icon ? <Icon name={icon} /> : null}
            {title}
          </h2>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Einheitlicher Kopfbereich jeder Modul-Startseite */
export function ModuleHero({ module, children, title, lead }: { module: ModuleId; title?: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  const m = MODULES[module];
  return (
    <div className="mw-hero" style={{ '--mw-hero-accent': m.accent } as CSSProperties}>
      <div className="mw-row" style={{ marginBottom: 8, opacity: 0.9 }}>
        <Icon name={m.icon} size={22} />
        <strong>{m.name}</strong>
      </div>
      <h1>{title ?? m.name}</h1>
      <p>{lead ?? m.tagline}</p>
      {children}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  const { Link } = useUi();
  return (
    <nav className="mw-breadcrumbs" aria-label="Brotkrumen">
      {items.map((it, i) => (
        <span key={i} className="mw-row" style={{ gap: 6 }}>
          {i > 0 ? <Icon name="chevron-right" size={12} /> : null}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------------ Badges
export function Badge({ children, tone, icon, style, title }: { children: ReactNode; tone?: 'ok' | 'warn' | 'danger' | 'demo' | 'info' | 'accent'; icon?: IconName; style?: CSSProperties; title?: string }) {
  return (
    <span className={cx('mw-badge', tone && `mw-badge--${tone}`)} style={style} title={title}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}

export function TypeBadge({ type }: { type: EntitySummary['type'] }) {
  const def = ENTITY_TYPE_DEFS[type];
  const mod = MODULES[def.homeModule];
  return (
    <Badge icon={def.icon} style={{ color: mod.accent, borderColor: 'currentColor', background: 'transparent' }}>
      {def.label}
    </Badge>
  );
}

export function ModuleBadge({ module, link }: { module: ModuleId; link?: boolean }) {
  const { Link } = useUi();
  const m = MODULES[module];
  const badge = (
    <Badge tone="accent" icon={m.icon} style={{ background: m.accent }}>
      {m.shortName}
    </Badge>
  );
  return link ? <Link to={m.path}>{badge}</Link> : badge;
}

const FLAG_UI: Record<QualityFlag['kind'], { tone: 'demo' | 'warn' | 'danger' | 'info'; label: string; icon: IconName }> = {
  demo: { tone: 'demo', label: 'Demo', icon: 'info' },
  draft: { tone: 'info', label: 'Entwurf', icon: 'edit' },
  outdated: { tone: 'warn', label: 'Prüfung fällig', icon: 'history' },
  'legal-review-due': { tone: 'warn', label: 'Rechtsstand prüfen', icon: 'scale' },
  superseded: { tone: 'danger', label: 'Nicht mehr gültig', icon: 'alert' },
  contradiction: { tone: 'danger', label: 'Widerspruch', icon: 'alert' },
};

/** Kompakte Qualitätskennzeichen (Karten, Listen) */
export function QualityBadges({ flags, reviewStatus }: { flags: QualityFlag[]; reviewStatus?: string }) {
  const kinds = [...new Set(flags.map((f) => f.kind))];
  return (
    <>
      {kinds.map((k) => (
        <Badge key={k} tone={FLAG_UI[k].tone} icon={FLAG_UI[k].icon} title={flags.find((f) => f.kind === k)?.message}>
          {FLAG_UI[k].label}
        </Badge>
      ))}
      {reviewStatus === 'geprueft' && kinds.length === 0 ? (
        <Badge tone="ok" icon="check" title="Fachlich geprüft, mit Quellen belegt">
          Geprüft
        </Badge>
      ) : null}
    </>
  );
}

/** Ausführliche Qualitätshinweise (Detailseiten) */
export function QualityNotices({ flags }: { flags: QualityFlag[] }) {
  if (!flags.length) return null;
  return (
    <div className="mw-stack" style={{ gap: 8 }} role="note" aria-label="Qualitätshinweise">
      {flags.map((f, i) => (
        <Alert key={i} tone={FLAG_UI[f.kind].tone === 'danger' ? 'danger' : FLAG_UI[f.kind].tone === 'demo' ? 'demo' : FLAG_UI[f.kind].tone === 'info' ? 'info' : 'warn'} icon={FLAG_UI[f.kind].icon}>
          <strong>{FLAG_UI[f.kind].label}:</strong> {f.message}
        </Alert>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Alerts, Status
export function Alert({ tone = 'info', icon, children, role }: { tone?: 'info' | 'warn' | 'danger' | 'demo' | 'ok'; icon?: IconName; children: ReactNode; role?: string }) {
  const defaults: Record<string, IconName> = { info: 'info', warn: 'alert', danger: 'alert', demo: 'info', ok: 'check' };
  return (
    <div className={cx('mw-alert', `mw-alert--${tone}`)} role={role}>
      <span className="mw-alert__icon">
        <Icon name={icon ?? defaults[tone]!} />
      </span>
      <div>{children}</div>
    </div>
  );
}

export function Loading({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="mw-loading" role="status" aria-live="polite">
      <div className="mw-spinner" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, children, icon = 'search' }: { title: string; children?: ReactNode; icon?: IconName }) {
  return (
    <div className="mw-empty">
      <Icon name={icon} size={32} />
      <p style={{ fontWeight: 600, marginTop: 8 }}>{title}</p>
      {children}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <Alert tone="danger" role="alert">
      <div className="mw-spread">
        <span>{msg}</span>
        {onRetry ? (
          <Button size="sm" onClick={onRetry} icon="reset">
            Erneut versuchen
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="mw-progress" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="mw-progress__bar" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="mw-stat">
      <span className="mw-stat__value">{value}</span>
      <span className="mw-stat__label">{label}</span>
    </div>
  );
}

// ------------------------------------------------------------------ Entity-Karten
export function EntityCard({ entity, footer, compact }: { entity: EntitySummary; footer?: ReactNode; compact?: boolean }) {
  const { Link } = useUi();
  const def = ENTITY_TYPE_DEFS[entity.type];
  const mod = MODULES[def.homeModule];
  return (
    <Card interactive className="mw-entity-card-wrap" style={{ padding: compact ? 14 : 18, position: 'relative' }}>
      <Link to={entityPath(entity.id)} className="mw-entity-card" aria-label={`${def.label}: ${entity.title}`}>
        <span className="mw-entity-card__accent" style={{ background: mod.accent }} aria-hidden />
        <div className="mw-entity-card__head">
          {entity.thumbnail && !compact ? <img className="mw-entity-card__thumb" src={entity.thumbnail} alt="" loading="lazy" /> : null}
          <div style={{ minWidth: 0 }}>
            <div className="mw-row" style={{ gap: 6, marginBottom: 6 }}>
              <TypeBadge type={entity.type} />
            </div>
            <div className="mw-entity-card__title">{entity.title}</div>
          </div>
        </div>
        {!compact ? <p className="mw-entity-card__summary">{entity.summary}</p> : null}
        <div className="mw-entity-card__foot">
          <QualityBadges flags={entity.flags} reviewStatus={entity.reviewStatus} />
          {footer}
        </div>
      </Link>
    </Card>
  );
}

export function EntityGrid({ items, min = 260, compact, empty = 'Keine Einträge vorhanden.' }: { items: EntitySummary[]; min?: number; compact?: boolean; empty?: string }) {
  if (!items.length) return <EmptyState title={empty} icon="layers" />;
  return (
    <div className="mw-grid" style={{ '--mw-grid-min': `${min}px` } as CSSProperties}>
      {items.map((e) => (
        <EntityCard key={e.id} entity={e} compact={compact} />
      ))}
    </div>
  );
}

export function EntityChip({ entity }: { entity: Pick<EntitySummary, 'id' | 'type' | 'title' | 'demo'> }) {
  const { Link } = useUi();
  const def = ENTITY_TYPE_DEFS[entity.type];
  return (
    <Link to={entityPath(entity.id)} className="mw-chip-link" title={def.label}>
      <Icon name={def.icon} size={14} style={{ color: MODULES[def.homeModule].accent }} />
      {entity.title}
      {entity.demo ? <Badge tone="demo">Demo</Badge> : null}
    </Link>
  );
}

// ------------------------------------------------------------------ Technische Daten, Quellen, Relationen
const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  norm: 'Norm',
  gesetz: 'Gesetz/Verordnung',
  behoerde: 'Behörde',
  hersteller: 'Hersteller',
  fachliteratur: 'Fachliteratur',
  wissenschaft: 'Wissenschaft',
  verband: 'Verband',
  intern: 'Redaktion',
};

export function SourceLabel({ source }: { source: SourceRef }) {
  return (
    <span>
      {source.url ? (
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          {source.title} <Icon name="external" size={12} />
        </a>
      ) : (
        source.title
      )}
      <span className="mw-muted">
        {' '}
        – {source.publisher}
        {source.edition ? `, ${source.edition}` : ''}
      </span>
    </span>
  );
}

export function SourceList({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return <p className="mw-muted mw-small">Keine Quellen hinterlegt.</p>;
  return (
    <ol className="mw-source-list">
      {sources.map((s) => (
        <li key={s.id} id={`quelle-${s.id.slice(4)}`}>
          <Badge>{SOURCE_KIND_LABEL[s.kind]}</Badge>
          <SourceLabel source={s} />
        </li>
      ))}
    </ol>
  );
}

export function SpecTable({ specs }: { specs: SpecRow[] }) {
  if (!specs.length) return null;
  return (
    <div className="mw-table-wrap">
      <table className="mw-table">
        <thead>
          <tr>
            <th scope="col">Merkmal</th>
            <th scope="col">Wert</th>
            <th scope="col">Quelle</th>
          </tr>
        </thead>
        <tbody>
          {specs.map((s, i) => (
            <tr key={`${s.key}-${i}`}>
              <td>
                {s.label}
                {s.condition ? <div className="mw-muted mw-small">{s.condition}</div> : null}
              </td>
              <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                {typeof s.value === 'number' ? s.value.toLocaleString('de-DE') : s.value}
                {s.unit ? ` ${s.unit}` : ''}
                {s.note ? <div className="mw-muted mw-small" style={{ fontWeight: 400, whiteSpace: 'normal' }}>{s.note}</div> : null}
              </td>
              <td className="mw-small">
                <SourceLabel source={s.source} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RelationGroups({ groups, exclude = [] }: { groups: RelationGroup[]; exclude?: string[] }) {
  const visible = groups.filter((g) => !exclude.includes(`${g.rel}:${g.direction}`) && g.items.length);
  if (!visible.length) return <p className="mw-muted mw-small">Keine Verknüpfungen.</p>;
  return (
    <div>
      {visible.map((g) => (
        <div key={`${g.rel}-${g.direction}`} className="mw-relation-group">
          <div className="mw-relation-group__label">{g.label}</div>
          <div className="mw-row" style={{ gap: 6 }}>
            {g.items.map((it) => (
              <EntityChip key={it.id} entity={it} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Tabs
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<{ id: T; label: ReactNode }>; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="mw-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" className="mw-tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Formulare
export function Field({ label, hint, children, error }: { label: string; hint?: ReactNode; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="mw-field">
      <label className="mw-label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint ? <span className="mw-muted mw-small">{hint}</span> : null}
      {error ? <span className="mw-small" style={{ color: 'var(--mw-danger)' }} role="alert">{error}</span> : null}
    </div>
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={cx('mw-input', props.className)} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={cx('mw-select', props.className)} />;
export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={cx('mw-textarea', props.className)} />;

/** Einklappbarer Bereich */
export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" className="mw-btn mw-btn--ghost" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ paddingLeft: 0 }}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
        {summary}
      </button>
      {open ? <div style={{ marginTop: 8 }}>{children}</div> : null}
    </div>
  );
}
