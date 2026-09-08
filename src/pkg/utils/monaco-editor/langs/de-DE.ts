const grantValuePrompts = {
  none: "Fordert keine speziellen GM-API-Berechtigungen an; das Skript läuft eher wie ein normales Seitenskript.",
  unsafeWindow: "Greift auf das window-Objekt der Seite zu, um mit nativen Seitenskripten zu interagieren.",
  GM_getValue: "Liest einen Wert aus dem persistenten Skriptspeicher.",
  GM_getValues: "Liest mehrere Werte aus dem persistenten Skriptspeicher.",
  GM_setValue: "Schreibt einen Wert in den persistenten Skriptspeicher.",
  GM_setValues: "Schreibt mehrere Werte in den persistenten Skriptspeicher.",
  GM_deleteValue: "Löscht einen Wert aus dem persistenten Skriptspeicher.",
  GM_deleteValues: "Löscht mehrere Werte aus dem persistenten Skriptspeicher.",
  GM_listValues: "Listet alle Schlüssel im persistenten Skriptspeicher auf.",
  GM_addValueChangeListener: "Überwacht Änderungen an Skriptspeicherwerten.",
  GM_removeValueChangeListener: "Entfernt einen Listener für Änderungen an Skriptspeicherwerten.",
  GM_xmlhttpRequest:
    "Führt Cross-Origin-Netzwerkanfragen aus; Zielhosts müssen normalerweise mit @connect erlaubt werden.",
  GM_download:
    "Lädt Dateien herunter. Akzeptiert URL und Dateiname oder ein Detailobjekt mit Feldern wie url, name, headers und saveAs und gibt ein abbrechbares Handle zurück.",
  GM_openInTab: "Öffnet einen neuen Tab mit Optionen wie Öffnen im Vorder- oder Hintergrund.",
  GM_closeInTab: "Schließt einen vom Skript geöffneten oder verwalteten Tab.",
  GM_getTab: "Liest temporäre Daten, die dem aktuellen Tab zugeordnet sind.",
  GM_saveTab: "Speichert temporäre Daten, die dem aktuellen Tab zugeordnet sind.",
  GM_getTabs: "Liest alle vom Skript gespeicherten temporären Tabdaten.",
  GM_notification: "Zeigt eine Browserbenachrichtigung an und verarbeitet Ereignisse wie Klick oder Schließen.",
  GM_closeNotification: "Schließt eine bestimmte Skriptbenachrichtigung.",
  GM_updateNotification: "Aktualisiert eine bestimmte Skriptbenachrichtigung.",
  GM_setClipboard: "Schreibt in die Systemzwischenablage.",
  GM_registerMenuCommand: "Registriert einen Skript-Menübefehl.",
  GM_unregisterMenuCommand: "Hebt die Registrierung eines Skript-Menübefehls auf.",
  CAT_registerMenuInput: "ScriptCat-API: Registriert einen Skript-Menübefehl mit Eingabefeld.",
  CAT_unregisterMenuInput: "ScriptCat-API: Hebt die Registrierung eines Skript-Menübefehls mit Eingabefeld auf.",
  GM_addStyle: "Injiziert CSS-Stile in die Seite.",
  GM_addElement: "Erstellt ein Element und fügt es in die Seite ein.",
  GM_getResourceText: "Liest den Textinhalt einer mit @resource deklarierten Ressource.",
  GM_getResourceURL: "Ruft die URL einer mit @resource deklarierten Ressource ab.",
  GM_cookie: "Greift auf die Cookie-API zu, um Cookies zu lesen, zu schreiben oder zu löschen.",
  GM_audio: "Steuert und überwacht den Stumm- und Audiowiedergabestatus des aktuellen Browser-Tabs.",
  CAT_fetchBlob:
    "Interne ScriptCat-API: Liest eine erweiterungsseitig verfügbare Ressource und gibt einen Blob zurück.",
  CAT_fileStorage: "ScriptCat-API: Zugriff auf den Dateispeicher des Skripts.",
  CAT_userConfig: "ScriptCat-API: Zugriff auf die Benutzerkonfiguration des Skripts.",
  CAT_scriptLoaded: "ScriptCat-API: Wartet in @early-start-Szenarien, bis das Skript vollständig geladen ist.",
  "window.close": "Erlaubt dem Skript, window.close() aufzurufen.",
  "window.focus": "Erlaubt dem Skript, window.focus() aufzurufen.",
  "window.onurlchange": "Erlaubt dem Skript, URL-Änderungsereignisse zu überwachen.",
} as const;

export default {
  title: "Deutsch",
  thisIsAUserScript: "Ein Benutzerskript",
  undefinedPrompt: "Undefinierter Prompt",
  quickfix: "{0}-Problem beheben",
  addEslintDisableNextLine: "eslint-disable-next-line Kommentar hinzufügen",
  addEslintDisable: "eslint-disable Kommentar hinzufügen",
  declareGlobal: "'{0}' als globale Variable deklarieren (/* global */)",
  removeConnectWildcard: "@connect-Wildcard entfernen: {0}",
  replaceMatchTldWildcardWithInclude: "@match-TLD-Wildcard durch @include {0} ersetzen",
  replaceIncludeWithMatch: "@include durch @match {0} ersetzen",
  grantConflict: "@grant none kann nicht zusammen mit GM-APIs verwendet werden. Entfernen Sie none oder alle GM-APIs.",
  grantValuePrompts,
  prompt: {
    name: "Skriptname",
    namespace: "Skript-Namensraum",
    copyright: "Urheberrechtsinformationen des Skripts",
    license: "Open-Source-Lizenz des Skripts",
    version: "Skriptversion",
    description: "Skriptbeschreibung",
    icon: "Skript-Symbol",
    iconURL: "Skript-Symbol",
    defaulticon: "Skript-Symbol",
    icon64: "64x64 Skript-Symbol",
    icon64URL: "64x64 Skript-Symbol",
    grant: "Angeforderte spezielle API-Berechtigungen",
    author: "Skriptautor",
    "run-at":
      "Zeitpunkt der Skriptausführung<br>`document-start`: so früh wie möglich nach URL-Match injizieren<br>`document-end`: nach dem Laden des DOM injizieren (Bilder usw. können noch laden)<br>`document-idle`: nach vollständigem Laden aller Inhalte injizieren<br>`document-body`: nur injizieren, wenn ein body-Element vorhanden ist",
    "run-in": "Kontext, in den das Skript injiziert wird",
    homepage: "Skript-Homepage",
    homepageURL: "Skript-Homepage",
    website: "Skript-Homepage",
    background: "Hintergrundskript",
    include: "Seiten-URLs, auf denen das Skript ausgeführt wird",
    match: "Seiten-URLs, auf denen das Skript ausgeführt wird",
    exclude: "Seiten-URLs, auf denen das Skript nicht ausgeführt wird",
    connect: "Websites, auf die das Skript zugreifen darf",
    resource: "Zu ladende Ressourcendateien",
    require: "Zu ladende externe JS-Dateien",
    "require-css": "Zu ladende externe CSS-Dateien",
    noframes: "Skript nicht innerhalb von `<frame>` ausführen",
    compatible: "Kompatibilitätsinformationen für GreasyFork",
    "inject-into":
      "Skript-Injektionskontext<br>`content`: in den Content-Kontext injizieren<br>`page`: in den Seitenkontext injizieren (Standard)<br>Hinweis: SC unterstützt `inject-into: auto` nicht, bei dem der Kontext über CSP gewählt wird.",
    "early-start":
      "Wird mit `run-at: document-start` verwendet. `early-start` lässt das Skript noch vor der Seite laufen, kann aber die Leistung beeinträchtigen und GM-APIs einschränken. (Nur in SC)",
    unwrap:
      "Ermöglicht es, das Benutzerskript ohne Sandbox-Kapselung direkt in den nativen globalen Gültigkeitsbereich der Seite zu injizieren und auszuführen. <br>Das Skript kann direkt auf die tatsächlichen globalen Variablen der Seite zugreifen und diese verändern, kann jedoch keine privilegierten Benutzerskript-APIs wie GM.* verwenden. <br>Wird häufig in Szenarien eingesetzt, die eine tiefe Interaktion mit nativen Seitenskripten erfordern oder bei der Migration von normalen Seitenskripten.",
    definition: "Nur für ScriptCat: URL zu einer `.d.ts`-Datei für Editor-Autovervollständigung",
    antifeature:
      `Bezieht sich auf Script-Marktplätze: unerwünschte Funktionen sollten diesen Beschreibungswert enthalten
referral-link: Dieses Skript modifiziert oder leitet zu den Affiliate-Links des Autors um
ads: Dieses Skript fügt Werbung auf den von Ihnen besuchten Seiten ein
payment: Dieses Skript erfordert eine Zahlung für die normale Nutzung
miner: Dieses Skript hat Mining-Verhalten
membership: Dieses Skript erfordert eine Mitgliedschaftsregistrierung für die normale Nutzung
tracking: Dieses Skript verfolgt Ihre Benutzerinformationen`.replace(/\n/g, "<br>"),
    updateURL: "URL zur Aktualisierungsprüfung des Skripts",
    downloadURL: "URL zum Herunterladen von Skriptaktualisierungen",
    supportURL: "Support-Seite / Bugtracker",
    source: "Quellcode-Seite des Skripts",
    scriptUrl: "Benutzerskript-URL, die von einem Abonnement-Skript referenziert wird",
    storageName: "Speichername für Skriptwerte, um einen Speicherbereich mit mehreren Skripten zu teilen",
    tag: "Skript-Tags, getrennt durch Kommas oder Leerzeichen",
    cloudCat: "Markiert das Skript als exportierbar in ein CloudCat-Cloud-Skriptpaket",
    cloudServer: "Vom Skript verwendeter CloudCat-Clouddienst",
    exportValue: "Skript-Speicherwerte, die beim Export als Cloud-Skript exportiert werden",
    exportCookie: "Cookies, die beim Export als Cloud-Skript exportiert werden",
    crontab: `Beispiele für geplante Skripte (crontab, nicht für Cloud-Skripte)
* * * * * * Jede Sekunde ausführen
* * * * * Jede Minute ausführen
0 */6 * * * Alle 6 Stunden zur Minute 0 ausführen
15 */6 * * * Alle 6 Stunden zur Minute 15 ausführen
* once * * * Einmal pro Stunde ausführen
* * once * * Einmal pro Tag ausführen
* 10 once * * Einmal täglich zwischen 10:00-10:59; wenn um 10:04 ausgeführt, an diesem Tag nicht erneut zwischen 10:05-10:59
* 1,3,5 once * * Einmal täglich um 1:00, 3:00, 5:00; wenn um 1:00 ausgeführt, an diesem Tag nicht erneut um 3:00 oder 5:00
* */4 once * * Alle 4 Stunden prüfen und einmal ausführen; wenn um 4:00 ausgeführt, an diesem Tag nicht erneut um 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Einmal täglich zwischen 10:00-23:59; wenn um 10:04 ausgeführt, an diesem Tag nicht erneut zwischen 10:05-23:59
* once 13 * * Einmal stündlich am 13. Tag jedes Monats ausführen
* once(9-17) * * * Einmal pro Stunde zwischen 9 und 17 Uhr jeden Tag
0,30 once * * * Einmal pro Stunde; Minute 0 oder 30 — der erste Treffer gewinnt, der andere wird übersprungen
* * once(9-18) * * Einmal pro Tag vom 9. bis 18. des Monats
* * * * once(1-5) Einmal pro Woche, nur von Montag bis Freitag`.replace(/\n/g, "<br>"),
  },
} as const;
