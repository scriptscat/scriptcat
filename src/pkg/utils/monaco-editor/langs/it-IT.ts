const grantValuePrompts = {
  none: "Non richiede permessi speciali per le API GM; lo script si comporta in modo simile a un normale script di pagina.",
  unsafeWindow: "Accede all'oggetto window della pagina per interagire con gli script nativi della pagina.",
  GM_getValue: "Legge un valore dall'archiviazione persistente dello script.",
  GM_getValues: "Legge più valori dall'archiviazione persistente dello script.",
  GM_setValue: "Scrive un valore nell'archiviazione persistente dello script.",
  GM_setValues: "Scrive più valori nell'archiviazione persistente dello script.",
  GM_deleteValue: "Elimina un valore dall'archiviazione persistente dello script.",
  GM_deleteValues: "Elimina più valori dall'archiviazione persistente dello script.",
  GM_listValues: "Elenca tutte le chiavi presenti nell'archiviazione persistente dello script.",
  GM_addValueChangeListener: "Rileva le modifiche ai valori archiviati dello script.",
  GM_removeValueChangeListener: "Rimuove un listener per le modifiche ai valori archiviati dello script.",
  GM_xmlhttpRequest:
    "Effettua richieste di rete cross-origin; in genere gli host di destinazione devono essere autorizzati con @connect.",
  GM_download:
    "Scarica file. Accetta un URL e un nome file, oppure un oggetto di dettagli con campi come url, name, headers e saveAs, e restituisce un handle annullabile.",
  GM_openInTab: "Apre una nuova scheda, con opzioni come l'apertura in primo piano o in background.",
  GM_closeInTab: "Chiude una scheda aperta o gestita dallo script.",
  GM_getTab: "Legge i dati temporanei associati alla scheda corrente.",
  GM_saveTab: "Salva i dati temporanei associati alla scheda corrente.",
  GM_getTabs: "Legge tutti i dati temporanei delle schede salvati dallo script.",
  GM_notification: "Mostra una notifica del browser e gestisce eventi come il clic o la chiusura.",
  GM_closeNotification: "Chiude una specifica notifica dello script.",
  GM_updateNotification: "Aggiorna una specifica notifica dello script.",
  GM_setClipboard: "Scrive negli appunti di sistema.",
  GM_registerMenuCommand: "Registra un comando nel menu dello script.",
  GM_unregisterMenuCommand: "Rimuove un comando dal menu dello script.",
  CAT_registerMenuInput: "API ScriptCat: registra un comando di menu dello script con un campo di input.",
  CAT_unregisterMenuInput: "API ScriptCat: rimuove un comando di menu dello script con un campo di input.",
  GM_addStyle: "Inserisce CSS nella pagina.",
  GM_addElement: "Crea un elemento e lo inserisce nella pagina.",
  GM_getResourceText: "Legge il contenuto testuale di una risorsa dichiarata con @resource.",
  GM_getResourceURL: "Ottiene l'URL di una risorsa dichiarata con @resource.",
  GM_cookie: "Accede alla Cookie API per leggere, scrivere o eliminare i cookie.",
  CAT_fetchBlob: "API interna di ScriptCat: legge una risorsa accessibile lato estensione e restituisce un Blob.",
  CAT_fileStorage: "API ScriptCat: accede all'archiviazione file dello script.",
  CAT_userConfig: "API ScriptCat: accede alla configurazione utente dello script.",
  CAT_scriptLoaded: "API ScriptCat: attende il caricamento completo dello script negli scenari con @early-start.",
  "window.close": "Consente allo script di chiamare window.close().",
  "window.focus": "Consente allo script di chiamare window.focus().",
  "window.onurlchange": "Consente allo script di rilevare gli eventi di cambio URL.",
} as const;

export default {
  title: "Italiano",
  thisIsAUserScript: "Uno script utente",
  undefinedPrompt: "Suggerimento non definito",
  quickfix: "Correggi il problema {0}",
  addEslintDisableNextLine: "Aggiungi il commento eslint-disable-next-line",
  addEslintDisable: "Aggiungi il commento eslint-disable",
  declareGlobal: "Dichiara '{0}' come variabile globale (/* global */)",
  removeConnectWildcard: "Rimuovi il carattere jolly da @connect: {0}",
  replaceMatchTldWildcardWithInclude: "Sostituisci il carattere jolly del TLD in @match con @include {0}",
  replaceIncludeWithMatch: "Sostituisci @include con @match {0}",
  grantConflict: "@grant none non può essere usato insieme alle API GM. Rimuovi none oppure tutte le API GM.",
  duplicateResourceName: 'Il nome @resource "{0}" è dichiarato più di una volta.',
  unsupportedGrant: "@grant {0} non è supportato da ScriptCat e non avrà effetto.",
  grantValuePrompts,
  prompt: {
    name: "Nome dello script",
    namespace: "Namespace dello script",
    copyright: "Informazioni sul copyright dello script",
    license: "Licenza open source dello script",
    version: "Versione dello script",
    description: "Descrizione dello script",
    icon: "Icona dello script",
    iconURL: "Icona dello script",
    defaulticon: "Icona dello script",
    icon64: "Icona dello script 64x64",
    icon64URL: "Icona dello script 64x64",
    grant: "Richiede permessi speciali per le API dello script",
    author: "Autore dello script",
    "run-at":
      "Quando viene eseguito lo script<br>`document-start`: inserito il prima possibile dopo la corrispondenza dell'URL<br>`document-end`: inserito dopo il caricamento del DOM (immagini e altri contenuti potrebbero essere ancora in caricamento)<br>`document-idle`: inserito dopo il caricamento completo di tutti i contenuti<br>`document-body`: inserito solo quando esiste un elemento body",
    "run-in": "Ambiente in cui viene inserito lo script",
    homepage: "Home page dello script",
    homepageURL: "Home page dello script",
    website: "Home page dello script",
    background: "Script in background",
    include: "Pagine il cui URL corrisponde e su cui viene eseguito lo script",
    match: "Pagine il cui URL corrisponde e su cui viene eseguito lo script",
    exclude: "Pagine il cui URL corrisponde e su cui NON viene eseguito lo script",
    connect: "Siti a cui lo script può accedere",
    resource: "File di risorse importati",
    require: "File JS esterni importati",
    "require-css": "File CSS esterni importati",
    noframes: "Non eseguire lo script all'interno di `<frame>`",
    compatible: "Informazioni di compatibilità mostrate su GreasyFork",
    "inject-into":
      "Contesto di inserimento dello script<br>`content`: inserito nel contesto content<br>`page`: inserito nel contesto della pagina (predefinito)<br>Nota: SC non supporta `inject-into: auto`, che sceglie il contesto in base alla CSP.",
    "early-start":
      "Da usare con `run-at: document-start`. `early-start` permette allo script di essere eseguito ancora prima della pagina, ma può influire sulle prestazioni e limitare le API GM. (Solo SC)",
    unwrap:
      "Fa sì che lo script utente non venga racchiuso nella sandbox e sia inserito ed eseguito direttamente nello scope globale nativo della pagina. <br>Lo script può accedere e modificare direttamente le vere variabili globali della pagina, ma non potrà usare le API privilegiate degli script utente come GM.*. <br>Si usa spesso quando serve un'interazione profonda con gli script nativi della pagina o nella migrazione da normali script di pagina.",
    definition: "Solo ScriptCat: URL di un file `.d.ts` usato per il completamento automatico nell'editor",
    antifeature: `Riguarda i mercati di script: le funzionalità indesiderate devono includere questo valore descrittivo
referral-link: Questo script modifica i link o reindirizza ai link di affiliazione dell'autore
ads: Questo script inserisce pubblicità nelle pagine che visiti
payment: Questo script richiede un pagamento per funzionare correttamente
miner: Questo script svolge attività di mining
membership: Questo script richiede la registrazione come membro per funzionare correttamente
tracking: Questo script traccia le tue informazioni utente`.replace(/\n/g, "<br>"),
    updateURL: "URL usato per verificare gli aggiornamenti dello script",
    downloadURL: "URL usato per scaricare gli aggiornamenti dello script",
    supportURL: "Sito di supporto / pagina per segnalare bug",
    support: "Sito di supporto / pagina per segnalare bug",
    source: "Pagina del codice sorgente dello script",
    scriptUrl: "URL dello script utente a cui fa riferimento uno script di sottoscrizione",
    storageName: "Nome dell'archiviazione dei valori, usato per condividere uno stesso spazio tra più script",
    tag: "Tag dello script, separati da virgole o spazi",
    cloudCat: "Contrassegna lo script come esportabile in un pacchetto di script cloud CloudCat",
    cloudServer: "Servizio cloud CloudCat usato dallo script",
    exportValue: "Valori archiviati da esportare quando si esporta come script cloud",
    exportCookie: "Cookie da esportare quando si esporta come script cloud",
    crontab: `Esempi di crontab per script pianificati (non per gli script cloud)
* * * * * * Esegui ogni secondo
* * * * * Esegui ogni minuto
0 */6 * * * Esegui una volta al minuto 0 ogni 6 ore
15 */6 * * * Esegui una volta al minuto 15 ogni 6 ore
* once * * * Esegui una volta ogni ora
* * once * * Esegui una volta al giorno
* 10 once * * Esegui una volta al giorno tra le 10:00 e le 10:59; se viene eseguito alle 10:04, non verrà rieseguito quel giorno tra le 10:05 e le 10:59
* 1,3,5 once * * Esegui una volta al giorno alle 1:00, 3:00 o 5:00; se viene eseguito alle 1:00, non verrà rieseguito alle 3:00 né alle 5:00
* */4 once * * Verifica ogni 4 ore ed esegui una volta; se viene eseguito alle 4:00, non verrà rieseguito quel giorno alle 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Esegui una volta al giorno tra le 10:00 e le 23:59; se viene eseguito alle 10:04, non verrà rieseguito quel giorno tra le 10:05 e le 23:59
* once 13 * * Esegui una volta ogni ora il 13° giorno di ogni mese
* once(9-17) * * * Esegui una volta all'ora, ogni giorno dalle 9 alle 17
0,30 once * * * Esegui una volta all'ora; tra il minuto 0 e il minuto 30, quello che arriva prima esegue e l'altro viene saltato
* * once(9-18) * * Esegui una volta al giorno dal 9 al 18 di ogni mese
* * * * once(1-5) Esegui una volta a settimana, solo nei giorni feriali da lunedì a venerdì`.replace(/\n/g, "<br>"),
  },
} as const;
