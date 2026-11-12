# Architektur

Dieses Dokument beschreibt den Aufbau von MedTech World: Schichten, Datentrennung, Modulvertrag, Sicherheit und Datenschutz, Performance sowie die Erweiterbarkeit. Am Ende sind die wesentlichen Architekturentscheidungen im ADR-Format festgehalten.

## 1. Schichtenmodell

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1  Inhalte            content/**/*.json  (Git, Review per Pull Request)       │
├──────────────────────────────────────────────────────────────────────────────┤
│ 2  Qualitätsprüfung   @medtech/core › buildContentBundle()  (qa.ts)          │
│                       Schema · Dubletten · Links · Belege · Widersprüche ·    │
│                       Aktualität · Rechtsstand  → Fehler stoppen das Laden    │
├──────────────────────────────────────────────────────────────────────────────┤
│ 3  Zentrale Datenbank @medtech/data  (node:sqlite, eine Datei, WAL)           │
│                       Inhalte: entities · relations · specs · sources ·       │
│                                entity_sources · search_index (FTS5)           │
│                       Nutzer:  users · sessions · user_settings · favorites · │
│                                progress · notes · history · inquiries         │
├──────────────────────────────────────────────────────────────────────────────┤
│ 4  REST-API           apps/api  (Fastify, /api/v1, JSON)                     │
│                       Auth · RBAC · CSRF · Rate-Limits · Sicherheitsheader    │
├──────────────────────────────────────────────────────────────────────────────┤
│ 5  Web-Frontend       apps/web  (React 19, React Router 7, Vite)             │
│                       Shell · einheitliche Detailseite · Modul-Registry ·     │
│                       8 lazy geladene Module · Designsystem @medtech/ui       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Inhalte (Git-JSON)

Alle Fachinhalte liegen als JSON-Dateien unter `content/` (thematisch gegliedert: `monitoring/`, `beatmung/`, `recht/`, `pruefung/`, `quellen/` …). Eine Datei enthält `sources` (Quellen) und/oder `entities` (Inhalte). Git ist die maßgebliche Quelle: Jede Änderung ist nachvollziehbar, reviewbar und revertierbar. Den Vertrag beschreiben die zod-Schemas in `packages/core/src/schemas.ts`.

### 1.2 Qualitätsprüfung

`buildContentBundle()` (`packages/core/src/qa.ts`) liest alle Dateien, validiert sie und baut den Wissensgraphen. Ergebnis: Entitäten, Quellen, Relationen, **Qualitätskennzeichen** (`flags`) je Entität und eine Liste von `issues` mit Schweregrad `error`, `warning` oder `info`. Die Prüfung läuft

- lokal und in CI über `npm run content:check`,
- vor jedem Seeding (`npm run seed`, API-Start mit `SEED_ON_START=true`) – bei Fehlern wird **nicht** geladen,
- optional mit `--external` (`npm run content:check:links`) inklusive HTTP-Prüfung aller Quellen-URLs.

Die einzelnen Regeln sind in [inhalte-redaktion.md](inhalte-redaktion.md#qualitätsregeln) beschrieben.

### 1.3 Zentrale Datenbank

Es gibt **genau eine** Datenbank (`.data/medtech-world.db`, konfigurierbar über `DATABASE_PATH`). Sie wird über `node:sqlite` (in Node.js ≥ 22.13 enthalten, keine native Zusatzabhängigkeit) betrieben, mit `PRAGMA foreign_keys = ON`, WAL-Journal und `busy_timeout`. Das Schema wird über versionierte Migrationen (`schema_migrations`) in `packages/data/src/database.ts` gepflegt.

Zugriff ausschließlich über Repositories:

| Repository | Aufgabe |
| --- | --- |
| `ContentRepository` | Lesen von Inhalten: Listen, Detail mit Specs/Quellen/Relationen, Relationsgruppen inkl. Gegenrichtung, Modulzuordnung, Volltextsuche, Qualitätsbericht, Quellen |
| `UserRepository` | Konten, Passwort-Hashing, Sitzungen, Einstellungen, Favoriten, Lernfortschritt, Notizen, Lernhistorie, Market-Anfragen, DSGVO-Export und -Löschung |

`createDataLayer({ path })` bündelt beides und wird von API, Skripten und Tests gleichermaßen genutzt (Tests verwenden `':memory:'`).

### 1.4 REST-API

`apps/api` stellt mit Fastify eine einheitliche JSON-API unter `/api/v1` bereit (Referenz: [api.md](api.md)). `buildApp(dataLayer, config)` erzeugt die Anwendung ohne zu lauschen – dadurch ist sie vollständig mit `app.inject()` testbar. `server.ts` lädt Konfiguration, seedet optional, legt ggf. Administrations- bzw. Demo-Konten an und startet den Server. In Produktion liefert dieselbe Anwendung das gebaute Frontend (`apps/web/dist`) inklusive SPA-Fallback aus.

### 1.5 Web-Frontend

Die React-SPA besteht aus

- **Shell** (`apps/web/src/shell`): Layout mit Navigation über alle Module, globale Suche, einheitliche Detailseite `/e/:typ/:slug` (`EntityPage`), generische Modul-Startseite (`ModuleLanding`).
- **Plattformseiten** (`apps/web/src/pages`): Startseite, Suche, Konto (Anmeldung, Favoriten, Fortschritt, Notizen, Verlauf, Einstellungen), Administration, Qualitätsbericht, Quellenverzeichnis, Datenschutz.
- **Modulen** (`apps/web/src/modules/<id>`), die in `modules/registry.ts` registriert sind.
- **Designsystem** `@medtech/ui` (Komponenten wie `Card`, `EntityCard`, `SpecTable`, `SourceList`, `RelationGroups`, `QualityBadges`, Markdown mit Wiki-Links, Icon-Set, CSS-Tokens `mw-*`).
- **API-Client & Hooks** (`apps/web/src/lib`): typisierter Client (DTOs aus `@medtech/core`), `useEntity`, `useSearch`, `useAuth` usw.

## 2. Datentrennung: Inhalte vs. Nutzerdaten

Die Datenbank hat zwei streng getrennte Bereiche:

| | Inhalte | Nutzerdaten |
| --- | --- | --- |
| Tabellen | `entities`, `relations`, `specs`, `sources`, `entity_sources`, `search_index`, `content_meta` | `users`, `sessions`, `user_settings`, `favorites`, `progress`, `notes`, `history`, `inquiries` |
| Herkunft | `content/` (Git) | Nutzung der Plattform |
| Lebenszyklus | bei jedem Seeding vollständig neu aufgebaut (in einer Transaktion) | persistent, vom Seeding unberührt |
| Verweise | über Fremdschlüssel untereinander | auf Inhalte nur über **stabile Entitäts-IDs** (`typ:slug`), ohne Fremdschlüssel |

Weil Nutzerdaten Inhalte nur über IDs referenzieren, überleben Favoriten, Fortschritt und Notizen jedes Neu-Seeding. Verschwindet ein Inhalt, liefert die API den Eintrag mit `entity: null`, statt Nutzerdaten zu verlieren. Alle Nutzertabellen hängen per `ON DELETE CASCADE` an `users` – das Löschen eines Kontos entfernt sämtliche personenbezogenen Daten.

## 3. Modulvertrag (`WebModule`)

Module sind eigenständig nutzbar (eigene Route `MODULES[id].path/*`), haben aber **keine eigenen Datenbestände**: Sie lesen ausschließlich über die zentrale API. Der Vertrag (`apps/web/src/modules/types.ts`):

```ts
interface WebModule {
  id: ModuleId;                                  // 'wiki' | 'repair' | … | 'career'
  Root: LazyExoticComponent<ComponentType>;      // Startseite + Unterseiten, lazy geladen
  entityPanels?: EntityPanel[];                  // Erweiterungen der einheitlichen Detailseite
  entityActions?: (entity: EntityDetail) => EntityAction[]; // z. B. „Im Simulator öffnen“
}

interface EntityPanel {
  types: EntityType[];                           // für welche Inhaltstypen
  title: string;
  icon?: IconName;
  placement?: 'main' | 'aside';
  Component: ComponentType<{ entity: EntityDetail }> | LazyExoticComponent<…>;
}
```

Die Detailseite fragt über `panelsFor(entity)` und `actionsFor(entity)` alle Module ab. So zeigt etwa die Seite `device:pulsoximeter` gleichzeitig die 3D-Vorschau (Explorer), die Fehlerbilder (Repair Lab), die Simulation (Simulator) und passende Ersatzteile (Market) – ohne dass die Module voneinander wissen.

Die Modul-Metadaten (Name, Route, Akzentfarbe, Icon, Ausbaustufe) stehen zentral in `packages/core/src/modules.ts`. Ein neues Modul wird dort und in `apps/web/src/modules/registry.ts` registriert.

## 4. Sicherheit & Datenschutz

| Maßnahme | Umsetzung |
| --- | --- |
| Passwort-Hashing | scrypt (N = 2¹⁵, r = 8, p = 1, 16-Byte-Salt, 64-Byte-Hash), Vergleich mit `timingSafeEqual`; Parameter im Hash gespeichert (Upgrade-fähig). Passwortrichtlinie: ≥ 10 Zeichen, Buchstaben + Ziffer/Sonderzeichen |
| Kein User-Enumeration-Timing | Bei unbekannter E-Mail wird trotzdem ein Hash berechnet |
| Sitzungen | 32-Byte-Zufallstoken, in der Datenbank nur als SHA-256-Hash gespeichert; 14 Tage gültig; Passwortänderung beendet alle Sitzungen |
| Cookies | `mw_session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, in Produktion `Secure` |
| CSRF | Alle schreibenden `/api/*`-Anfragen (POST, PUT, PATCH, DELETE) benötigen den Header `x-medtech-client: 1` – Browser setzen ihn cross-site nicht ohne CORS-Freigabe; die API erteilt keine CORS-Freigaben |
| Sicherheitsheader | `Content-Security-Policy` (`default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'` …), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, in Produktion `Strict-Transport-Security`; `Cache-Control: no-store` für persönliche Antworten |
| Rate-Limits | In-Memory, Fixed Window pro IP: Registrierung/Anmeldung/Passwortänderung/Kontolöschung je 10 pro Minute, Copilot 20 pro Minute (`429` mit `Retry-After`) |
| RBAC | Rollen `learner`, `technician`, `editor`, `admin` mit Berechtigungen (`packages/core/src/permissions.ts`); Gäste dürfen lesen und den Copilot nutzen. Administratoren können sich nicht selbst herabstufen |
| Eingabevalidierung | Jede Route validiert Parameter, Query und Body mit zod (`400` mit verständlicher Meldung), Body-Limit 256 KiB |
| Antwortschutz | Quizlösungen und Erklärungen werden nie über Detail- oder Such-Endpunkte ausgeliefert, nur über die serverseitige Auswertung |
| Rendering | Markdown wird ohne `dangerouslySetInnerHTML` gerendert; SVG-Medien nur als `<img>` (data-URL) |
| Logging | In Produktion strukturiert; `Cookie`- und `Authorization`-Header werden geschwärzt |
| DSGVO | Art. 15/20: `GET /api/v1/me/export` (maschinenlesbarer Export); Art. 17: `DELETE /api/v1/me` (mit Passwortbestätigung, Kaskadenlöschung) |
| Datenminimierung | Gäste benötigen kein Konto; gespeichert werden nur E-Mail, Anzeigename, Rolle und die selbst erzeugten Lerndaten; Lernhistorie abschaltbar (`trackHistory: false` löscht sie sofort), Historie auf 500 Einträge begrenzt und dedupliziert |
| Copilot | Antworten nur auf Basis der Wissensbasis; Hinweis, dass Herstellerunterlagen und Fachpersonal maßgeblich bleiben; Frage und Dokumente werden nur im LLM-Modus an die Claude-API übermittelt, keine Nutzerdaten |

## 5. Performance

- **Volltextsuche mit FTS5:** virtuelle Tabelle `search_index` (Tokenizer `unicode61 remove_diacritics 2`, Präfixindizes für 2 und 3 Zeichen), Ranking mit gewichtetem BM25 (Titel > Aliase > Tags > Zusammenfassung > Text), danach Bonus für exakte Titel-/Aliastreffer und Gewichtung nach Inhaltstyp. Eingaben werden mit NFKC normalisiert (`SpO₂` = `SpO2`) und in sichere Tokens zerlegt – FTS-Syntax aus Nutzereingaben ist damit wirkungslos.
- **Indizes:** `entities(type, title)`, `relations(to_id, rel)` für die Gegenrichtung, `specs(key)`, `sessions(user_id)`, `notes(user_id, entity_id)`, `history(user_id, at DESC)`.
- **Mengenabfragen** über `json_each(?)` statt N+1-Abfragen (Kurzinfos, Vorschaubilder).
- **Frontend:** Modul-Roots, Detail-Panels und Unterseiten werden per `React.lazy` nachgeladen; three.js und React liegen in eigenen Chunks (`manualChunks` in `apps/web/vite.config.ts`), sodass der 3D-Code nur beim Öffnen einer 3D-Ansicht geladen wird.
- **Statische Auslieferung** mit `maxAge` 1 h; API-Antworten sind kompakt (Kurzinfos statt Vollobjekten in Listen).

## 6. Erweiterbarkeit & Weg zu PostgreSQL

- **Neuer Inhaltstyp:** Typ in `entity-types.ts`, Datenschema in `schemas.ts`, ggf. Relationen in `relations.ts`; Seeding, Suche und Detailseite funktionieren generisch.
- **Neue Relation:** Eintrag in `RELATION_DEFS` mit erlaubten Quell-/Zieltypen sowie Beschriftung für beide Richtungen.
- **Neues Modul:** `MODULES` in `@medtech/core` und `WebModule` in der Registry; die Shell übernimmt Navigation, Routing und Detailseiten-Integration.
- **PostgreSQL:** Der Datenzugriff ist auf zwei Repositories konzentriert; SQL ist überwiegend Standard-SQL. Für einen Wechsel sind anzupassen: Treiber und Migrationen (`database.ts`), `json_each` → `jsonb_array_elements`, FTS5 → `tsvector`/`GIN` mit deutscher Konfiguration (oder `pg_trgm`), `INSERT OR IGNORE/REPLACE` → `ON CONFLICT`, synchrone → asynchrone Repository-Methoden. Inhalte bleiben Git-basiert; das Seeding schreibt dann in Postgres.
- **Mehrinstanzbetrieb:** Rate-Limits liegen derzeit im Speicher einer Instanz (siehe `createRateLimiter` in `apps/api/src/http.ts`) – für horizontale Skalierung durch Redis o. ä. ersetzen.

## 7. Architekturentscheidungen (ADR)

### ADR-001: Eine zentrale Datenbasis für alle Module
- **Kontext:** Acht Module behandeln dieselben Geräte, Komponenten und Rechtsgrundlagen.
- **Entscheidung:** Ein gemeinsamer Wissensgraph aus typisierten Entitäten (`typ:slug`) und typisierten Relationen; Module besitzen keine eigenen Inhalte.
- **Konsequenzen:** Keine Dubletten oder widersprüchlichen Kopien; jede Pflege wirkt in allen Modulen. Module sind über die gemeinsame Detailseite erweiterbar, aber an das zentrale Schema gebunden.

### ADR-002: Inhalte als JSON in Git statt Redaktions-CMS
- **Kontext:** Fachinhalte müssen belegt, geprüft und nachvollziehbar sein.
- **Entscheidung:** Inhalte werden als JSON-Dateien gepflegt, per Pull Request reviewt und automatisch geprüft; die Datenbank ist ein reproduzierbares Abbild.
- **Konsequenzen:** Vollständige Historie, Vier-Augen-Prinzip, CI-Qualitätsgate. Für Redakteurinnen ohne Git-Kenntnisse ist eine Redaktionsoberfläche geplant (Stufe 2).

### ADR-003: SQLite über `node:sqlite` mit FTS5
- **Kontext:** Stufe 1 braucht einfache Installation, schnelle Volltextsuche und keine Infrastruktur.
- **Entscheidung:** Eingebautes `node:sqlite` (keine nativen Build-Abhängigkeiten), FTS5 für die Suche, WAL für parallele Leser.
- **Konsequenzen:** Ein-Datei-Betrieb, Tests in `:memory:`. Eine Instanz schreibt; für hohe Last oder Mandantenfähigkeit ist der Wechsel zu PostgreSQL vorbereitet (Repository-Kapselung).

### ADR-004: Relationen einmal speichern, Gegenrichtung beim Lesen erzeugen
- **Entscheidung:** Jede Relation wird genau einmal (`from → to`) mit erlaubten Typen gespeichert; `inverseLabel` erzeugt die Rückrichtung; symmetrische Relationen (`related`) werden dedupliziert.
- **Konsequenzen:** Konsistente Verknüpfungen; unzulässige Richtungen werden in der QA abgewiesen.

### ADR-005: Technische Daten und Quellen als eigene Tabellen
- **Entscheidung:** `specs` (eine Zeile pro Angabe, Pflichtquelle, optionale Bedingung) und `sources` statt Freitext in den Entitäten.
- **Konsequenzen:** Widersprüche (gleicher Schlüssel und gleiche Bedingung, aber anderer Wert) sind automatisch erkennbar; jede Angabe ist belegt; das Quellenverzeichnis zeigt, wo eine Quelle verwendet wird.

### ADR-006: Cookie-Sitzungen statt JWT
- **Entscheidung:** Serverseitige Sitzungen (gehashte Tokens) in `HttpOnly`-Cookies plus CSRF-Header.
- **Konsequenzen:** Sofortiger Widerruf (Logout, Passwortwechsel, Kontolöschung), kein Token im JavaScript-Zugriff. Erfordert Same-Origin-Betrieb von SPA und API (Vite-Proxy in der Entwicklung, gemeinsame Auslieferung in Produktion).

### ADR-007: Copilot als RAG mit Retrieval-Fallback
- **Entscheidung:** Der Copilot sucht passende Inhalte über die zentrale Suche und lässt nur diese von einem Sprachmodell (Claude) zusammenfassen – mit Zitaten `[n]`. Ohne API-Schlüssel oder bei Fehlern liefert er die belegten Treffer ohne generierten Text.
- **Konsequenzen:** Keine Antworten ohne Beleg; die Plattform funktioniert vollständig ohne externen Dienst.

### ADR-008: Frontend als SPA mit Modul-Registry
- **Entscheidung:** Eine React-SPA mit gemeinsamer Shell; Module werden lazy geladen und erweitern die Detailseite über `entityPanels`/`entityActions`.
- **Konsequenzen:** Einheitliches Erscheinungsbild und eine Anmeldung für alle Module; Module bleiben unabhängig entwickelbar.
