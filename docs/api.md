# API-Referenz (`/api/v1`)

Die REST-API (`apps/api`, Fastify) ist die einzige Schnittstelle zwischen Frontend und zentraler Datenbank. Alle Module nutzen dieselben Endpunkte. Die Typen der Antworten (DTOs) sind in `packages/core/src/api-types.ts` definiert und werden vom Frontend direkt importiert.

## Konventionen

| Thema | Regel |
| --- | --- |
| Format | JSON (UTF-8), Body-Limit 256 KiB |
| Authentifizierung | Sitzungs-Cookie `mw_session` (`HttpOnly`, `SameSite=Lax`, in Produktion `Secure`), wird von `register`/`login` gesetzt |
| CSRF | Jede Anfrage mit `POST`, `PUT`, `PATCH` oder `DELETE` auf `/api/*` muss den Header **`x-medtech-client: 1`** senden, sonst `403 csrf` |
| Fehler | `{ "error": { "code": "…", "message": "…" } }` mit HTTP-Status; Meldungen sind deutsch und für Nutzer verständlich |
| Fehlercodes | `validation` (400), `unauthenticated` (401), `invalid_credentials` (401), `forbidden` (403), `csrf` (403), `not_found` (404), `email_taken` (409), `rate_limited` (429, mit `Retry-After`), `self_demote` (400), `invalid_password` (400), `internal` (500) |
| Entitäts-IDs | `typ:slug`, z. B. `device:pulsoximeter`; in Pfaden unverändert (`/me/favorites/device:pulsoximeter`) |
| Entwürfe | Inhalte mit `review.status = entwurf` sind nur für Rollen mit `content:read-drafts` (Redaktion, Administration) sichtbar – in allen Endpunkten |
| Caching | Persönliche Antworten (`/me`, `/auth`, angemeldete Nutzer) mit `Cache-Control: no-store` |
| Unbekannte Routen | `404 { "error": { "code": "not_found" } }` |

### Rollen & Berechtigungen

| Berechtigung | Gast | learner | technician | editor | admin |
| --- | :---: | :---: | :---: | :---: | :---: |
| `content:read` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `copilot:use` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `user:self` | | ✔ | ✔ | ✔ | ✔ |
| `market:inquire` | | ✔ | ✔ | ✔ | ✔ |
| `content:read-drafts` | | | | ✔ | ✔ |
| `quality:read` | | | | ✔ | ✔ |
| `users:manage` | | | | | ✔ |

## Plattform & Inhalte

| Methode | Pfad | Zugriff | Beschreibung |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | alle | `{ status: "ok" }` |
| GET | `/api/v1/meta` | alle | Module, Inhaltstypen, Relationstypen, Anzahl je Typ (`counts`), Zeitpunkt des letzten Seedings (`seededAt`) |
| GET | `/api/v1/entities` | alle | Liste (`ListResponse<EntitySummary>`: `{ items, total }`) |
| GET | `/api/v1/entities/:type/:slug` | alle | Detail (`EntityDetail`): Daten, Specs mit Quellen, Quellen, Relationsgruppen (beide Richtungen), Module, Kennzeichen, `linkedTitles` für Wiki-Links. **Quizfragen ohne `correct`/`explanation`**, stattdessen `multipleAnswers: boolean` |
| GET | `/api/v1/search` | alle | Volltextsuche über alle Module (`SearchResponse`) |
| GET | `/api/v1/sources` | alle | Quellenverzeichnis `{ items: SourceRef[] }` |
| GET | `/api/v1/sources/:id` | alle | `{ source, usedBy: EntitySummary[] }` |
| GET | `/api/v1/quality` | `quality:read` | Qualitätsbericht (`QualityReport`: `generatedAt`, `counts`, `issues`) |

**Query-Parameter `/entities`:** `type` oder `types` (kommagetrennt), `tag`, `relatedTo` (Entitäts-ID; Verknüpfung in beliebiger Richtung), `rel` (nur diese Relation), `limit` (1–500, Standard 50), `offset`. Sortierung nach Titel.

**Query-Parameter `/search`:** `q` (max. 200 Zeichen; leere Anfrage → keine Treffer), `types` (kommagetrennt), `module` (nur Typen, die in diesem Modul vorkommen), `limit` (1–200, Standard 30). Antwort: `{ query, total, hits: SearchHit[], byModule, byType }`; jeder Treffer enthält `module`, `snippet` (Trefferstelle mit `«…»`) und `score`. Zuerst werden alle Begriffe UND-verknüpft gesucht (mit Präfixsuche), ohne Treffer ODER-verknüpft. `SpO₂` und `SpO2` sind gleichwertig.

## Authentifizierung & Konto

| Methode | Pfad | Zugriff | Body | Antwort |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | alle, Rate-Limit | `{ email, password, displayName }` | `201 { user, settings }` + Cookie; `409` bei vergebener E-Mail |
| POST | `/api/v1/auth/login` | alle, Rate-Limit | `{ email, password }` | `{ user, settings }` + Cookie; `401 invalid_credentials` |
| POST | `/api/v1/auth/logout` | alle | – | `{ ok: true }`, Sitzung gelöscht, Cookie entfernt |
| GET | `/api/v1/auth/me` | alle | – | `{ user, settings }` bzw. `{ user: null, settings: null }` für Gäste |
| PATCH | `/api/v1/me` | angemeldet | `{ displayName? }` | `{ user }` |
| PUT | `/api/v1/me/password` | angemeldet, Rate-Limit | `{ currentPassword, newPassword }` | `{ ok: true }`; beendet alle Sitzungen und setzt eine neue |
| GET | `/api/v1/me/settings` | angemeldet | – | `UserSettings` |
| PATCH | `/api/v1/me/settings` | angemeldet | Teilmenge von `{ theme: system\|light\|dark, startModule, trackHistory, reducedMotion }` (strikt) | `UserSettings`; `trackHistory: false` löscht die Historie |
| GET | `/api/v1/me/export` | angemeldet | – | DSGVO-Export als Download (`exportedAt`, `user`, `settings`, `favorites`, `progress`, `notes`, `history`, `inquiries`) |
| DELETE | `/api/v1/me` | angemeldet, Rate-Limit | `{ password }` | `{ ok: true }`; Konto und alle Daten gelöscht |

Passwortrichtlinie: 10–200 Zeichen, mindestens ein Buchstabe und mindestens eine Ziffer oder ein Sonderzeichen. E-Mail-Adressen werden kleingeschrieben gespeichert.

## Persönliche Daten

| Methode | Pfad | Body / Query | Antwort |
| --- | --- | --- | --- |
| GET | `/api/v1/me/favorites` | – | `{ items: Favorite[] }` (mit `entity`-Kurzinfo oder `null`) |
| PUT | `/api/v1/me/favorites/:entityId` | – | `{ ok: true }`; `404`, wenn der Inhalt nicht existiert |
| DELETE | `/api/v1/me/favorites/:entityId` | – | `{ ok: true }` |
| GET | `/api/v1/me/progress` | – | `{ items: ProgressEntry[] }` |
| PUT | `/api/v1/me/progress/:entityId` | `{ status: started\|completed, score?: 0–100\|null }` | `ProgressEntry` – „completed“ bleibt erhalten, der beste Score zählt |
| GET | `/api/v1/me/notes` | `?entityId=` | `{ items: Note[] }` |
| POST | `/api/v1/me/notes` | `{ entityId: string\|null, text }` (max. 10 000 Zeichen) | `201 Note` |
| PATCH | `/api/v1/me/notes/:id` | `{ text }` | `Note`; `404` für fremde oder unbekannte Notizen |
| DELETE | `/api/v1/me/notes/:id` | – | `{ ok: true }`; `404` für fremde oder unbekannte Notizen |
| GET | `/api/v1/me/history` | `?limit=1–500` (Standard 50) | `{ items: HistoryEntry[] }` |
| POST | `/api/v1/me/history` | `{ entityId, module, action: view\|quiz\|simulation\|diagnosis }` | `{ ok: true }` (ignoriert bei `trackHistory: false`; gleiche Einträge innerhalb von 10 Minuten werden zusammengefasst) |
| DELETE | `/api/v1/me/history` | – | `{ ok: true }` |

Alle Endpunkte erfordern eine Anmeldung (`401` für Gäste) und sehen ausschließlich die Daten der angemeldeten Person.

## Module

### Prüfakademie

`POST /api/v1/academy/quiz/evaluate` – alle (Gäste erhalten eine Auswertung ohne Speicherung)

```json
{ "contextId": "learning_module:beatmung-grundlagen",
  "answers": [{ "questionId": "quiz_question:beatmung-peep", "selected": ["b"] }] }
```

Antwort: `{ score, passed, passScore: 80, results: [{ questionId, correct, correctOptions, explanation }] }`. Eine Antwort ist richtig, wenn die (deduplizierte) Auswahl exakt der Lösungsmenge entspricht. Bei angemeldeten Nutzern mit `contextId` wird der Fortschritt gespeichert (`completed` ab 80 %, sonst `started`; bester Score bleibt) und ein Historieneintrag `quiz` angelegt. Unbekannte Fragen → `404`, leere Auswahl (`selected: []`) → `400`. Lösungen und Erklärungen werden nur über diesen Endpunkt und nur für beantwortete Fragen ausgeliefert. Das ist ein bewusster Kompromiss für ein Lernangebot: Wer eine Antwort abschickt, sieht die Lösung – der Endpunkt eignet sich nicht für prüfungsrelevante Bewertungen. Die Detailansicht einer Quizfrage enthält `linkedTitles` nur für Verweise aus öffentlichen Feldern; die Antwortoptionen werden im Frontend je Versuch gemischt.

### Market (Demo)

| Methode | Pfad | Zugriff | Beschreibung |
| --- | --- | --- | --- |
| POST | `/api/v1/market/offers/:slug/inquiries` | `market:inquire` | `{ message }` (5–2000 Zeichen) → `201 { id, createdAt, notice }`; die Anfrage wird gespeichert, aber nicht an reale Anbieter übermittelt |
| GET | `/api/v1/market/inquiries` | `market:inquire` | eigene Anfragen `{ items: [{ id, offerId, message, createdAt }] }` |

### Copilot

| Methode | Pfad | Zugriff | Beschreibung |
| --- | --- | --- | --- |
| GET | `/api/v1/copilot/status` | alle | `{ mode: "llm" \| "retrieval" }` |
| POST | `/api/v1/copilot/ask` | `copilot:use`, 20 Anfragen/Minute | `{ question (2–1000 Zeichen), contextId? }` → `CopilotAnswer` |

`CopilotAnswer`: `{ mode, answer (Markdown mit Belegen [n]), citations: [{ index, entity: EntitySummary, sources: SourceRef[] }], disclaimer }`. Der Copilot sucht bis zu sechs passende Inhalte (die `contextId`-Entität zuerst; Quizfragen und Angebote ausgenommen). Im LLM-Modus (`ANTHROPIC_API_KEY` gesetzt) formuliert ein Sprachmodell eine Antwort ausschließlich auf Basis dieser Inhalte; Verweise auf nicht vorhandene Dokumente werden entfernt. Im Retrieval-Modus bzw. bei API-Fehlern werden die belegten Treffer mit Kerndaten ohne generierten Text ausgegeben.

## Administration

| Methode | Pfad | Zugriff | Beschreibung |
| --- | --- | --- | --- |
| GET | `/api/v1/admin/users` | `users:manage` | `{ items: PublicUser[] }` (ohne Passwort-Hashes) |
| PATCH | `/api/v1/admin/users/:id` | `users:manage` | `{ role: learner\|technician\|editor\|admin }` → `{ user }`; die eigene Administratorrolle kann nicht entzogen werden (`400 self_demote`) |

## Rate-Limits

| Bucket | Limit |
| --- | --- |
| Registrierung, Anmeldung, Passwortänderung, Kontolöschung | je 10 Anfragen pro Minute und IP |
| Copilot | 20 Anfragen pro Minute und IP |

Bei Überschreitung: `429 rate_limited` mit `Retry-After` (Sekunden). Die Limits gelten pro API-Instanz (In-Memory).

## Beispiele

```bash
# Suche
curl 'http://localhost:3001/api/v1/search?q=SpO2&types=term,device'

# Anmeldung (Cookie speichern) und Favorit setzen
curl -c jar -H 'x-medtech-client: 1' -H 'content-type: application/json' \
  -d '{"email":"lernende@medtech.world","password":"Demo-Passwort-1"}' http://localhost:3001/api/v1/auth/login
curl -b jar -X PUT -H 'x-medtech-client: 1' http://localhost:3001/api/v1/me/favorites/device:pulsoximeter

# Copilot
curl -H 'x-medtech-client: 1' -H 'content-type: application/json' \
  -d '{"question":"Wie funktioniert die Pulsoximetrie?"}' http://localhost:3001/api/v1/copilot/ask
```
