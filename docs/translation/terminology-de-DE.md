# de-DE Terminologie- und UI-Text-Richtlinien

Dieses Dokument definiert die Terminologie für die deutsche (`de-DE`) Benutzeroberfläche und Dokumentation von ScriptCat. Es dient dazu, Produktkonzepte eindeutig zu benennen, UI-Texte natürlich zu formulieren und technische Bezeichner bei künftigen Übersetzungen unverändert zu erhalten.

Geprüfte Verwendungsquelle: `src/locales/de-DE/*.json`

## Grundsätze

1. Verwende kurze, idiomatische deutsche UI-Texte, die Handlung oder Zustand eindeutig benennen.
2. Behalte die Unterscheidung zwischen `Benutzerskript`, `Seitenskript`, `Hintergrundskript` und `Geplantes Skript` bei; die Typen sind nicht austauschbar.
3. Ersetze Begriffe nicht global nach Wortlaut. Prüfe Funktion, UI-Kontext und Satzzusammenhang.
4. Behalte technische Begriffe und Bezeichner wie `Regex`, `Cron-Ausdruck`, `@match`, `@exclude`, `@grant`, `@connect`, `@resource` und `@require` unverändert oder technisch gleichwertig.
5. Verändere keine Placeholder, HTML/React-Tags, i18next-Interpolation, URLs oder Metadaten-Bezeichner im Rahmen einer sprachlichen Überarbeitung.
6. Die unten genannten Keys dokumentieren die derzeitige Verwendung oder bekannte Prüfpunkte; dieselben Regeln gelten für neue Texte mit derselben Bedeutung.

## Kategorien

| Kategorie | Verwendung |
| --- | --- |
| **A. Produkt- und Funktionsbegriffe** | Namen für ScriptCat-Funktionen und Skripttypen. |
| **B. UI-Aktionen und Zustände** | Bevorzugte Formulierungen für Bedienelemente und Statusmeldungen. |
| **C. Kontextabhängige Begriffe** | Begriffe, deren beste Formulierung vom konkreten UI-Kontext abhängt. |
| **D. Technische Begriffe beibehalten** | Bezeichner und Fachbegriffe, deren technische Bedeutung erhalten bleiben muss. |
| **E. Spätere Prüfpunkte** | Bestehende Texte, die in einer gesonderten Überarbeitung geprüft werden sollten. |

## A. Produkt- und Funktionsbegriffe

| Konzept | Bevorzugte Formulierung | Aktuelle Beispiel-Keys | Hinweise |
| --- | --- | --- | --- |
| ScriptCat browser extension | `ScriptCat-Erweiterung` | `start_guide_title`, `ext_update_notification` | Produktname als `ScriptCat` schreiben. |
| generic user script | `Benutzerskript` | `create_user_script`, `guide_script_list_content` | Allgemeine Bezeichnung für ein Userscript. |
| Tampermonkey-compatible script type | `Tampermonkey-Skript` | `script_status_tooltip` | Nicht zu einem allgemeinen Skripttyp verkürzen. |
| page script | `Seitenskript` | `page_script`, `foreground_page_script_tooltip` | Skript, das auf angegebenen Seiten ausgeführt wird. |
| background script | `Hintergrundskript` | `create_background_script`, `background_script` | Produkttyp für Ausführung im Hintergrund. |
| scheduled script | `Geplantes Skript` | `create_scheduled_script`, `scheduled_script` | Produkttyp für geplante Ausführung; nicht ohne Kontext in `Cron-Skript` umbenennen. |
| script synchronization | `Skript-Synchronisation` | `script_sync`, `sync_status` | Bei Löschungen klarstellen, ob ein Löschstatus synchronisiert wird. |
| subscription | `Abonnement` | `subscribe_url`, `install_subscribe`, `subscribe_import_progress` | `Abonnieren` nur für die Aktion verwenden. |
| script gallery / market | `Skript-Galerie` / `Skript-Markt` | `script_gallery`, `guide_script_list_title` | Nach dem tatsächlichen Zielbereich benennen. |

## B. UI-Aktionen und Zustände

| Konzept | Bevorzugte Formulierung | Aktuelle Beispiel-Keys | Hinweise |
| --- | --- | --- | --- |
| create | `Erstellen` | `create_script`, `create_background_script` | Mit Objekt verwenden, wenn ein Button sonst unklar wäre. |
| save / save as | `Speichern` / `Speichern unter` | `save`, `save_as` | Standardformulierungen für Datei- und Einstellungsaktionen. |
| import / export | `Importieren` / `Exportieren` | `import`, `export`, `import_file`, `export_file` | Als Aktionen verwenden; Nomen nur in zusammengesetzten Labels. |
| install / update | `Installieren` / `Aktualisieren` | `install_script`, `update_script` | Zielobjekt ergänzen, falls erforderlich. |
| run / runtime | `Ausführen` / `Laufzeit` | `run`, `runtime`, `log_title` | Für Ausführungsprotokolle ist `Ausführungsprotokoll` passend. |
| enable / disable | `Aktivieren` / `Deaktivieren`; Zustände `Aktiviert` / `Deaktiviert` | `enable`, `disable`, `updatepage.enabled` | Nicht mit Öffnen/Schließen verwechseln. |
| settings | `Einstellungen` | `settings`, `script_setting.title` | Für benutzerseitige Konfigurationen. |
| permission | `Berechtigung` | `permission`, `request_permission` | Für Zugriffsrechte und Abfragen. |
| connect / sync | `Verbinden` / `Synchronisieren` | `connect`, `script_sync` | Verbindung und Datensynchronisation getrennt halten. |
| directory | `Verzeichnis` | `open_directory`, `open_backup_dir` | Für Dateisystemfunktionen des Tools. |
| browser tab | `Tab` | `close_current_tab`, `close_other_tabs` | Browser-Tabs nicht als `Bezeichnungen` benennen. |

## C. Kontextabhängige Begriffe

| Konzept | Mögliche Formulierung | Entscheidungsregel | Aktuelle Beispiel-Keys |
| --- | --- | --- | --- |
| local / cloud | `Lokal` / `Cloud` | Für Quelle, Speicherort oder Synchronisationsziel verwenden; bei Bedarf Objekt ergänzen. | `local`, `cloud`, `source_local_script` |
| panel / console | `Panel` / `Konsole` | Bedienoberfläche als `Panel`, Entwicklerausgabe als `Konsole` benennen. | `scheduled_script_description_title`, `build_success_message` |
| source | `Quelle`, `Installationsquelle`, `Abonnementquelle` | Benennen, was die Quelle liefert. | `source`, `install_source`, `subscribe_source_tooltip` |
| storage | `Speicher`, `Speicherplatz`, `Speicher-API` | Nach Datenablage, zugewiesenem Speicherplatz oder API unterscheiden. | `script_storage`, `script_operation_description`, `storage_api` |
| sync deletion | `Löschstatus synchronisieren` / `Löschungen synchronisieren` | Erst nach Bestätigung des tatsächlichen Verhaltens vereinheitlichen. | `sync_delete`, `sync_delete_desc`, `notification.script_sync_delete` |

## D. Technische Begriffe beibehalten

| Konzept | Verwenden | Aktuelle Beispiel-Keys | Grund |
| --- | --- | --- | --- |
| regular expression | `Regex` / `regulärer Ausdruck` | `search_regex` | Etablierter Entwicklerbegriff. |
| cron expression | `Cron-Ausdruck` | `cron_invalid_expr`, `error_cron_invalid` | Bezeichnet die akzeptierte Syntax präzise. |
| expression | `Ausdruck` | `value_export_expression`, `expression_format_error` | Technische Bedeutung eines eingegebenen oder ausgewerteten Ausdrucks. |
| watch file changes | `Datei überwachen` / `Überwachung stoppen` | `watch_file`, `stop_watch_file` | Bezeichnet die laufende Dateibeobachtung. |
| metadata declaration | `Deklaration` | `error_metadata_line_duplicated` | Begriff der Metadaten-Syntax. |
| product/API identifiers | `ESLint`, `VSCode`, `Cookie`, `GM API`, `@match`, `@exclude`, `@grant`, `@connect`, `@resource`, `@require` beibehalten | `enable_eslint`, `vscode_url`, `confirm_operation_description`, `script_resource_tooltip` | Namen und Codebezeichner müssen erkennbar bleiben. |

## E. Spätere Prüfpunkte

Die folgenden Einträge beschreiben bereits vorhandene Auffälligkeiten. Dieses Dokument ändert die Laufzeittexte nicht; eine Korrektur sollte separat mit UI-Prüfung erfolgen.

| Thema | Aktueller Stand | Empfohlene Richtung | Aktuelle Beispiel-Keys |
| --- | --- | --- | --- |
| browser tabs | Die Ausführungsumgebung enthält `Alle Bezeichnungen`, während Schließen-Aktionen `Tab` verwenden. | Falls `script_run_env` Browser-Tabs bezeichnet, durchgängig `Alle Tabs`, `Normale Tabs`, `Inkognito-Tabs` verwenden. | `script_run_env.all`, `close_current_tab` |
| scheduled script expression label | `Geplante Aufgaben-Ausdruck` ist grammatisch unklar. | Nach Bestätigung der Funktion etwa `Ausdruck für geplante Aufgabe` verwenden. | `scheduled_script_description_description_expr` |
| ScriptCat capitalization | Einige Einstiegstexte können eine abweichende Produkt-Schreibung enthalten. | Produktnamen stets als `ScriptCat` schreiben. | `start_guide_title`, `ext_update_notification` |
| documentation link locale | Deutsche UI-Texte verweisen teilweise auf `/en/`-Dokumentation. | Nur ändern, wenn ein entsprechendes deutsches Ziel verfügbar ist. | `guide_script_list_content`, `develop_mode_guide` |

## Checkliste für AI und Mitwirkende

Beim Hinzufügen oder Bearbeiten deutscher Texte:

1. Prüfe, dass das Ziel-Locale `de-DE` ist, und lies diese Richtlinie sowie benachbarte bestehende Strings.
2. Bewahre die Unterscheidung der Skripttypen und verwende für gleiche Funktionen dieselben Produktbegriffe.
3. Prüfe bei kontextabhängigen Begriffen die tatsächliche Funktion und den UI-Ort vor einer Änderung.
4. Erhalte technische Begriffe, Placeholder, Tags, Interpolation, URLs und Metadaten-Bezeichner.
5. Behandle Prüfpunkte als gesonderte Überarbeitung und nicht als Aufforderung zu globalem Ersetzen.
6. Suche vor der Auslieferung in neuem oder geändertem Text nach inkonsistenten Skripttypen, Tab-Bezeichnungen und veränderten Identifikatoren.
