import { useState } from 'react';
import { Link } from 'react-router';
import { entityPath, summarizeIssues, type QualityIssue } from '@medtech/core';
import { Alert, Badge, Card, ErrorState, Input, Loading, PageHeader, Section, SourceLabel, Stat, Tabs } from '@medtech/ui';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useAsync, useDocumentTitle } from '../lib/hooks.ts';

/** Qualitätssicherungs-Dashboard für die Redaktion */
export function QualityPage() {
  const { can } = useAuth();
  useDocumentTitle('Qualitätssicherung');
  const report = useAsync(() => api.quality(), [], can('quality:read') ? 'quality' : null);
  const [tab, setTab] = useState<'error' | 'warning' | 'info'>('warning');
  if (!can('quality:read')) {
    return (
      <div className="mw-container mw-page">
        <Alert tone="danger">Nur für die Redaktion. Bitte mit einem Redaktionskonto anmelden.</Alert>
      </div>
    );
  }
  const s = report.data ? summarizeIssues(report.data.issues) : null;
  const byCode = new Map<string, QualityIssue[]>();
  for (const i of report.data?.issues.filter((i) => i.severity === tab) ?? []) byCode.set(i.code, [...(byCode.get(i.code) ?? []), i]);
  return (
    <div className="mw-container mw-page">
      <PageHeader
        title="Qualitätssicherung der Datenbasis"
        lead="Automatische Prüfung bei jedem Laden der Inhalte: Schema, Dubletten, widersprüchliche technische Angaben, Belege, Rechtsstand und Verlinkungen."
      />
      {report.loading ? <Loading /> : report.error ? <ErrorState error={report.error} /> : report.data && s ? (
        <>
          <div className="mw-grid" style={{ '--mw-grid-min': '160px' } as React.CSSProperties}>
            <Card><Stat value={report.data.counts.entities} label="Inhalte" /></Card>
            <Card><Stat value={report.data.counts.relations} label="Verknüpfungen" /></Card>
            <Card><Stat value={report.data.counts.specs} label="belegte technische Angaben" /></Card>
            <Card><Stat value={report.data.counts.sources} label="Quellen" /></Card>
            <Card><Stat value={s.errors} label="Fehler" /></Card>
            <Card><Stat value={s.warnings} label="Warnungen" /></Card>
          </div>
          <p className="mw-small mw-muted" style={{ marginTop: 8 }}>Stand: {new Date(report.data.generatedAt).toLocaleString('de-DE')}</p>
          <Section title="Befunde">
            <Tabs
              label="Schweregrad"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: 'error', label: `Fehler (${s.errors})` },
                { id: 'warning', label: `Warnungen (${s.warnings})` },
                { id: 'info', label: `Hinweise (${s.infos})` },
              ]}
            />
            {byCode.size === 0 ? <Alert tone="ok">Keine Befunde in dieser Kategorie.</Alert> : null}
            {[...byCode.entries()].map(([code, list]) => (
              <Card key={code} style={{ marginBottom: 12 }}>
                <h3 className="mw-card__title">
                  <code>{code}</code> <Badge>{list.length}</Badge>
                </h3>
                <ul className="mw-small">
                  {list.map((i, n) => (
                    <li key={n}>
                      {i.entityId ? <Link to={entityPath(i.entityId)}>{i.entityId}</Link> : i.sourceId ?? i.file}: {i.message}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </Section>
        </>
      ) : null}
    </div>
  );
}

/** Öffentliches Quellenverzeichnis – Nachvollziehbarkeit aller Angaben */
export function SourcesPage() {
  useDocumentTitle('Quellenverzeichnis');
  const sources = useAsync(() => api.sources(), [], 'sources');
  const [q, setQ] = useState('');
  const items = (sources.data?.items ?? []).filter((s) => `${s.title} ${s.publisher}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mw-container mw-page">
      <PageHeader title="Quellenverzeichnis" lead="Alle Normen, Rechtsquellen, Herstellerangaben und Fachliteratur, auf die sich Inhalte der Plattform stützen." />
      <div style={{ maxWidth: 420, marginBottom: 16 }}>
        <Input type="search" placeholder="Quellen filtern …" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Quellen filtern" />
      </div>
      {sources.loading ? <Loading /> : (
        <div className="mw-table-wrap">
          <table className="mw-table">
            <thead><tr><th>Quelle</th><th>Art</th><th>Erfasst</th></tr></thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td><SourceLabel source={s} /></td>
                  <td><Badge>{s.kind}</Badge></td>
                  <td className="mw-small">{new Date(s.accessedAt).toLocaleDateString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AboutPage() {
  useDocumentTitle('Über & Qualitätsgrundsätze');
  return (
    <div className="mw-container mw-page mw-prose">
      <PageHeader title="Über MedTech World" lead="Eine integrierte Plattform statt einer Sammlung unverbundener Webseiten." />
      <h2>Architektur in einem Satz</h2>
      <p>
        Alle acht Module nutzen dieselbe Benutzeroberfläche, dieselbe Nutzerverwaltung und <strong>eine zentrale Datenbasis</strong>, in der jedes Gerät, jeder
        Hersteller und jeder Fachbegriff genau einmal existiert und mit allen zugehörigen Inhalten verknüpft ist.
      </p>
      <h2>Qualitätsgrundsätze</h2>
      <ul>
        <li><strong>Nachvollziehbarkeit:</strong> Jede technische Angabe hat eine Quelle; das <Link to="/quellen">Quellenverzeichnis</Link> ist öffentlich.</li>
        <li><strong>Keine Dubletten:</strong> Neue Inhalte werden automatisch auf gleiche Namen, Aliase und Quellen-URLs geprüft.</li>
        <li><strong>Keine Widersprüche:</strong> Abweichende Werte für dasselbe Merkmal unter gleicher Bedingung blockieren die Veröffentlichung.</li>
        <li><strong>Keine unbelegten Herstellerangaben:</strong> Angaben zu realen Herstellern und Produkten benötigen eine Hersteller- oder Behördenquelle. Fiktive Beispiele sind als <em>Demo</em> gekennzeichnet.</li>
        <li><strong>Rechtsstand mit Datum:</strong> Rechtsgrundlagen tragen ein Prüfdatum; ist es abgelaufen oder die Vorschrift ersetzt, wird das sichtbar gekennzeichnet – auch bei allen Inhalten, die darauf beruhen.</li>
        <li><strong>Keine toten Links:</strong> Interne Verknüpfungen werden bei jedem Laden geprüft, externe Quellen-URLs in der Continuous Integration.</li>
      </ul>
      <h2>Wichtiger Hinweis</h2>
      <p>
        MedTech World ist eine Lern- und Informationsplattform. Sie ersetzt weder Gebrauchsanweisungen und Serviceunterlagen der Hersteller noch die
        Einweisung nach MPBetreibV oder die Bewertung durch befugtes Fachpersonal.
      </p>
    </div>
  );
}

export function PrivacyPage() {
  useDocumentTitle('Datenschutz');
  return (
    <div className="mw-container mw-page mw-prose">
      <PageHeader title="Datenschutzhinweise" lead="Datensparsam by Design: Ein Konto ist nur für persönliche Funktionen nötig." />
      <h2>Welche Daten wir speichern</h2>
      <ul>
        <li>Konto: E-Mail-Adresse, Anzeigename, Passwort-Hash (scrypt), Rolle</li>
        <li>Persönliche Funktionen: Favoriten, Lernfortschritt, Notizen, Einstellungen, Market-Anfragen</li>
        <li>Lernhistorie: nur wenn in den Einstellungen aktiviert; abschaltbar und jederzeit löschbar</li>
        <li>Sitzungs-Cookie (httpOnly) zur Anmeldung – keine Tracking- oder Werbe-Cookies</li>
      </ul>
      <h2>Deine Rechte</h2>
      <p>Auskunft und Datenübertragbarkeit (Export als JSON) sowie Löschung des Kontos stehen dir jederzeit unter „Einstellungen & Datenschutz“ zur Verfügung.</p>
      <h2>Copilot</h2>
      <p>
        Fragen an den Copilot werden nicht deinem Konto zugeordnet gespeichert. Ist ein Sprachmodell angebunden, wird die Frage zusammen mit Auszügen aus der
        Wissensbasis an den Modellanbieter übermittelt. Gib daher keine Patientendaten ein.
      </p>
    </div>
  );
}
