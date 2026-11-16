# Linee guida su terminologia e testi dell'interfaccia — it-IT

Questo documento definisce la terminologia dell'interfaccia e della documentazione di ScriptCat in italiano (`it-IT`). L'obiettivo è mantenere riconoscibili i concetti del prodotto, usare testi naturali per un'interfaccia italiana e preservare termini tecnici, identificatori e distinzioni tra i tipi di script.

Fonti d'uso esaminate: `src/locales/it-IT/*.json`, `src/pkg/utils/monaco-editor/langs/it-IT.ts`, `docs/architecture.md`.

## Principi

1. Usa un italiano conciso e naturale. In titoli, pulsanti, menu, stati e messaggi usa la **maiuscola solo all'inizio della frase** (sentence case), non su ogni parola.
2. Per pulsanti e voci di menu usa l'**imperativo** di seconda persona singolare (`Salva`, `Elimina`, `Importa`), come nelle interfacce italiane più diffuse. Per i messaggi di esito usa il participio (`Salvato correttamente`, `Eliminazione non riuscita`).
3. Rivolgiti all'utente con il **tu** in modo coerente (`Conferma se consenti…`, `Puoi modificare…`).
4. Mantieni distinti `Script utente`, `Script di pagina`, `Script in background` e `Script pianificato`: non sono intercambiabili.
5. Non fare sostituzioni globali solo perché due parole sembrano equivalenti. Verifica funzione, posizione nell'interfaccia, testo vicino e se la stringa è un'azione, un oggetto o uno stato.
6. Se l'inglese è ambiguo o poco naturale, confronta anche `zh-CN` e il comportamento reale dell'interfaccia. Non copiare un difetto del testo di origine.
7. Preserva segnaposto, tag HTML/React, interpolazioni i18next, URL e identificatori come `@match`, `@exclude`, `@grant`, `@connect`, `@resource` e `@require`.
8. Non trasformare un URL in un percorso localizzato senza aver verificato che la destinazione esista con lo stesso contenuto.
9. Preserva nomi tecnici e di prodotto riconoscibili: `ScriptCat`, `ESLint`, `VSCode`, `Cookie`, `GM API`, `OPFS`, `MCP`, `SKILL.md`, `SkillScript`, `Storage API`.
10. Le chiavi citate sotto documentano l'uso attuale o punti noti di revisione; le stesse regole valgono per le nuove stringhe con lo stesso significato.

## Categorie

| Categoria | Uso |
| --- | --- |
| **A. Termini di prodotto e funzionalità** | Nomi che identificano funzionalità, entità e tipi di script di ScriptCat. |
| **B. Azioni e stati dell'interfaccia** | Forme preferite per pulsanti, menu, etichette e messaggi di stato. |
| **C. Termini dipendenti dal contesto** | Parole la cui traduzione dipende dalla funzione o dal punto dell'interfaccia. |
| **D. Termini tecnici da preservare** | Termini e identificatori che devono mantenere il significato tecnico. |
| **E. Punti di revisione** | Incoerenze che richiedono una revisione mirata, non una sostituzione automatica. |

## A. Termini di prodotto e funzionalità

| Concetto | Forma preferita | Esempi di chiavi | Note |
| --- | --- | --- | --- |
| Estensione ScriptCat | `estensione ScriptCat` | `welcome_title`, `ext_update_notification` | Scrivi sempre `ScriptCat`, mai `Scriptcat`. |
| Capacità generica degli userscript | `script utente`; in prosa anche `userscript` | `script_list_content`, `allow_user_script_guide`, `welcome_subtitle` | `gestore di userscript` è accettabile nei testi descrittivi. |
| Categoria script normale | `Script normali` (barra laterale) / `Script utente` (etichetta del tipo) | `script_list.sidebar.normal_script`, `normal_script` | Non unirla agli script in background o pianificati. |
| Script di pagina | `Script di pagina` | `script_list_enable_content` | Non sostituirlo automaticamente con la categoria `Script normali`. |
| Script in background | `Script in background` | `create_background_script`, `background_script`, `enable_background.description` | Non usare `in sottofondo` né `di sfondo`. |
| Script pianificato | `Script pianificato` | `create_scheduled_script`, `scheduled_script` | Non usare `script crontab` come nome del tipo. |
| Sincronizzazione degli script | `Sincronizzazione script` | `script_sync`, `sync_status`, `setting_sync_title` | Distingui la sincronizzazione dei dati dalla connessione a un servizio. |
| Sincronizzazione delle eliminazioni | `Sincronizza eliminazioni` | `sync_delete`, `sync_delete_desc` | |
| Sottoscrizione (oggetto) | `Sottoscrizione` / `Sottoscrizioni` | `subscribe_url`, `subscribe_section`, `count_subscribes` | Evita `Abbonamento`, che in italiano suggerisce un pagamento. |
| Sottoscrivere (azione) | `Sottoscrivi` / `Installa sottoscrizione` | `install.subscribe` | Usa il verbo solo per l'azione. |
| Cestino | `Cestino` (maiuscolo quando indica la funzione) | `trash_tab`, `trash_empty_all` | `Svuota Cestino`, `Spostato nel Cestino`. |
| Mercato / galleria di script | `Mercato degli script` / `Galleria script` | `script_list_title`, `script_gallery` | Mantieni il nome usato dalla destinazione. |
| Entità Skill | `Skill` (femminile: `la Skill`, `le Skill`) | `skills_add`, `skill_install`, `import_skill` | Non tradurre in `abilità` o `competenza` nelle etichette. |
| Agente IA | `Agente IA`; `Agente` nel testo | `agent.title`, `settings_title` | Usa `IA`, non `AI`, nei testi visibili. |
| Servizio modelli | `Servizio modelli` | `provider`, `provider_title` | |
| Accesso esterno | `Accesso esterno` | `external_access.section_title` | `sctl` resta invariato e minuscolo. |
| Regole di rete | `Regole di rete` | `network_rules_title` | |

## B. Azioni e stati dell'interfaccia

| Concetto | Forma preferita | Esempi di chiavi | Note |
| --- | --- | --- | --- |
| Creare | `Crea` | `create_script`, `tasks_create` | Aggiungi l'oggetto se il pulsante da solo è ambiguo. |
| Salvare / Salvare con nome | `Salva` / `Salva con nome` | `save`, `save_as` | |
| Importare / Esportare | `Importa` / `Esporta` | `import`, `export` | |
| Installare / Aggiornare | `Installa` / `Aggiorna` | `install.script`, `update_script` | |
| Eseguire / Esecuzione | `Esegui` / `Esecuzione` | `run`, `running`, `runtime` | Per i log: `Log di esecuzione`. |
| Arrestare | `Arresta` (script); `Interrompi` (generazione, monitoraggio, accesso esterno) | `stop`, `chat_stop`, `stop_watch_file` | |
| Abilitare / Disabilitare | `Abilita` / `Disabilita`; stati `Abilitato` / `Disabilitato` | `enable`, `disable`, `enabled_label` | Per gli interruttori di funzioni si accettano `Attiva` / `Disattiva`. Non usare `apri` / `chiudi`. |
| Impostazioni / Configurazione | `Impostazioni` / `Configurazione` | `settings`, `script_setting`, `editor_config` | `Impostazioni` per le opzioni del prodotto; `Configurazione` per dati o file di configurazione. |
| Connettere / Sincronizzare | `Connetti` / `Sincronizza` | `connect`, `script_sync` | |
| Ripristinare | `Ripristina` | `restore`, `reset`, `trash_restore` | Si usa sia per recuperare un backup o dal Cestino sia per tornare ai valori predefiniti; aggiungi l'oggetto se serve (`Ripristina valori predefiniti`). |
| Aggiornare dati / ricaricare | `Aggiorna` / `Ricarica` | `refresh`, `click_to_reload`, `network_rules_reload_tabs` | `Ricarica` per pagine e schede del browser. |
| Eliminare / Svuotare | `Elimina` / `Svuota` | `delete`, `clear_logs`, `trash_empty_all` | `Elimina` rimuove un oggetto; `Svuota` rimuove il contenuto di un contenitore. |
| Monitorare un file | `Monitora file` / `Interrompi monitoraggio` | `watch_file`, `stop_watch_file`, `watching_title` | |
| Selezionare tutto | `Seleziona tutto` / `Deseleziona tutto` | `select_all`, `restore_settings_clear_all` | Non usare `Svuota` per togliere una selezione. |
| Directory | `Directory` | `open_directory`, `open_backup_dir` | `Cartella` solo nell'esplora file OPFS, dove indica il tipo di elemento. |
| Scheda del browser | `Scheda` | `close_current_tab`, `script_run_env.*` | `Tutte le schede`, `Schede normali`, `Schede in incognito`. Non usare `tab`. |
| Menu contestuale | `Menu contestuale` | `display_right_click_menu` | Aggiungi `(clic destro)` solo nelle descrizioni. |
| Clic | `Fai clic` | `develop_mode_guide`, `tap_to_expand` | L'interfaccia è desktop: non usare `tocca`. |
| Esito negativo | `… non riuscito/a`, `Impossibile …` | `*_failed` | Evita `fallito` nei messaggi all'utente. |

## C. Termini dipendenti dal contesto

| Concetto | Forme possibili | Regola | Esempi di chiavi |
| --- | --- | --- | --- |
| Locale / cloud | `Locale`, `in locale` / `cloud`, `sul cloud` | `Backup sul cloud`, `Eliminato in locale`. | `local`, `backup_to`, `trash_source_local` |
| Origine / sorgente | `Origine`, `Codice sorgente`, `Lettura del sorgente` | `Origine` per la provenienza; `sorgente` solo per il codice. | `source`, `col_source`, `policy_source` |
| Archiviazione | `Archiviazione`, `Spazio di archiviazione`, `Storage API` | Distingui dati archiviati, spazio concesso e nome tecnico dell'API. | `storage`, `script_operation_description`, `storage_api` |
| Pannello / console | `pannello` / `console` | `pannello` per i controlli di ScriptCat; `console` per gli strumenti per sviluppatori. | `background_script_description`, `build_success_message` |
| Permesso / autorizzazione | `Permesso`, `Consenti`, `Nega`, `Autorizzazione` | `Permesso` è la capacità; `Consenti` / `Nega` sono le decisioni; `Autorizzazione` è l'accesso concesso e la sua durata. | `permission`, `allow_action`, `auth_duration` |
| Corrispondenza / esclusione | `Corrispondenza (@match)` / `Esclusione (@exclude)` | Lascia visibili gli identificatori di metadati. | `website_match`, `website_exclude`, `add_match` |
| Cross-origin | `cross-origin`, `CORS` | Termine tecnico diffuso in italiano; non usare `origine incrociata`. | `permission_cors`, `perm_connect_label` |
| Ora / momento | `Ora`, `Momento di esecuzione`, `Durata` | `Ora` per un istante; `Durata` per un intervallo. | `time`, `run_at`, `tasks_run_duration` |
| Lista di blocco | `Lista di blocco`, `Pagine bloccate` | Evita `blacklist` / `lista nera` nei nuovi testi. La chiave tecnica resta `blacklist_*`. | `blacklist_pages`, `page_in_blacklist` |
| Link di affiliazione | `Link di affiliazione` | Usalo per `referral link`; non `link di riferimento`. | `referral_link_title` |
| Intestazioni HTTP | `Intestazione` / `Intestazioni` | Nomi propri delle intestazioni invariati (`User-Agent`, `Referer`, `Cookie`). | `network_rules_header_*` |

## D. Termini tecnici da preservare

| Concetto | Forma preferita | Esempi di chiavi | Motivo |
| --- | --- | --- | --- |
| Espressione regolare | `espressione regolare`; forma breve `regex` | `search_regex` | Terminologia standard. |
| Espressione cron | `espressione cron` | `cron_invalid_expr`, `tasks_cron` | Identifica la sintassi accettata. |
| Espressione | `espressione` | `value_export_expression`, `expression_format_error` | Mantiene il significato tecnico. |
| Tipo String | `Stringa` | `type_string` | Nome del tipo di dato, non `Testo`. |
| Dichiarazione di metadati | `dichiarazione` | `error_metadata_line_duplicated` | Corrisponde a una dichiarazione sintattica. |
| Storage API | `Storage API` | `storage_api` | Nome tecnico dell'API. |
| Identificatori di metadati | `@match`, `@exclude`, `@grant`, `@connect`, `@resource`, `@require`, `@antifeature`, `@namespace` | Varie | Non tradurre, non cambiare maiuscole, non togliere `@`. |
| Prodotti, API e formati | `ESLint`, `VSCode`, `Cookie`, `GM API`, `JSON`, `URL`, `OPFS`, `MCP`, `TTFT`, `SKILL.md`, `SkillScript`, `WebDAV`, `S3` | Varie | Devono restare riconoscibili. |
| Termini IA | `Prompt`, `token`, `Skill` | `skills_prompt`, `model_max_tokens` | Termini d'uso comune nel settore; non tradurre `prompt`. |
| Segnaposto e tag | `{{...}}`, `${...}`, `{0}`, `$0`, HTML/React, URL | Varie | Modificarli rompe l'esecuzione o la destinazione. |

## E. Punti di revisione

| Tema | Da evitare | Direzione consigliata | Esempi di chiavi |
| --- | --- | --- | --- |
| Maiuscole | `Nuova Versione Disponibile` | `Nuova versione disponibile` | Vari namespace |
| Sottoscrizione | `Abbonamento`, `Iscrizione` | `Sottoscrizione` | `subscribe_*` |
| Skill | `Abilità` nelle etichette | `Skill` | `skills_*`, `skill_*` |
| Origine | `Fonte` per ogni `source` | `Origine` o il termine specifico del contesto | `source`, `col_source` |
| Browser specifico | `Chrome` per un comportamento valido su più browser | `il browser`, salvo comportamento esclusivo di Chrome | `enable_background.description` |
| Contatori | Accordo di genere/numero non verificato con `{{count}}` | Controlla l'accordo con il sostantivo nella schermata reale (`{{count}} script`, `{{count}} regole`) | Contatori in vari namespace |
| Testi spezzati | Tradurre i frammenti in modo isolato | Componi e verifica la frase intera nell'interfaccia | `menu_expand_num_before`, `menu_expand_num_after` |
| Articolo con `{{scriptType}}` | `un {{scriptType}}` | `uno {{scriptType}}`, perché il valore inizia con `Script` | `enable_background.prompt_description`, `keep_scripts_alive.prompt_description` |
| Inglese / cinese divergenti | Scegliere una versione senza verificare il prodotto | Verifica il comportamento e allinea `en-US`, `zh-CN` e `it-IT` | `setting_sync_content` |

## Vocabolario preferito

| Preferisci | Evita, salvo contesto verificato |
| --- | --- |
| `ScriptCat` | `Scriptcat` |
| `Script utente`, `Script di pagina`, `Script in background`, `Script pianificato` | Mescolare i tipi o usare `script crontab` |
| `Sottoscrizione` | `Abbonamento`, `Iscrizione` |
| `Skill` | `Abilità`, `Competenza` |
| `Impostazioni` per le opzioni; `Configurazione` per dati e file | `Config` nei testi comuni |
| `Origine` per la provenienza | `Fonte` come traduzione automatica di `source` |
| `Scheda` | `Tab`, `Linguetta` |
| `Menu contestuale` | `Menu del tasto destro` |
| `Fai clic` | `Tocca`, `Clicca` |
| `Lista di blocco` | `Blacklist`, `Lista nera` |
| `… non riuscito` / `Impossibile …` | `Fallito` |
| `IA` | `AI` nei testi visibili |
| `Cestino` | `Spazzatura` |
| `In tempo reale` | `Live`, `Dal vivo` |
| Maiuscola solo a inizio frase | Maiuscole su ogni parola |

## Checklist per IA e collaboratori

Quando aggiungi o modifichi testi `it-IT`:

1. Conferma che la lingua di destinazione è `it-IT` e leggi questo documento e `docs/translation.md`.
2. Confronta la stringa con `en-US` e, se il senso è ambiguo, con `zh-CN`; in caso di divergenza verifica il comportamento dell'interfaccia.
3. Mantieni distinti i tipi di script e riusa i termini di prodotto definiti qui.
4. Distingui azione, oggetto e stato (`Sottoscrivi` / `Sottoscrizione`; `Salva` / `Salvato`).
5. Usa l'imperativo per i comandi, il tu per rivolgerti all'utente e la maiuscola solo a inizio frase.
6. Preserva segnaposto, tag, interpolazioni, URL, nomi tecnici e identificatori di metadati.
7. Verifica l'accordo di genere e numero nei testi con contatori.
8. Prova i testi spezzati e quelli lunghi nell'interfaccia reale.
9. Prima della consegna cerca nel contenuto modificato:
   - `Scriptcat`
   - `Abbonamento`, `Iscrizione`
   - `Abilità` riferito alle Skill
   - `blacklist`, `lista nera`
   - `tocca`, `clicca`
   - `fallito`
   - maiuscole su ogni parola
   - identificatori o URL modificati
10. Esegui `pnpm run check:i18n` e verifica che non ci siano chiavi mancanti o in eccesso.
