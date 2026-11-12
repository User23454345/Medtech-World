# Datenmodell

MedTech World speichert Fachwissen als **Wissensgraph**: typisierte Entitäten, verbunden durch typisierte Relationen. Technische Daten und Quellen sind eigene Tabellen, damit sie zentral geprüft werden können. Maßgeblich sind die Definitionen in `packages/core/src` (`entity-types.ts`, `relations.ts`, `schemas.ts`, `api-types.ts`).

## 1. Entitäten

Jede Entität hat eine stabile ID der Form **`<typ>:<slug>`** (z. B. `device:pulsoximeter`; Slug: Kleinbuchstaben, Ziffern, Bindestriche). Die ID ist zugleich die Route der einheitlichen Detailseite: `/e/device/pulsoximeter`.

### Gemeinsame Felder

| Feld | Pflicht | Beschreibung |
| --- | :---: | --- |
| `id` | ✔ | `typ:slug` |
| `title` | ✔ | 2–120 Zeichen |
| `aliases` | | Synonyme/Abkürzungen – fließen in Suche und Dublettenprüfung ein |
| `summary` | ✔ | 20–400 Zeichen, erscheint in Karten, Suchtreffern und Copilot-Zitaten |
| `body` | | Markdown; interne Verweise als `[[typ:slug]]` oder `[[typ:slug\|Text]]` |
| `tags` | | Schlagwörter |
| `data` | ✔ | typspezifische Daten (siehe unten) |
| `links` | | ausgehende Relationen `{ rel, to, note? }` |
| `sources` | | Quellen-IDs (`src:…`) |
| `specs` | | technische Angaben (siehe Abschnitt 3) |
| `review` | ✔ | `{ status: 'entwurf' \| 'geprueft' \| 'veraltet', reviewedAt: 'JJJJ-MM-TT', reviewer? }` |
| `demo` | | `true` für fiktive Hersteller, Modelle, Ersatzteile und Angebote |

### Inhaltstypen

| Typ | Bezeichnung | Heimatmodul | auch in | Quelle Pflicht | Wichtige Daten (`data`) |
| --- | --- | --- | --- | :---: | --- |
| `device` | Medizingerät | Wiki | Explorer, Repair, Simulator, Akademie, Market | ✔ | `category`, `typicalRiskClass`, `applications`, `operatingPrinciple`, `scene` (3D) |
| `manufacturer` | Hersteller | Wiki | Market | ✔ | `country`, `website`, `founded`, `focus` |
| `product_model` | Produktmodell | Wiki | Market, Repair, Explorer | ✔ | `status` (aktiv/abgekündigt/unbekannt), `releaseYear`, `riskClass`, `scene` |
| `component` | Komponente | Wiki | Explorer, Repair, Market | ✔ | `kind` (sensor, aktor, elektronik …), `function`, `wearPart` |
| `term` | Fachbegriff | Wiki | Akademie, Copilot | ✔ | `category`, `abbreviation`, `english`, `formula` |
| `media` | Bild | Wiki | Explorer | – | `kind`, genau eines von `svg`/`url`, `alt`, `license`, `attribution` |
| `learning_module` | Lernmodul | Akademie | Career, Wiki | ✔ | `level`, `durationMinutes`, `objectives`, `sections[]`, `prerequisites[]` |
| `quiz_question` | Quizfrage | Akademie | – | – | `kind` (single/multiple/truefalse), `question`, `options`, `correct`, `explanation`, `difficulty` |
| `simulation` | Simulation | Simulator | Akademie | ✔ | `engine`, `learningGoals`, `scenarios[]` mit `params` und optional `fault` |
| `fault` | Fehlerbild | Repair Lab | Simulator, Akademie | ✔ | `severity`, `symptoms`, `causes[]` (mit Häufigkeit), `diagnosis[]` (Entscheidungsbaum), `outcomes`, `remedies`, `safetyNotes` |
| `test_procedure` | Prüfverfahren | Akademie | Repair | ✔ | `kind` (STK, MTK, elektrische-sicherheit …), `interval`, `qualification`, `equipment`, `steps[]`, `documentation` |
| `spare_part` | Ersatzteil | Market | Repair | ✔ | `partNumber`, `kind`, `wearPart`, `original`, `typicalLifetime` |
| `document` | Dokumentation | Wiki | Repair, Akademie | ✔ | `docType`, `language`, `version`, `url` |
| `legal_reference` | Rechtsgrundlage | Wiki | Akademie | ✔ | `jurisdiction`, `kind`, `citation`, `status`, `validFrom`, `verifiedAt`, `reviewIntervalDays` (Standard 365), `supersededBy` |
| `job_profile` | Berufsbild | Career Hub | – | ✔ | `tasks`, `qualifications`, `workplaces`, `careerPaths` |
| `offer` | Angebot | Market | – | – | `seller`, `price`, `currency` (EUR), `condition`, `stock`, `location`, `warrantyMonths` – derzeit immer `demo: true` |

Simulationsszenarien verwenden je Engine feste Parameterschlüssel (z. B. `pulse-oximetry`: `saturation`, `heartRate`, `perfusion`, `motion`, `ambientLight`; `ventilation`: `mode`, `peep`, `pInsp`, `tidalVolume`, `respRate`, `ieRatio`, `compliance`, `resistance`, `leak`; `ecg-monitor`: `heartRate`, `rhythm`, `noise`, `electrodeOff`, `baselineWander`; `infusion-pump`: `rate`, `vtbi`, `occlusionAfterMin`, `airInLine`, `pressureLimit`; `electrical-safety`: `protectionClass`, `appliedPart`, `method`, `peResistance`, `equipmentLeakage`, `appliedPartLeakage`).

## 2. Relationen

Eine Relation wird **genau einmal** beim Quellobjekt gepflegt (`links: [{ rel, to }]`). Die Gegenrichtung erzeugt die Datenbank beim Lesen mit dem `inverseLabel` – wer „Pulsoximeter hat Komponente SpO₂-Sensor“ pflegt, sieht auf der Sensorseite automatisch „verbaut in: Pulsoximeter“. Unzulässige Kombinationen von Quell- und Zieltyp weist die QA als Fehler ab.

*Hardware* = `device`, `product_model`, `component`; `*` = beliebiger Typ.

| Relation | Beschriftung (vorwärts) | Gegenrichtung | von | nach |
| --- | --- | --- | --- | --- |
| `model_of` | ist Produktmodell von | Produktmodelle | product_model | device |
| `manufactured_by` | hergestellt von | Produkte | product_model, spare_part, component | manufacturer |
| `has_component` | Komponenten | verbaut in | Hardware | component |
| `uses_principle` | Messprinzip / Grundlagen | angewendet in | device, product_model, component, simulation, test_procedure, fault | term |
| `teaches` | behandelt | Lernmodule | learning_module | * |
| `quiz_for` | gehört zu | Quizfragen | quiz_question | learning_module, device, term, test_procedure, component, fault, legal_reference |
| `simulates` | simuliert | Simulationen | simulation | device, term, fault, component |
| `affects` | betrifft | Fehlerbilder | fault | Hardware |
| `causes` | mögliche Ursache für | mögliche Ursachen | component, fault | fault |
| `tests` | prüft | Prüfverfahren | test_procedure | Hardware |
| `based_on` | Rechtsgrundlage | angewendet in | test_procedure, learning_module, document, device, job_profile | legal_reference |
| `fits` | passend für | Ersatzteile | spare_part | Hardware |
| `documents` | dokumentiert | Dokumentationen | document | * |
| `illustrates` | zeigt | Bilder | media | * |
| `requires_skill` | Kompetenzen / Lernpfad | relevant für Berufsbild | job_profile | learning_module, term, test_procedure, device |
| `offers` | Angebot für | Angebote im Market | offer | spare_part, product_model, device |
| `remedied_by` | Abhilfe / benötigt | hilft bei | fault | spare_part, test_procedure, document, learning_module |
| `related` | Siehe auch | Siehe auch | * | * (symmetrisch, wird nur einmal gespeichert) |

In der Datenbank liegt jede Relation als Zeile `relations(from_id, rel, to_id, note)`; der Index `idx_relations_to(to_id, rel)` macht die Gegenrichtung schnell. Die API liefert sie als `RelationGroup { rel, direction: 'out' | 'in', label, items[] }`.

Zusätzlich zu den Relationen gibt es typspezifische Verweise, die die QA ebenfalls prüft: 3D-Teile → `component`, Simulationsszenario → `fault`, `prerequisites` von Lernmodulen, `supersededBy` von Rechtsgrundlagen sowie Inline-Wiki-Links in Texten.

## 3. Technische Daten (`specs`) und Quellen (`sources`)

### Technische Angaben

```json
{ "key": "spo2_accuracy", "label": "SpO₂-Genauigkeit", "value": "±2", "unit": "%",
  "condition": "bei 70–100 % SpO₂, ohne Bewegung", "source": "src:iso-80601-2-61" }
```

(Beispiel zur Veranschaulichung; die tatsächlichen Angaben stehen in den Inhaltsdateien.)

- Jede Angabe hat **genau eine Quelle** (`source` ist Pflicht).
- `key` ist maschinenlesbar; `condition` beschreibt Varianten (Messbereich, Betriebsart, Patientengruppe).
- **Widerspruch** = gleicher `key` **und** gleiche `condition` (ohne Groß-/Kleinschreibung), aber unterschiedlicher normalisierter Wert oder Einheit. Unterschiedliche Bedingungen sind ausdrücklich kein Widerspruch. Schreibweisen wie `1,5` / `1.5` / `1.5` (Zahl) gelten als gleich.
- Tabelle `specs(entity_id, ord, key, label, value, value_num, unit, condition, note, source_id)`; numerische Werte zusätzlich in `value_num` für spätere Filter/Vergleiche.

### Quellen

```json
{ "id": "src:de-mpbetreibv", "title": "Medizinprodukte-Betreiberverordnung (MPBetreibV)",
  "publisher": "Bundesministerium der Justiz – gesetze-im-internet.de", "kind": "gesetz",
  "url": "https://www.gesetze-im-internet.de/mpbetreibv/", "accessedAt": "2026-11-01" }
```

- `kind`: `norm`, `gesetz`, `behoerde`, `hersteller`, `fachliteratur`, `wissenschaft`, `verband`, `intern`.
- Quellen werden zentral definiert (meist in `content/quellen/`) und per ID referenziert; `entity_sources` verknüpft Entitäten mit allen verwendeten Quellen (direkt oder über Specs).
- Eine URL darf nur einmal vorkommen (`http`/`https` und abschließende Schrägstriche werden normalisiert).

## 4. Qualitätskennzeichen (`flags`)

Die QA berechnet für jede Entität Kennzeichen, die mit ihr gespeichert und in allen Modulen angezeigt werden (`QualityBadges`, `QualityNotices`) und auch an den Copilot gehen:

| `kind` | Bedeutung | Auslöser |
| --- | --- | --- |
| `demo` | Demo-Inhalt mit fiktiven Daten | `demo: true` |
| `draft` | Entwurf, noch nicht fachlich geprüft | `review.status = 'entwurf'` (nur für Redaktion sichtbar) |
| `outdated` | möglicherweise nicht mehr aktuell | `review.status = 'veraltet'` oder letzte Prüfung älter als 730 Tage |
| `legal-review-due` | Rechtsstand-Prüfung fällig (`since`) | `verifiedAt + reviewIntervalDays` überschritten – wird über `based_on` an abhängige Inhalte weitergegeben |
| `superseded` | ersetzt/aufgehoben (`by`) | `status = 'ersetzt' \| 'aufgehoben'` – ebenfalls über `based_on` weitergegeben |
| `contradiction` | widersprüchliche technische Angaben (`key`) | siehe Abschnitt 3 |

Der vollständige Prüfbericht (Zählungen und alle `issues`) liegt in `content_meta.quality_report` und ist für Redaktion und Administration unter `/qualitaet` bzw. `GET /api/v1/quality` abrufbar.

## 5. Beispiel: Wie das Beatmungsgerät vernetzt ist

`device:beatmungsgeraet` („Intensiv-Beatmungsgerät“, `content/beatmung/beatmung.json`) zeigt, wie ein Gerät alle acht Module verbindet:

```
                         legal_reference:eu-mdr, legal_reference:de-mpbetreibv-stk
                                         ▲ based_on
term:peep, term:compliance,              │                         component:beatmung-flowsensor,
term:resistance, term:tidalvolumen, ◀─ uses_principle ─┐   ┌─ has_component ─▶ component:beatmung-drucksensor,
term:druckkontrollierte-beatmung …                     │   │                    component:exspirationsventil …
                                                 device:beatmungsgeraet
product_model:nordlicht-ventis-700 (Demo) ── model_of ──▶  ▲  ◀── simulates ── simulation:beatmung
fault:beatmung-leckage-diskonnektion,  ──── affects ───────┤  ◀── teaches ──── learning_module:beatmung-grundlagen
fault:beatmung-hoher-atemwegsdruck …                       │  ◀── tests ────── test_procedure:beatmungsgeraet-funktionspruefung-stk
media:beatmung-pneumatik-schema ─────── illustrates ───────┘  ◀── documents ── document:checkliste-geraeteeinweisung
                                                 related ↔ manufacturer:draeger, device:patientenmonitor
```

Daraus ergibt sich automatisch:

| Modul | Was dort erscheint |
| --- | --- |
| Wiki | Geräteseite mit Komponenten, Messprinzipien, Rechtsgrundlagen, Quellen (u. a. ISO 80601-2-12, MPBetreibV) |
| 3D Explorer | 3D-Szene des Geräts; Klick auf ein Teil führt zur verknüpften Komponente |
| Repair Lab | Fehlerbilder „Leckage/Diskonnektion“, „hoher Atemwegsdruck“, „Flowsensor-Fehler“ mit Diagnosebaum |
| Simulator | `simulation:beatmung` (Engine `ventilation`) mit Szenarien, die die Fehlerbilder demonstrieren |
| Prüfakademie | Lernmodul „Beatmung – Grundlagen“ mit Quizfragen (`quiz_for`) und dem STK-/Funktionsprüfverfahren |
| Market | Demo-Produktmodell und passende Ersatzteile/Angebote (`fits`, `offers`) |
| Copilot | Beantwortet z. B. „Was bedeutet PEEP?“ mit Zitaten auf Begriff, Gerät und Lernmodul |
| Career Hub | Berufsbilder, deren Kompetenzpfad (`requires_skill`) das Lernmodul bzw. Gerät enthält |

Ist z. B. die Prüfung des Rechtsstands der MPBetreibV fällig, trägt das Prüfverfahren über `based_on` automatisch den Hinweis „Rechtsgrundlage MPBetreibV: Prüfung fällig“ – in jedem Modul.

## 6. Nutzerdaten

| Tabelle | Inhalt |
| --- | --- |
| `users` | ID (UUID), E-Mail (eindeutig, ohne Groß-/Kleinschreibung), Anzeigename, scrypt-Hash, Rolle |
| `sessions` | SHA-256 des Sitzungstokens, Ablaufdatum |
| `user_settings` | JSON: `theme`, `startModule`, `trackHistory`, `reducedMotion` |
| `favorites` | (Nutzer, Entitäts-ID) |
| `progress` | Status `started`/`completed`, bester Score; „abgeschlossen“ bleibt abgeschlossen |
| `notes` | persönliche Notizen, optional zu einer Entität |
| `history` | Lernhistorie (Ansicht, Quiz, Simulation, Diagnose), max. 500 Einträge, Dubletten innerhalb von 10 Minuten werden zusammengefasst |
| `inquiries` | Anfragen zu (Demo-)Angeboten im Market |

Alle Tabellen referenzieren `users` mit `ON DELETE CASCADE` und Inhalte nur über die Entitäts-ID.
