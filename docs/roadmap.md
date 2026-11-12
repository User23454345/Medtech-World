# Roadmap – Entwicklungsstrategie

MedTech World wird in drei Stufen ausgebaut. Leitprinzip jeder Stufe: **erst die gemeinsame Basis, dann die Breite.** Neue Funktionen nutzen immer die zentrale Datenbasis, das gemeinsame Nutzerkonto und das Designsystem – es entstehen keine Insellösungen.

Die Stufe eines Moduls ist in `packages/core/src/modules.ts` (`stage`) hinterlegt.

## Stufe 1 – Fundament ✔ (umgesetzt)

**Ziel:** eine tragfähige, geprüfte Wissensbasis, auf der alle Module aufsetzen.

| Bereich | Stand |
| --- | --- |
| Domänenmodell | 16 Inhaltstypen, 18 typisierte Relationen mit erlaubten Richtungen, zod-Schemas, Rollen & Rechte (`@medtech/core`) |
| Inhalte | Git-versionierte JSON-Inhalte zu Monitoring, Beatmung, Infusion, Kardiologie, elektrischer Sicherheit, Recht, Ausbildung und Karriere |
| Qualitätssicherung | automatische Prüfung (Schema, Dubletten, Widersprüche, Belege, Herstellerangaben, Demo-Regeln, tote Links, Aktualität, Rechtsstand) als CI-Gate |
| Datenbank | zentrale SQLite-Datenbank (`node:sqlite`) mit FTS5-Volltextsuche, getrennte Inhalts- und Nutzerdaten |
| API | einheitliche REST-API `/api/v1` mit Sitzungen, RBAC, CSRF-Schutz, Rate-Limits, Sicherheitsheadern, DSGVO-Export/-Löschung |
| Frontend | SPA mit gemeinsamer Shell, einheitlicher Detailseite, globaler Suche, Konto-Funktionen und Modul-Registry |
| Module | Wiki, Repair Lab und Prüfakademie vollständig; 3D Explorer, Market, Simulator, Copilot und Career Hub als funktionsfähige erste Ausbaustufe |
| Betrieb | Tests (Vitest), CI-Workflow, Docker-Image |

## Stufe 2 – Vertiefung & Redaktion (nächste Schritte)

**Ziel:** mehr Inhalte schneller und sicherer pflegen, Suche und Module vertiefen, Betrieb skalierbar machen.

1. **PostgreSQL als Produktionsdatenbank**
   - Repository-Schicht auf asynchrone Methoden umstellen; Treiber und Migrationen ergänzen.
   - FTS5 → `tsvector` mit deutscher Textsuche-Konfiguration und `GIN`-Index; `json_each` → `jsonb_array_elements`.
   - SQLite bleibt für Entwicklung und Tests erhalten (gleiche Repository-Schnittstelle).
2. **Volltextsuche mit Synonymen**
   - Kuratiertes Synonym- und Abkürzungswörterbuch (z. B. „STK“ ↔ „sicherheitstechnische Kontrolle“, „NIBP“ ↔ „nichtinvasive Blutdruckmessung“), Kompositazerlegung für deutsche Fachbegriffe, Tippfehlertoleranz (Trigramme).
   - Suchanalyse: Anfragen ohne Treffer als Redaktionsaufgaben auswerten (anonymisiert).
3. **Redaktionsoberfläche**
   - Formularbasierte Bearbeitung mit Live-Validierung durch dieselben QA-Regeln; Speichern erzeugt einen Pull Request (Git bleibt maßgeblich).
   - Review-Status, Zuweisung von Prüfenden, Erinnerungen bei fälligem Rechtsstand, Vergleichsansicht von Änderungen.
   - Quellenverwaltung mit Dublettenprüfung und Zitiervorschlägen.
4. **Externe Link-Prüfung als nächtlicher Job**
   - `npm run content:check:links` täglich ausführen (bisher wöchentlich in CI), Ergebnisse im Qualitätsbericht anzeigen und automatisch Issues für tote Quellen-URLs anlegen.
5. **Module vertiefen**
   - 3D Explorer: detailliertere Modelle (glTF), Explosionsansichten, Annotationen aus der Datenbasis.
   - Simulator: weitere Engines (z. B. NIBP, Kapnografie, Defibrillator-Energieabgabe), geführte Übungen mit Bewertung.
   - Prüfakademie: Prüfprotokolle als PDF, Lernpfade mit Zertifikaten, Fragenpools mit Zufallsauswahl.
   - Repair Lab: Fallsammlung und Rückmeldung, ob die Diagnose geholfen hat.
6. **Betrieb:** verteilte Rate-Limits (Redis), strukturierte Metriken und Tracing, Backups mit Wiederherstellungstest.

## Stufe 3 – Plattform & Ökosystem

**Ziel:** MedTech World für Organisationen, mehrere Sprachen und reale Marktpartner öffnen.

1. **SSO/OIDC** – Anmeldung über Identitätsanbieter von Kliniken, Hochschulen und Unternehmen (OpenID Connect), optional SAML; Rollen-Mapping aus Gruppen.
2. **Mandanten** – Organisationen mit eigenen Nutzergruppen, Lernpfaden, internen Dokumenten und Gerätebeständen; strikte Datentrennung zwischen Mandanten, gemeinsame öffentliche Wissensbasis.
3. **Mehrsprachigkeit** – Übersetzungen pro Entität (Deutsch als Referenzsprache), sprachspezifische Suche, englische Fachbegriffe bereits im Datenmodell (`term.english`).
4. **Echte Market-Anbindung** – geprüfte Händler über Schnittstellen, Kompatibilitätsdaten aus der Wissensbasis, Rechtsprüfung (Medizinprodukterecht, Wettbewerbsrecht), klare Trennung von Inhalten und Werbung.
5. **Offline/PWA** – installierbare App mit Offline-Zugriff auf favorisierte Inhalte, Prüfverfahren und Checklisten (z. B. für den Einsatz in Technikräumen ohne Netz), Synchronisation von Fortschritt und Notizen.
6. **Copilot ausbauen** – Konversationsverlauf (opt-in), Antworten mit Diagrammen und Diagnosebäumen, Bewertung von Antworten zur Qualitätsverbesserung, strengere Grounding-Prüfung.
7. **Career Hub** – Kompetenzprofile auf Basis des Lernfortschritts, Weiterbildungsangebote und Stellenbörse.

## Querschnittsthemen in allen Stufen

- **Qualität vor Menge:** jede neue Inhaltskategorie bekommt eigene QA-Regeln.
- **Datenschutz:** Datenminimierung, Löschkonzepte und Export für jede neue Datenart.
- **Barrierefreiheit:** WCAG 2.2 AA als Abnahmekriterium für neue Oberflächen.
- **Rechtsaktualität:** Prüfintervalle für Rechtsgrundlagen einhalten; Änderungen an MDR, MPDG und MPBetreibV beobachten.
