import { Badge, type IconName } from '@medtech/ui';

export type ProgressStatusKey = 'completed' | 'started' | 'open';

/** Einheitliche Bezeichnung, Farbe und Symbol für Lernfortschritt – überall gleich verwenden. */
export const PROGRESS_STATUS_UI: Record<ProgressStatusKey, { label: string; tone?: 'ok' | 'info'; icon: IconName }> = {
  completed: { label: 'Abgeschlossen', tone: 'ok', icon: 'check' },
  started: { label: 'Begonnen', tone: 'info', icon: 'history' },
  open: { label: 'Offen', icon: 'target' },
};

export function ProgressStatusBadge({ status, score }: { status: ProgressStatusKey; score?: number | null }) {
  const s = PROGRESS_STATUS_UI[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {s.label}
      {score != null ? ` · ${score} %` : ''}
    </Badge>
  );
}
