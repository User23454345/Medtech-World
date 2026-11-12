# MedTech World

**Die integrierte Plattform für Medizintechnik** – Nachschlagewerk, Reparatur- und Diagnosehilfe, 3D-Erkundung, Ersatzteilmarkt, Simulation, Prüfakademie, KI-Assistent und Karriereplattform in einem System.

MedTech World verbindet acht Module über **eine zentrale Datenbasis**, **ein gemeinsames Nutzerkonto** und **ein einheitliches Designsystem**. Ein Pulsoximeter existiert genau einmal (`device:pulsoximeter`) – das Wiki erklärt es, das Repair Lab diagnostiziert seine Fehlerbilder, der 3D Explorer zeigt seine Komponenten, der Simulator demonstriert das Messprinzip, die Prüfakademie prüft das Wissen dazu, der Market listet passende Ersatzteile und der Copilot beantwortet Fragen – stets mit Quellenangabe.

---

## Vision

- **Ein Wissensgraph statt acht Datensilos.** Inhalte sind typisierte Entitäten mit typisierten Relationen. Jede Verknüpfung wird einmal gepflegt und ist in beide Richtungen sichtbar.
- **Belegtes Wissen.** Jede technische Angabe hat eine Quelle. Herstellerangaben brauchen eine Hersteller- oder Behördenquelle. Rechtsgrundlagen tragen ein Prüfdatum und werden nach Ablauf automatisch als „Prüfung fällig“ gekennzeichnet.
- **Qualität als Build-Schritt.** Inhalte liegen versioniert in Git (`/content`) und werden vor jedem Laden automatisch geprüft (Schema, Dubletten, Widersprüche, tote Links, Belege, Aktualität).
- **Datenschutz by Design.** Gäste können alles lesen; ein Konto ist nur für persönliche Funktionen nötig. Datenexport und Kontolöschung sind eingebaut.

## Die acht Module

| Modul | Route | Stufe | Zweck |
| --- | --- | :---: | --- |
| **MedTech Wiki** | `/wiki` | 1 | Zentrales Nachschlagewerk: Geräte, Komponenten, Hersteller, Fachbegriffe, Rechtsgrundlagen |
| **MedTech Repair Lab** | `/repair` | 1 | Fehlerbilder systematisch diagnostizieren – Diagnosebaum, Prüfschritte, Ersatzteile, Serviceunterlagen |
| **MedTech 3D Explorer** | `/explorer` | 2 | Geräte interaktiv in 3D erkunden (three.js), Komponenten im Kontext verstehen |
| **MedTech Market** | `/market` | 2 | Ersatzteile und Geräte mit geprüfter Kompatibilität (derzeit Demo-Angebote) |
| **MedTech Simulator** | `/simulator` | 2 | Messprinzipien und Störungen simulieren: Pulsoximetrie, Beatmung, EKG, Infusion, elektrische Sicherheit |
| **MedTech Prüfakademie** | `/academy` | 1 | Lernmodule, Prüfverfahren (STK, MTK, DIN EN 62353), Quizze mit Lernfortschritt |
| **MedTech Copilot** | `/copilot` | 3 | Fragen an die geprüfte Wissensbasis – Antworten mit Zitaten und Quellen (RAG) |
| **MedTech Career Hub** | `/career` | 3 | Berufsbilder, Kompetenzpfade und passende Lernmodule |

Alle Module teilen sich die einheitliche Detailseite `/e/:typ/:slug`, die globale Suche, Favoriten, Notizen, Lernhistorie und Einstellungen.

## Architektur im Überblick

```mermaid
flowchart LR
  subgraph Redaktion
    C[/content/*.json<br/>Git, Review per PR/]
  end
  C --> QA[QA-Prüfung<br/>@medtech/core · qa.ts]
  QA -->|0 Fehler| SEED[Seeding<br/>@medtech/data]
  SEED --> DB[(Zentrale SQLite-DB<br/>node:sqlite · FTS5)]
  DB --> API[REST-API /api/v1<br/>Fastify · apps/api]
  API --> SPA[React-SPA<br/>apps/web]
  SPA --> M1[Wiki] & M2[Repair Lab] & M3[3D Explorer] & M4[Market]
  SPA --> M5[Simulator] & M6[Prüfakademie] & M7[Copilot] & M8[Career Hub]
  API -. optional .-> LLM[Claude-API<br/>Copilot-LLM-Modus]
```

```
 content/ (Git) ──▶ QA (core) ──▶ Seeding (data) ──▶ SQLite + FTS5 ──▶ /api/v1 (Fastify) ──▶ React-SPA
                                                      │  Inhalte (neu aufgebaut)          │   Modul-Registry (8 Module,
                                                      │  Nutzerdaten (persistent)         │   lazy geladen) + @medtech/ui
```

| Paket | Inhalt |
| --- | --- |
| `packages/core` | Domänenmodell: Inhaltstypen, Relationen, zod-Schemas, Rollen & Rechte, Module, API-Typen, Qualitätsregeln |
| `packages/data` | Datenbank (node:sqlite), Migrationen, Seeding, Volltextsuche, Content- und User-Repository |
| `packages/ui` | Designsystem: React-Komponenten, Icons, Markdown-Renderer mit Wiki-Links, CSS-Tokens (`mw-*`) |
| `apps/api` | REST-API (Fastify): Inhalte, Suche, Konto, Persönliches, Prüfakademie, Market, Copilot, Administration |
| `apps/web` | React-19-SPA (Vite): Shell, einheitliche Detailseite, Modul-Registry, acht Module |

Details: [docs/architektur.md](docs/architektur.md) · [docs/datenmodell.md](docs/datenmodell.md) · [docs/api.md](docs/api.md)

## Schnellstart

Voraussetzung: **Node.js ≥ 22.13** (wegen `node:sqlite`), npm.

```bash
npm install          # Abhängigkeiten aller Workspaces
npm run seed         # Inhalte prüfen und in .data/medtech-world.db laden, Demo-Konten anlegen
npm run dev          # API auf http://127.0.0.1:3001 und Web auf http://localhost:5173
```

Das Frontend (Vite, Port 5173) leitet `/api` an die API (Port 3001) weiter. `npm run dev` führt das Seeding automatisch vorab aus.

### Demo-Konten (nur Entwicklung)

In der Entwicklung (`NODE_ENV` ≠ `production`, `SEED_DEMO_USERS` nicht `false`) werden folgende Konten angelegt – Passwort jeweils `Demo-Passwort-1`:

| E-Mail | Rolle | Rechte |
| --- | --- | --- |
| `lernende@medtech.world` | Lernende/r (`learner`) | Lesen, Favoriten, Fortschritt, Notizen, Copilot, Market-Anfragen |
| `technik@medtech.world` | Techniker/in (`technician`) | wie Lernende |
| `redaktion@medtech.world` | Redaktion (`editor`) | zusätzlich Entwürfe sehen, Qualitätsbericht |
| `admin@medtech.world` | Administration (`admin`) | zusätzlich Nutzer- und Rollenverwaltung |

In Produktion werden **nie** Demo-Konten angelegt. Ein erstes Administrationskonto entsteht über `ADMIN_EMAIL`/`ADMIN_PASSWORD` (nur wenn noch kein Konto existiert).

### Konfiguration

Alle Umgebungsvariablen sind in [`.env.example`](.env.example) dokumentiert. Ohne `ANTHROPIC_API_KEY` arbeitet der Copilot im reinen Retrieval-Modus (belegte Treffer ohne generierten Text).

## Skripte

| Befehl | Wirkung |
| --- | --- |
| `npm run dev` | Seeding, dann API (`tsx watch`) und Web (Vite) parallel |
| `npm run seed` | Inhalte prüfen und in die Datenbank laden (Nutzerdaten bleiben erhalten) |
| `npm run content:check` | Qualitätsprüfung aller Inhalte (Exit-Code 1 bei Fehlern); `-- --verbose` zeigt auch Hinweise |
| `npm run content:check:links` | zusätzlich alle externen Quellen-URLs per HTTP prüfen (Internet nötig) |
| `npm run typecheck` | TypeScript-Prüfung des gesamten Monorepos |
| `npm test` | alle Tests (Vitest) |
| `npm run check` | `content:check` + `typecheck` + `test` |
| `npm run build` | Produktions-Build des Frontends nach `apps/web/dist` |
| `npm start` | API im Produktionsmodus (liefert mit `NODE_ENV=production` auch das Frontend aus) |

## Qualitätssicherung

- **Inhalte:** `npm run content:check` prüft Schema, doppelte IDs/Namen/Aliase (inkl. Normalisierung von Rechtsformen wie „GmbH“/„AG“), Beinahe-Dubletten, doppelte Quellen-URLs, tote Verweise und Inline-Wiki-Links, unzulässige Relationsrichtungen, fehlende Belege, Herstellerangaben ohne Herstellerquelle, Demo-Regeln, widersprüchliche technische Angaben, veraltete Prüfungen, fällige oder ersetzte Rechtsgrundlagen und Zukunftsdaten. Regeln: [docs/inhalte-redaktion.md](docs/inhalte-redaktion.md).
- **Tests:** `tests/` enthält Backend-Tests für die QA-Regeln (`qa.test.ts`), die Datenschicht mit den realen Inhalten (`data.test.ts`) und die REST-API inkl. Sicherheit (`api.test.ts`). Module bringen eigene Logiktests unter `apps/web/src/modules/**` mit.
- **CI:** [.github/workflows/ci.yml](.github/workflows/ci.yml) – Inhaltsprüfung, Typprüfung, Tests und Build bei jedem Push/PR; wöchentlich zusätzlich die Prüfung externer Links.

## Betrieb mit Docker

```bash
docker build -t medtech-world .
docker run -p 3001:3001 -v medtech-data:/app/.data \
  -e ADMIN_EMAIL=admin@example.org -e ADMIN_PASSWORD='bitte-ändern-123' \
  medtech-world
```

Die API liefert im Container auch das gebaute Frontend aus (`http://localhost:3001`). Hinter einem TLS-Proxy betreiben; Cookies sind in Produktion `Secure`.

## Projektstruktur

```
.
├── apps/
│   ├── api/                 REST-API (Fastify, TypeScript via tsx)
│   │   └── src/             app.ts, server.ts, config.ts, copilot.ts, http.ts, routes/
│   └── web/                 React-SPA (Vite)
│       └── src/
│           ├── shell/       AppShell, einheitliche Detailseite, globale Suche, Modul-Startseite
│           ├── pages/       Startseite, Suche, Konto, Plattformseiten (Qualität, Quellen, Datenschutz)
│           ├── lib/         API-Client, Hooks, Authentifizierung
│           └── modules/     wiki, repair, explorer, market, simulator, academy, copilot, career + registry.ts
├── packages/
│   ├── core/                Domänenmodell & Qualitätsregeln
│   ├── data/                Datenbank, Seeding, Repositories, Suche
│   └── ui/                  Designsystem
├── content/                 Inhaltsdateien (JSON, Git-versioniert) nach Themen
├── scripts/                 seed.ts, check-content.ts
├── tests/                   Backend-Tests (Vitest)
├── docs/                    Architektur, Datenmodell, Redaktion, API, Roadmap
├── Dockerfile, .dockerignore, .env.example
└── .github/workflows/ci.yml
```

## Dokumentation

- [Architektur](docs/architektur.md) – Schichten, Datentrennung, Modulvertrag, Sicherheit, Performance, Entscheidungen (ADR)
- [Datenmodell](docs/datenmodell.md) – Inhaltstypen, Relationen, technische Daten, Quellen, Qualitätskennzeichen
- [Inhalte & Redaktion](docs/inhalte-redaktion.md) – Leitfaden für neue Inhalte, Quellenregeln, Review-Workflow
- [API-Referenz](docs/api.md) – alle Endpunkte unter `/api/v1`
- [Roadmap](docs/roadmap.md) – Entwicklungsstrategie in drei Stufen

## Hinweis

MedTech World dient der Aus- und Weiterbildung sowie der fachlichen Orientierung. Die Plattform ersetzt weder Gebrauchsanweisungen und Serviceunterlagen der Hersteller noch die Bewertung durch befugtes Fachpersonal. Maßgeblich sind stets die verlinkten Primärquellen. Hersteller, Modelle und Angebote mit Demo-Kennzeichnung sind fiktiv.
