import Anthropic from '@anthropic-ai/sdk';
import { ENTITY_TYPE_DEFS, type CopilotAnswer, type CopilotCitation, type EntityDetail } from '@medtech/core';
import type { DataLayer } from '@medtech/data';
import type { AppConfig } from './config.ts';

/**
 * MedTech Copilot – beantwortet Fragen ausschließlich auf Basis der geprüften
 * Wissensbasis (Retrieval-Augmented Generation) und belegt jede Aussage mit
 * Verweisen auf Plattforminhalte und deren Quellen.
 *
 * Ohne ANTHROPIC_API_KEY arbeitet der Copilot im reinen Retrieval-Modus:
 * Er zeigt die passendsten Inhalte samt Kerndaten – ohne generierten Text.
 */

const DISCLAIMER =
  'Der Copilot ersetzt weder die Gebrauchsanweisung bzw. Serviceunterlagen des Herstellers noch die Bewertung durch befugtes Fachpersonal. Maßgeblich sind die verlinkten Primärquellen.';

const STOPWORDS = new Set(
  'der die das ein eine einer eines einem einen und oder aber wie was wer wo wann warum wieso weshalb welche welcher welches ist sind war wird werden wurde kann können muss müssen soll sollte darf bei beim mit von vom zu zum zur im in an am auf aus für über unter nach vor durch ich du er sie es wir ihr man mir mich dir dich sich nicht kein keine auch noch nur schon sehr mehr gibt geht funktioniert funktionieren erklär erkläre erklären bitte mal denn dann dass als so ob einem'.split(
    ' ',
  ),
);

export function keywords(question: string): string {
  return (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 1 && !STOPWORDS.has(w)).join(' ');
}

function renderDocument(index: number, e: EntityDetail): string {
  const lines = [
    `<dokument index="${index}" id="${e.id}" typ="${ENTITY_TYPE_DEFS[e.type].label}" titel="${e.title}">`,
    `Zusammenfassung: ${e.summary}`,
  ];
  if (e.demo) lines.push('HINWEIS: Demo-Inhalt mit fiktiven Daten – nicht als reale Herstellerangabe darstellen.');
  for (const f of e.flags) lines.push(`QUALITÄTSHINWEIS: ${f.message}`);
  if (e.specs.length) {
    lines.push('Technische Daten:');
    for (const s of e.specs) {
      lines.push(`- ${s.label}: ${s.value}${s.unit ? ' ' + s.unit : ''}${s.condition ? ` (${s.condition})` : ''} [Quelle: ${s.source.title}]`);
    }
  }
  if (e.body) lines.push(`Text: ${e.body.slice(0, 2500)}`);
  if (e.sources.length) lines.push(`Quellen: ${e.sources.map((s) => `${s.title} (${s.publisher})`).join('; ')}`);
  lines.push('</dokument>');
  return lines.join('\n');
}

export class Copilot {
  private client: Anthropic | null;

  constructor(
    private readonly data: DataLayer,
    private readonly config: AppConfig,
  ) {
    this.client = config.anthropicApiKey ? new Anthropic({ apiKey: config.anthropicApiKey }) : null;
  }

  get mode(): 'llm' | 'retrieval' {
    return this.client ? 'llm' : 'retrieval';
  }

  /** Relevante Inhalte für eine Frage – optional mit Fokus auf eine Entität (z. B. aktuelle Detailseite). */
  retrieve(question: string, contextId?: string, includeDrafts = false): EntityDetail[] {
    const ids: string[] = [];
    if (contextId && this.data.content.exists(contextId, { includeDrafts })) ids.push(contextId);
    const q = keywords(question) || question;
    for (const h of this.data.content.search(q, { limit: 12, includeDrafts }).hits) {
      if (h.type === 'quiz_question' || h.type === 'offer') continue;
      if (!ids.includes(h.id)) ids.push(h.id);
      if (ids.length >= 6) break;
    }
    return ids.map((id) => this.data.content.get(id, { includeDrafts })).filter((e): e is EntityDetail => e !== null);
  }

  async ask(question: string, contextId?: string, includeDrafts = false): Promise<CopilotAnswer> {
    const docs = this.retrieve(question, contextId, includeDrafts);
    const citations: CopilotCitation[] = docs.map((e, i) => ({
      index: i + 1,
      entity: {
        id: e.id,
        type: e.type,
        slug: e.slug,
        title: e.title,
        summary: e.summary,
        tags: e.tags,
        demo: e.demo,
        reviewStatus: e.reviewStatus,
        flags: e.flags,
        thumbnail: e.thumbnail,
      },
      sources: e.sources,
    }));

    if (docs.length === 0) {
      return {
        mode: this.mode,
        answer:
          'Zu dieser Frage habe ich in der geprüften Wissensbasis keine passenden Inhalte gefunden. Versuche es mit einem Fachbegriff (z. B. „SpO2“, „Ableitstrom“, „STK“) oder durchsuche die Plattform über die globale Suche.',
        citations: [],
        disclaimer: DISCLAIMER,
      };
    }

    if (!this.client) return { mode: 'retrieval', answer: this.retrievalAnswer(docs), citations, disclaimer: DISCLAIMER };

    try {
      const answer = await this.llmAnswer(question, docs);
      return { mode: 'llm', answer, citations, disclaimer: DISCLAIMER };
    } catch (e) {
      // Bei API-Fehlern nicht ausfallen, sondern auf belegte Suchergebnisse zurückfallen
      const reason = e instanceof Anthropic.APIError ? `API-Fehler ${e.status ?? ''}`.trim() : 'Sprachmodell nicht erreichbar';
      return {
        mode: 'retrieval',
        answer: `(${reason} – es werden die passenden Inhalte ohne generierte Zusammenfassung angezeigt.)\n\n${this.retrievalAnswer(docs)}`,
        citations,
        disclaimer: DISCLAIMER,
      };
    }
  }

  private retrievalAnswer(docs: EntityDetail[]): string {
    const parts = ['Diese geprüften Inhalte der Wissensbasis passen zu deiner Frage:'];
    docs.slice(0, 4).forEach((e, i) => {
      let p = `**${e.title}** (${ENTITY_TYPE_DEFS[e.type].label}) [${i + 1}]: ${e.summary}`;
      const specs = e.specs.slice(0, 3).map((s) => `${s.label}: ${s.value}${s.unit ? ' ' + s.unit : ''}`);
      if (specs.length) p += `\n  Kerndaten: ${specs.join(' · ')}`;
      if (e.demo) p += '\n  _Demo-Inhalt mit fiktiven Daten._';
      parts.push(p);
    });
    return parts.join('\n\n');
  }

  private async llmAnswer(question: string, docs: EntityDetail[]): Promise<string> {
    const system = [
      'Du bist der MedTech Copilot der Plattform „MedTech World“ – ein fachlich präziser Assistent für Medizintechnik (Ausbildung, Service, Prüfung).',
      'Antworte auf Deutsch, sachlich und gut strukturiert (kurze Absätze oder Aufzählungen, Markdown erlaubt).',
      'Nutze ausschließlich die Informationen aus den bereitgestellten <dokument>-Blöcken. Belege jede fachliche Aussage mit der Dokumentnummer in eckigen Klammern, z. B. [1] oder [2][3].',
      'Wenn die Dokumente die Frage nicht oder nur teilweise beantworten, sag das ausdrücklich, statt Wissen zu ergänzen.',
      'Erfinde keine Grenzwerte, Herstellerangaben, Normen oder Paragraphen. Demo-Inhalte sind als fiktiv zu kennzeichnen. Gib Qualitätshinweise (z. B. fällige Prüfung des Rechtsstands) an die Nutzerin bzw. den Nutzer weiter.',
      'Bei sicherheitsrelevanten Tätigkeiten am Gerät verweise auf Herstellerunterlagen und qualifiziertes Personal.',
    ].join('\n');

    const response = await this.client!.beta.messages.create({
      model: this.config.anthropicModel,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system,
      messages: [
        {
          role: 'user',
          content: `${docs.map((d, i) => renderDocument(i + 1, d)).join('\n\n')}\n\nFrage: ${question}`,
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return 'Diese Anfrage kann der Copilot nicht beantworten. Bitte nutze die verlinkten Inhalte und Quellen.';
    }
    const text = response.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('')
      .trim();
    // Verweise auf nicht existierende Dokumente entfernen
    return text.replace(/\[(\d+)\]/g, (m, n: string) => (Number(n) >= 1 && Number(n) <= docs.length ? m : ''));
  }
}
