# Inhalte & Redaktion

Leitfaden für alle, die Inhalte in MedTech World anlegen oder ändern. Inhalte sind JSON-Dateien unter `content/`, werden per Pull Request geprüft und vor dem Laden automatisch auf Qualität untersucht. Das Datenmodell ist in [datenmodell.md](datenmodell.md) beschrieben.

## 1. Grundsätze

1. **Jede Entität existiert genau einmal.** Vor dem Anlegen suchen (Plattformsuche oder `grep -r "Titel" content/`). Synonyme und Abkürzungen gehören in `aliases`, nicht in eine zweite Entität.
2. **Keine unbelegten Angaben.** Fachliche Aussagen stützen sich auf Quellen; jede technische Angabe (`specs`) hat genau eine Quelle.
3. **Herstellerangaben nur mit Herstellerbeleg.** Reale Hersteller, Produktmodelle und Ersatzteile benötigen mindestens eine Quelle vom Typ `hersteller` oder `behoerde`.
4. **Fiktives ist gekennzeichnet.** Demo-Inhalte tragen `demo: true` und werden nie einem realen Hersteller zugeordnet.
5. **Rechtsstand ist datiert.** Rechtsgrundlagen tragen `verifiedAt` und ein Prüfintervall; nach Ablauf werden sie – und alle darauf beruhenden Inhalte – sichtbar als „Prüfung fällig“ gekennzeichnet.
6. **Sprache:** Deutsch, sachlich, präzise, mit korrekten Umlauten und Fachbegriffen; SI-Einheiten mit Leerzeichen zwischen Zahl und Einheit (`5 mA`, `±2 %`). Keine Handlungsanweisungen, die Herstellerunterlagen oder befugtes Fachpersonal ersetzen.

## 2. Eine Entität hinzufügen

1. **Passende Datei wählen** (thematisch, z. B. `content/beatmung/beatmung.json`) oder neue Datei anlegen:
   ```json
   { "sources": [], "entities": [] }
   ```
   Andere Schlüssel als `$schema`, `sources`, `entities` sind nicht erlaubt.
2. **ID festlegen:** `<typ>:<slug>`, Slug nur `a–z`, `0–9`, Bindestriche (`ae/oe/ue/ss` statt Umlauten). IDs sind dauerhaft – Nutzerdaten (Favoriten, Fortschritt, Notizen) verweisen darauf. Eine ID nie umbenennen, ohne die Folgen zu prüfen.
3. **Pflichtfelder ausfüllen:** `title`, `summary` (20–400 Zeichen, ein bis zwei Sätze), typspezifisches `data`, `review`.
4. **Verknüpfen:** ausgehende Relationen in `links` – nur in der Richtung, die [die Relationstabelle](datenmodell.md#2-relationen) erlaubt. Die Gegenrichtung entsteht automatisch, also **nicht** doppelt pflegen. Jeder Inhalt sollte mindestens eine Verknüpfung haben (sonst Warnung „verwaist“).
5. **Belegen:** Quellen in `sources`, technische Angaben in `specs` (siehe unten).
6. **Prüfen:** `npm run content:check` – muss mit `0 Fehler` enden; Warnungen bewusst bewerten.
7. **Ansehen:** `npm run dev` und die Detailseite `/e/<typ>/<slug>` aufrufen.

Beispiel (vereinfacht):

```json
{
  "id": "component:beatmung-flowsensor",
  "title": "Flowsensor (Beatmung)",
  "aliases": ["Flow-Sensor", "Durchflusssensor"],
  "summary": "Misst den Gasfluss im Patientenkreis; aus dem Integral über die Zeit berechnet das Beatmungsgerät Tidal- und Atemminutenvolumen.",
  "body": "Der Flowsensor ist Grundlage der Volumenmessung, siehe [[term:tidalvolumen|Tidalvolumen]].",
  "tags": ["Beatmung", "Sensorik"],
  "data": { "kind": "sensor", "function": "Messung des In- und Exspirationsflusses", "wearPart": true },
  "links": [{ "rel": "uses_principle", "to": "term:tidalvolumen" }],
  "sources": ["src:larsen-beatmung"],
  "review": { "status": "geprueft", "reviewedAt": "2026-11-01", "reviewer": "MedTech-World-Redaktion" }
}
```

### Wiki-Links

In `body`, Lernabschnitten (`sections[].body`), Diagnoseanweisungen, Abhilfen und Quizerklärungen sind interne Verweise möglich:

- `[[term:peep]]` – zeigt den Titel der Zielentität
- `[[term:peep|positiver endexspiratorischer Druck]]` – mit eigenem Linktext

Verweise auf nicht existierende IDs sind Fehler (`link.broken-inline`). Wiki-Links ersetzen keine Relation: Wenn eine fachliche Beziehung besteht, zusätzlich eine Relation in `links` pflegen.

## 3. Quellenregeln

- **Quellen zentral definieren** (bevorzugt in `content/quellen/`, themenspezifische Herstellerquellen auch in der Themen-Datei) und per `src:<slug>` referenzieren. Eine Quelle nur einmal anlegen – doppelte IDs und doppelte URLs sind Fehler.
- **Quellenart (`kind`) korrekt wählen:** `norm` (z. B. DIN EN 62353), `gesetz` (MDR, MPDG, MPBetreibV), `behoerde` (BfArM), `hersteller`, `fachliteratur`, `wissenschaft`, `verband`, `intern` (nur für redaktionelle Demo-Daten).
- **Pflichtangaben:** `title`, `publisher`, `kind`, `accessedAt` (Abrufdatum); `url`, `edition` (Ausgabe/Stand) und `isbn` wo vorhanden. Normen immer mit Ausgabe angeben.
- **Primärquellen bevorzugen** (Gesetzestext, Norm, Herstellerdokument) vor Sekundärliteratur.
- **Technische Angaben:** eine Zeile pro Angabe mit genau einer Quelle. Gibt es je nach Bedingung unterschiedliche Werte (Messbereich, Patientengruppe, Betriebsart), `condition` setzen – das ist dann kein Widerspruch. Widersprechen sich Quellen bei gleicher Bedingung, ist das ein Fehler: Klären, welche Angabe gilt, und die andere entfernen oder mit Bedingung präzisieren.
- **Normen-Grenzwerte** (z. B. Ableitströme) stehen als `specs` am Prüfverfahren, mit der Norm als Quelle; Prüfschritte verweisen in `limit` darauf.
- Externe Links werden wöchentlich automatisch geprüft (`npm run content:check:links`); tote Links umgehend ersetzen und `accessedAt` aktualisieren.

## 4. Demo-Richtlinie

Market und einzelne Produktbeispiele arbeiten in der aktuellen Ausbaustufe mit **fiktiven Daten**:

- Fiktive Hersteller, Produktmodelle, Ersatzteile, Komponenten und **alle Angebote** tragen `demo: true`. Angebote ohne Demo-Kennzeichnung sind ein Fehler (`demo.offer`).
- Fiktive Produkte dürfen **nicht** per `manufactured_by` mit einem realen Hersteller verknüpft werden (`demo.real-manufacturer`). Fiktive Namen klar als erfunden erkennbar wählen und keine realen Marken imitieren.
- Demo-Inhalte brauchen keine Quellen, dürfen aber reale Geräteklassen (`device`) und Fachbegriffe verknüpfen – z. B. `product_model:… model_of device:beatmungsgeraet`.
- Die Oberfläche kennzeichnet Demo-Inhalte überall; der Copilot weist sie als fiktiv aus.

## 5. Aktualität und Rechtsstand

- `review.reviewedAt` ist das Datum der letzten fachlichen Prüfung (nicht in der Zukunft). Nach 730 Tagen gilt ein Inhalt als möglicherweise veraltet (Warnung + Kennzeichnung). `review.status: "veraltet"` markiert bekannte Veraltung ausdrücklich.
- Rechtsgrundlagen (`legal_reference`):
  - `verifiedAt`: Datum der letzten Prüfung gegen die Primärquelle; `reviewIntervalDays` (Standard 365).
  - Nach Ablauf: Kennzeichen „Prüfung fällig“ an der Rechtsgrundlage **und** an allen Inhalten mit `based_on` auf sie, plus Warnung in `content:check`.
  - Bei Ablösung: `status: "ersetzt"` und `supersededBy: "legal_reference:…"` (neue Rechtsgrundlage anlegen). Abhängige Inhalte erhalten eine Warnung und müssen auf die neue Grundlage umgestellt werden. `aufgehoben` ohne Nachfolger ist möglich.
- Bei Rechtsänderungen: `verifiedAt` erst nach tatsächlicher Prüfung aktualisieren, `citation` und `validFrom` anpassen, betroffene Prüfverfahren und Lernmodule prüfen (Detailseite → „angewendet in“).

## 6. Review-Workflow

```
Branch anlegen ──▶ Inhalte bearbeiten ──▶ npm run content:check ──▶ Pull Request
                                                                      │
             CI: content:check · typecheck · test · build  ◀──────────┘
                                                                      │
        Fachliches Review (Vier-Augen-Prinzip, Quellen gegenlesen) ───▶ Merge ──▶ Deployment seedet neu
```

1. Änderungen in einem eigenen Branch; ein Thema pro Pull Request.
2. Lokal `npm run content:check` (mit `-- --verbose` auch Hinweise wie ungenutzte Quellen).
3. Pull Request mit kurzer Begründung und Angabe der verwendeten Quellen. CI muss grün sein.
4. **Fachliches Review** durch eine zweite fachkundige Person: Stimmen Aussagen mit den Quellen überein? Sind Grenzwerte, Einheiten und Bedingungen korrekt? Sind Sicherheitshinweise angemessen?
5. Nach dem Review `review.status: "geprueft"`, `reviewedAt` und `reviewer` setzen. Noch nicht geprüfte Inhalte als `"entwurf"` mergen – sie sind dann nur für Redaktion und Administration sichtbar.
6. Nach dem Merge lädt das Deployment die Inhalte neu (`SEED_ON_START=true` oder `npm run seed`). Nutzerdaten bleiben erhalten.

Der Qualitätsbericht der laufenden Instanz ist für die Rollen Redaktion und Administration unter `/qualitaet` einsehbar.

## 7. Qualitätsregeln

| Code | Schwere | Regel |
| --- | --- | --- |
| `file.parse`, `file.invalid`, `file.unknown-keys` | Fehler | Datei ist kein gültiges JSON-Objekt bzw. enthält unbekannte Schlüssel |
| `entity.schema`, `entity.data-schema`, `source.schema` | Fehler | Schema verletzt (Pflichtfelder, Formate, typspezifische Daten, Quizlogik, Diagnosebaum-Ziele) |
| `entity.duplicate-id`, `source.duplicate-id` | Fehler | ID mehrfach vergeben |
| `entity.duplicate-name` | Fehler | gleicher Titel/Alias innerhalb eines Typs (normalisiert: Groß-/Kleinschreibung, Akzente, `ß`, Rechtsformen wie GmbH/AG/Inc., Sonderzeichen) |
| `entity.near-duplicate` | Warnung | sehr ähnliche Titel (Dice-Koeffizient ≥ 0,9) |
| `source.duplicate-url` | Fehler | zwei Quellen mit derselben URL |
| `link.broken`, `link.broken-inline`, `link.self` | Fehler | Verweis ins Leere (Relation, Wiki-Link, 3D-Teil, Szenario, Voraussetzung, Nachfolger) bzw. Selbstverweis |
| `link.not-allowed` | Fehler | Relation zwischen diesen Typen bzw. in dieser Richtung nicht zulässig |
| `link.duplicate` | Warnung | Relation doppelt gepflegt |
| `scene.duplicate-part` | Fehler | doppelte Teil-ID in einer 3D-Szene |
| `entity.orphan` | Warnung | Inhalt ohne jede Verknüpfung |
| `source.missing` | Fehler | referenzierte Quelle existiert nicht |
| `source.required` | Fehler | Typ verlangt eine Quelle, es ist keine angegeben (außer Demo) |
| `source.manufacturer-claim` | Fehler | realer Hersteller/Modell/Ersatzteil ohne Hersteller- oder Behördenquelle |
| `source.unused` | Hinweis | Quelle wird nirgends verwendet |
| `demo.real-manufacturer` | Fehler | Demo-Produkt einem realen Hersteller zugeordnet |
| `demo.offer` | Fehler | Angebot ohne `demo: true` |
| `spec.contradiction` | Fehler | widersprüchliche technische Angaben (gleicher Schlüssel und gleiche Bedingung) |
| `review.future`, `legal.future` | Fehler | Prüfdatum in der Zukunft |
| `review.stale` | Warnung | letzte Prüfung älter als 730 Tage |
| `legal.review-due` | Warnung | Rechtsstand-Prüfung überfällig |
| `legal.superseded-missing` | Warnung | als ersetzt markiert, aber ohne Nachfolger |
| `legal.based-on-superseded` | Warnung | Inhalt beruht auf ersetzter/aufgehobener Rechtsgrundlage |
| `source.url-broken` / `source.url-unreachable` | Fehler / Warnung | nur mit `--external`: URL antwortet mit HTTP ≥ 400 bzw. ist nicht erreichbar |
