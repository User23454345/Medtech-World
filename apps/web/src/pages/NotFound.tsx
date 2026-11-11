import { ButtonLink, EmptyState } from '@medtech/ui';
import { useDocumentTitle } from '../lib/hooks.ts';

export function NotFound({ what = 'Seite' }: { what?: string }) {
  useDocumentTitle('Nicht gefunden');
  return (
    <div className="mw-container mw-page">
      <EmptyState title={`${what} nicht gefunden`} icon="alert">
        <p>Der Link ist möglicherweise veraltet oder der Inhalt wurde zusammengeführt.</p>
        <div className="mw-row" style={{ justifyContent: 'center' }}>
          <ButtonLink to="/" variant="primary" icon="home">
            Zur Startseite
          </ButtonLink>
          <ButtonLink to="/suche" icon="search">
            Suchen
          </ButtonLink>
        </div>
      </EmptyState>
    </div>
  );
}
