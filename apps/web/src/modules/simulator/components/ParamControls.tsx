import { useId } from 'react';
import { Select } from '@medtech/ui';
import type { ParamDef, ParamValue, Params } from '../engines/types.ts';

function decimals(step = 1) {
  const s = String(step);
  return s.includes('.') ? s.split('.')[1]!.length : 0;
}

function NumberControl({ def, value, onChange }: { def: ParamDef; value: number; onChange: (v: number) => void }) {
  const id = useId();
  const d = decimals(def.step);
  const commit = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    if (Number.isFinite(n)) onChange(Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n)));
  };
  return (
    <div className="mw-simulator-param">
      <div className="mw-spread">
        <label className="mw-label" htmlFor={id}>
          {def.label}
        </label>
        <span className="mw-simulator-param__value">
          <input
            className="mw-input mw-simulator-param__number"
            type="number"
            inputMode="decimal"
            min={def.min}
            max={def.max}
            step={def.step}
            value={Number(value.toFixed(d))}
            onChange={(e) => commit(e.target.value)}
            aria-label={`${def.label} als Zahl${def.unit ? ` in ${def.unit}` : ''}`}
          />
          {def.unit ? <span className="mw-muted mw-small">{def.unit}</span> : null}
        </span>
      </div>
      <input
        id={id}
        className="mw-range"
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${value.toLocaleString('de-DE', { maximumFractionDigits: d })}${def.unit ? ` ${def.unit}` : ''}`}
      />
      {def.hint ? <span className="mw-muted mw-small">{def.hint}</span> : null}
    </div>
  );
}

/** Bedienelemente, automatisch aus den Parameterdefinitionen der Engine erzeugt */
export function ParamControls({ defs, params, onChange }: { defs: ParamDef[]; params: Params; onChange: (key: string, value: ParamValue) => void }) {
  const selectId = useId();
  return (
    <div className="mw-simulator-params">
      {defs
        .filter((d) => !d.visibleIf || d.visibleIf(params))
        .map((def) => {
          const v = params[def.key];
          if (def.type === 'number') return <NumberControl key={def.key} def={def} value={typeof v === 'number' ? v : 0} onChange={(n) => onChange(def.key, n)} />;
          if (def.type === 'boolean')
            return (
              <div key={def.key} className="mw-simulator-param">
                <label className="mw-checkbox">
                  <input type="checkbox" checked={v === true} onChange={(e) => onChange(def.key, e.target.checked)} />
                  {def.label}
                </label>
                {def.hint ? <span className="mw-muted mw-small">{def.hint}</span> : null}
              </div>
            );
          return (
            <div key={def.key} className="mw-simulator-param">
              <label className="mw-label" htmlFor={`${selectId}-${def.key}`}>
                {def.label}
              </label>
              <Select id={`${selectId}-${def.key}`} value={String(v ?? '')} onChange={(e) => onChange(def.key, e.target.value)}>
                {(def.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {def.hint ? <span className="mw-muted mw-small">{def.hint}</span> : null}
            </div>
          );
        })}
    </div>
  );
}
