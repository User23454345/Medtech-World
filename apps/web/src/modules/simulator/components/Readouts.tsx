import { Icon } from '@medtech/ui';
import type { Check, Readout, SimResult } from '../engines/types.ts';

const STATUS_TEXT = { ok: 'normal', warn: 'Warnung', alarm: 'Alarm' } as const;

export function Readouts({ readouts }: { readouts: Readout[] }) {
  return (
    <dl className="mw-simulator-readouts">
      {readouts.map((r) => (
        <div key={r.label} className={`mw-simulator-readout mw-simulator-readout--${r.status}`} title={r.hint}>
          <dt>{r.label}</dt>
          <dd>
            <span className="mw-simulator-readout__value">{r.value}</span>
            {r.unit ? <span className="mw-simulator-readout__unit"> {r.unit}</span> : null}
            <span className="mw-visually-hidden"> – Status: {STATUS_TEXT[r.status]}</span>
          </dd>
          {r.hint ? <dd className="mw-simulator-readout__hint">{r.hint}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Alarmleiste: Änderungen werden höflich von Screenreadern angesagt */
export function AlarmBanner({ alarms }: { alarms: string[] }) {
  return (
    <div className={`mw-simulator-alarms ${alarms.length ? 'mw-simulator-alarms--active' : ''}`} role="status" aria-live="polite" aria-atomic="true">
      <Icon name={alarms.length ? 'alert' : 'check'} />
      {alarms.length ? (
        <ul className="mw-list-plain">
          {alarms.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      ) : (
        <span>Keine Alarme</span>
      )}
    </div>
  );
}

const RESULT_TEXT: Record<Check['result'], string> = { pass: 'bestanden', fail: 'nicht bestanden', na: 'nicht gefordert' };

export function ChecksTable({ result }: { result: SimResult }) {
  if (!result.checks) return null;
  return (
    <div className="mw-stack">
      <div className="mw-table-wrap">
        <table className="mw-table mw-simulator-checks">
          <caption className="mw-visually-hidden">Prüfergebnisse</caption>
          <thead>
            <tr>
              <th scope="col">Prüfung</th>
              <th scope="col">Messwert</th>
              <th scope="col">Grenzwert</th>
              <th scope="col">Ergebnis</th>
            </tr>
          </thead>
          <tbody>
            {result.checks.map((c) => (
              <tr key={c.id} className={`mw-simulator-check--${c.result}`}>
                <th scope="row">
                  {c.label}
                  {c.note ? <div className="mw-muted mw-small">{c.note}</div> : null}
                </th>
                <td>
                  {c.measured} {c.measured !== '–' ? c.unit : ''}
                </td>
                <td>
                  {c.limit} {c.result !== 'na' ? c.unit : ''}
                </td>
                <td>
                  <span className={`mw-badge mw-badge--${c.result === 'pass' ? 'ok' : c.result === 'fail' ? 'danger' : 'info'}`}>
                    <Icon name={c.result === 'pass' ? 'check' : c.result === 'fail' ? 'x' : 'info'} size={12} />
                    {RESULT_TEXT[c.result]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.verdict ? (
        <div className={`mw-simulator-verdict mw-simulator-verdict--${result.verdict.pass ? 'pass' : 'fail'}`} role="status" aria-live="polite">
          <Icon name={result.verdict.pass ? 'check' : 'alert'} size={22} />
          <div>
            <strong>Gesamtbewertung</strong>
            <div>{result.verdict.text}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
