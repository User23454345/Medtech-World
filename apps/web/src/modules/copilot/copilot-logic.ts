/**
 * Reine Hilfsfunktionen des MedTech Copilot (ohne React, unit-getestet).
 */
import { isEntityId } from '@medtech/core';

export type AnswerToken = { t: 'text'; v: string } | { t: 'cite'; index: number };

/** Belegmarker [1], [12] – aber nicht als Markdown-Link [1](…) und nicht als Wiki-Link [[…]] */
const CITE = /(?<!\[)\[(\d{1,3})\](?![(\]])/g;

/**
 * Bereiche, in denen Marker nicht aufgetrennt werden dürfen, weil sonst
 * Inline-Markdown (**fett**, `code`, [Text](url), [[wiki]]) zerbrechen würde.
 */
const PROTECTED = /\*\*[^*]+\*\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)\s]+\)/g;

function protectedRanges(text: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of text.matchAll(PROTECTED)) out.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return out;
}

/**
 * Zerlegt Antworttext in Text- und Beleg-Token.
 * Nur Marker, deren Nummer in `valid` enthalten ist (falls angegeben), werden zu Belegen;
 * andere bleiben unverändert Text. Benachbarte Text-Token werden zusammengeführt.
 */
export function splitCitations(text: string, valid?: Iterable<number>): AnswerToken[] {
  const allowed = valid ? new Set(valid) : null;
  const ranges = protectedRanges(text);
  const out: AnswerToken[] = [];
  const pushText = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last?.t === 'text') last.v += v;
    else out.push({ t: 'text', v });
  };
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    const idx = m.index ?? 0;
    const n = Number(m[1]);
    const inProtected = ranges.some(([a, b]) => idx >= a && idx < b);
    if (inProtected || (allowed && !allowed.has(n))) continue;
    pushText(text.slice(last, idx));
    out.push({ t: 'cite', index: n });
    last = idx + m[0].length;
  }
  pushText(text.slice(last));
  return out;
}

/** Im Text tatsächlich zitierte Belegnummern in Reihenfolge des ersten Auftretens */
export function citedIndices(text: string, valid?: Iterable<number>): number[] {
  const seen: number[] = [];
  for (const tok of splitCitations(text, valid)) if (tok.t === 'cite' && !seen.includes(tok.index)) seen.push(tok.index);
  return seen;
}

/** Validiert den Query-Parameter ?kontext=<typ:slug> */
export function parseContextParam(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v && isEntityId(v) ? v : null;
}

export const QUESTION_MIN = 2;
export const QUESTION_MAX = 1000;

/** Prüft die Eingabe vor dem Senden; liefert eine Fehlermeldung oder null */
export function validateQuestion(q: string): string | null {
  const t = q.trim();
  if (t.length < QUESTION_MIN) return 'Bitte eine Frage mit mindestens zwei Zeichen eingeben.';
  if (t.length > QUESTION_MAX) return `Die Frage ist zu lang (höchstens ${QUESTION_MAX} Zeichen).`;
  return null;
}

/**
 * Grobe Heuristik für mögliche Patientendaten (Geburtsdatum, Versichertennummer,
 * Hinweise wie „Patient Herr Müller“). Dient nur einem Warnhinweis – keine Garantie.
 */
export function looksLikePatientData(q: string): boolean {
  const t = q.toLowerCase();
  if (/\b(geb\.|geboren am|geburtsdatum|versichertennummer|krankenversichertennummer|patienten-?id|fallnummer)\b/.test(t)) return true;
  if (/\b\d{1,2}\.\d{1,2}\.(19|20)\d{2}\b/.test(t)) return true;
  if (/\b[a-z]\d{9}\b/i.test(q)) return true; // Format der eGK-Versichertennummer
  if (/\b(patient(in)?|pat\.)\s+(herr|frau)\s+[A-ZÄÖÜ]/i.test(q)) return true;
  return false;
}

/** DOM-ID einer Belegkarte innerhalb eines Gesprächsbeitrags */
export function citationAnchor(turnId: number, index: number): string {
  return `mw-copilot-beleg-${turnId}-${index}`;
}
