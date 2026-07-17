# Diretrizes de terminologia e textos de interface — pt-BR

Este documento define a terminologia da interface e da documentação do ScriptCat em português do Brasil (`pt-BR`). O objetivo é manter os conceitos do produto identificáveis, usar textos naturais em interfaces brasileiras e preservar termos técnicos, identificadores e diferenças entre os tipos de script.

Fontes de uso revisadas: `src/locales/pt-BR/*.json`, `docs/architecture.md`.

## Princípios

1. Use português brasileiro conciso e natural. Em títulos, botões, menus, estados e mensagens, prefira **caixa de frase**, não a capitalização de todas as palavras.
2. Preserve as diferenças entre `Script de usuário`, `Script de página`, `Script em segundo plano` e `Script agendado`. Esses nomes não são intercambiáveis.
3. Não faça substituições globais apenas porque duas palavras parecem equivalentes. Verifique a função, a posição na interface, o texto vizinho e se a string representa uma ação, um objeto ou um estado.
4. Quando o inglês for ambíguo ou pouco natural, consulte também o texto em `zh-CN` e o comportamento real da interface. Não copie automaticamente um defeito do texto-fonte.
5. Preserve placeholders, tags HTML/React, interpolação do i18next, URLs e identificadores como `@match`, `@exclude`, `@grant`, `@connect`, `@resource` e `@require`.
6. Não altere uma URL para uma rota localizada sem confirmar que o destino existe e contém o mesmo conteúdo.
7. Preserve nomes técnicos e de produto reconhecíveis, como `ScriptCat`, `ESLint`, `VSCode`, `Cookie`, `GM API`, `OPFS`, `MCP`, `SKILL.md`, `SkillScript` e `Storage API`.
8. As chaves citadas abaixo registram usos atuais ou pontos conhecidos de revisão. As mesmas regras devem ser aplicadas a novas strings com o mesmo significado.

## Categorias

| Categoria | Uso |
| --- | --- |
| **A. Termos de produto e recursos** | Nomes que identificam recursos, entidades e tipos de script do ScriptCat. |
| **B. Ações e estados da interface** | Formas preferidas para botões, menus, rótulos e mensagens de estado. |
| **C. Termos dependentes de contexto** | Palavras cuja tradução depende da função ou da superfície da interface. |
| **D. Termos técnicos a preservar** | Termos e identificadores que devem manter o significado técnico. |
| **E. Pontos de revisão** | Inconsistências que exigem revisão específica, não substituição automática. |

## A. Termos de produto e recursos

| Conceito | Forma preferida | Exemplos de chaves | Observações |
| --- | --- | --- | --- |
| Extensão do ScriptCat | `extensão ScriptCat` | `welcome_title`, `ext_update_notification` | Preserve sempre a grafia `ScriptCat`, nunca `Scriptcat`. |
| Recurso genérico de userscript | `script de usuário` | `script_list_content`, `allow_user_script_guide` | Use para a capacidade genérica de executar scripts do usuário. |
| Categoria de script normal | `Script normal` | `script_list.sidebar.normal_script` | É uma categoria atual da interface; não a misture com scripts em segundo plano ou agendados. |
| Ação de criar um user script | `Criar script de usuário` | `create_user_script` | O rótulo pode usar `script de usuário` mesmo quando a barra lateral usa `Script normal`. |
| Script de página | `Script de página` | `script_list_enable_content` | Conceito de execução em páginas; não substitua automaticamente pela categoria `Script normal`. |
| Script em segundo plano | `Script em segundo plano` | `create_background_script`, `background_script`, `enable_background.description` | Tipo de script e capacidade de execução em segundo plano. |
| Script agendado | `Script agendado` | `create_scheduled_script`, `scheduled_script`, `scheduled_script_description_title` | Não use `script crontab` como nome do tipo. |
| Sincronização de scripts | `Sincronização de scripts` | `script_sync`, `sync_status`, `setting_sync_title` | Diferencie sincronização de conexão com um serviço. |
| Sincronização de exclusões | `Sincronizar exclusões` | `sync_delete`, `sync_delete_desc`, `notification.script_sync_delete` | Se a interface precisar destacar tombstones/status, use `Sincronizar status de exclusão` após confirmação do comportamento. |
| Ação de assinatura | `Assinar` | `subscribe` quando for botão/ação | Use verbo para a ação. Não use o substantivo `Inscrição` como botão. |
| Objeto de assinatura | `Assinatura` | `subscribe_url`, `subscribe_section`, `count_subscribes` | Use para a entidade que mantém uma coleção de scripts atualizada. |
| Mercado / galeria de scripts | `Mercado de scripts` / `Galeria de scripts` | `script_list_title`, `script_gallery` | Preserve o nome usado pelo destino; não unifique áreas diferentes sem verificar. |
| Entidade Skill | `Skill` | `skills_add`, `skill_install`, `import_skill` | Use `Skill` para o pacote/objeto associado a `SKILL.md`. `habilidade` pode ser usada apenas em prosa genérica. |
| Agente de IA | `Agente de IA` | `title`, `settings_title` no namespace `agent` | Use de forma consistente; `Agent` pode permanecer apenas em identificadores ou nomes já definidos pelo produto. |
| Serviço de modelos | `Serviço de modelos` | `provider`, `provider_title` | Prefira plural quando a tela gerencia vários modelos/provedores. |

## B. Ações e estados da interface

| Conceito | Forma preferida | Exemplos de chaves | Observações |
| --- | --- | --- | --- |
| Criar | `Criar` | `create_script`, `tasks_create` | Acrescente o objeto quando necessário. |
| Salvar / Salvar como | `Salvar` / `Salvar como` | `save`, `save_as` | Use caixa de frase. |
| Importar / Exportar | `Importar` / `Exportar` | `import`, `export`, `import_file`, `export_file` | Formas padrão para arquivos e dados. |
| Instalar / Atualizar | `Instalar` / `Atualizar` | `script`, `update_script`, `skill_install` | Informe o objeto se o botão isolado for ambíguo. |
| Executar / Execução | `Executar` / `Execução` | `run`, `running`, `log_title` | Para logs, use `Logs de execução`. |
| Ativar / Desativar | `Ativar` / `Desativar`; estados `Ativado` / `Desativado` | `enable`, `disable`, `enabled_label` | Não use `abrir`/`fechar` para habilitação de recursos. |
| Configurações / Configuração | `Configurações` / `Configuração` | `settings`, `script_setting`, `editor_config` | `Configurações` para opções do produto; `Configuração` para um objeto ou arquivo de configuração. |
| Conectar / Sincronizar | `Conectar` / `Sincronizar` | `connect`, `connection_success`, `script_sync` | Não misture conexão de serviço com sincronização de dados. |
| Restaurar / Redefinir | `Restaurar` / `Redefinir` | `restore`, `restore_default_values`, `reset` | `Restaurar` recupera backup/valores; `Redefinir` volta uma configuração ao estado padrão. |
| Atualizar / Recarregar | `Atualizar` / `Recarregar` | `update`, `refresh`, `click_to_reload` | Use `Atualizar` para versão/dados e `Recarregar` para refresh/reload da interface. |
| Excluir / Limpar | `Excluir` / `Limpar` | `delete`, `clear_logs` | `Excluir` remove um objeto; `Limpar` remove conteúdo de uma coleção ou campo. |
| Monitorar arquivo | `Monitorar arquivo` / `Parar monitoramento` | `watch_file`, `stop_watch_file`, `watching_title` | Descreve observação contínua de alterações do arquivo. |
| Selecionar / desmarcar tudo | `Selecionar tudo` / `Desmarcar tudo` | `restore_settings_select_all`, `restore_settings_clear_all` | Não use `Limpar tudo` quando a ação apenas remove a seleção. |
| Diretório | `Diretório` | `open_directory`, `open_backup_dir` | Termo padrão do sistema de arquivos. |
| Aba do navegador | `Aba` | `close_current_tab`, `script_run_env.*` | Use `Todas as abas`, `Abas normais`, `Abas anônimas`. |
| Menu de contexto | `Menu de contexto` | `display_right_click_menu` | Evite `menu de clique com o botão direito`. |
| Clique / toque | `Clique` em interfaces de desktop; `Toque` apenas em interfaces móveis | `tap_to_expand`, `develop_mode_guide` | O popup da extensão no desktop deve usar `Clique`. |
| Estado concluído | Particípio: `Salvo`, `Redefinido`, `Importado` | `*_saved`, `*_reset`, `status_done` | Não transforme uma mensagem de resultado em comando no infinitivo. |

## C. Termos dependentes de contexto

| Conceito | Formas possíveis | Regra de decisão | Exemplos de chaves |
| --- | --- | --- | --- |
| Local / nuvem | `Local` / `Na nuvem` | Ajuste artigo e preposição à frase: `backup na nuvem`, `armazenamento local e em nuvem`. | `local`, `cloud`, `backup_to`, `source_local_script` |
| Origem / fonte | `Origem`, `Origem da instalação`, `Código-fonte`, `Fonte de dados` | Use `Origem` para procedência. Use `Fonte` apenas quando o contexto realmente for fonte de dados, tipografia ou código-fonte. | `source`, `col_source`, `loading_desc` |
| Armazenamento | `Armazenamento`, `Espaço de armazenamento`, `Storage API` | Diferencie dados armazenados, espaço concedido e nome técnico da API. | `script_storage`, `script_operation_description`, `storage_api` |
| Painel / console | `painel` / `console` | `painel` para controles da interface; `console` para saída das ferramentas de desenvolvedor. | `background_script_description`, `build_success_message` |
| Permissão / autorização | `Permissão`, `Permitir`, `Autorizar`, `Autorização` | `Permissão` é a capacidade; `Permitir`/`Negar` são decisões; `Autorização` é o acesso concedido e sua duração. | `permission`, `request_permission`, `auth_duration` |
| Correspondência / exclusão | `Regra de correspondência (@match)` / `Regra de exclusão (@exclude)` | Mantenha os identificadores técnicos visíveis e evite frases como `exclusão desta exclusão`. | `website_match`, `website_exclude`, `add_match`, `add_exclude` |
| Entre origens / CORS | `entre origens`, `CORS` | Use a terminologia web padrão; não use o calque `origem cruzada`. | `script_accessing_cross_origin_resource`, `permission_cors` |
| Tempo / horário | `Horário`, `Data e hora`, `Tempo de execução` | `Horário` para um instante; `Data e hora` para timestamp; `Tempo de execução` para duração/runtime. | `time`, `run_at`, `runtime` |
| Indicador do ícone | `Indicador`, `Contador`, `Não exibir` | Verifique se o badge mostra contagem, estado ou nada. | `extension_icon_badge`, `badge_type_none` |
| Lista de bloqueio | `Lista de bloqueio`, `Páginas bloqueadas` | Evite o calque `lista negra` em novos textos. | `blacklist_pages`, `page_in_blacklist` |
| Interface | `Interface` | Prefira `interface` a `UI` em textos comuns; mantenha `UI` apenas quando necessário por espaço ou contexto técnico. | `section_appearance_title` |
| Link de indicação | `Link de indicação` / `Link de afiliado` | Use `Link de afiliado` quando houver comissão; não use o genérico `Link de referência` sem confirmação. | `referral_link_title`, `referral_link_description` |

## D. Termos técnicos a preservar

| Conceito | Forma preferida | Exemplos de chaves | Motivo |
| --- | --- | --- | --- |
| Expressão regular | `expressão regular`; forma curta `regex` | `search_regex` | Terminologia padrão de desenvolvimento. |
| Expressão cron | `expressão cron` | `cron_invalid_expr`, `error_cron_invalid`, `tasks_cron` | Identifica a sintaxe aceita. |
| Expressão | `expressão` | `value_export_expression`, `cookie_export_expression`, `expression_format_error` | Preserva o significado técnico de valor avaliado/fornecido. |
| Tipo String | `String`; em explicação, `cadeia de caracteres` | `type_string` | Não traduzir o tipo como o genérico `Texto`. |
| Declaração de metadata | `declaração` | `error_metadata_line_duplicated` | Corresponde a uma declaração sintática. |
| Storage API | `Storage API` | `storage_api` | Nome técnico usado na documentação e nas APIs. |
| Identificadores de metadata | Preserve `@match`, `@exclude`, `@grant`, `@connect`, `@resource`, `@require`, `@antifeature` | Várias | Não traduzir, alterar caixa ou remover `@`. |
| Produtos, APIs e formatos | Preserve `ESLint`, `VSCode`, `Cookie`, `GM API`, `JSON`, `URL`, `OPFS`, `MCP`, `TTFT`, `SKILL.md`, `SkillScript` | Várias | Devem continuar reconhecíveis para usuários e desenvolvedores. |
| Placeholders e tags | Preserve `{{...}}`, `${...}`, HTML/React e URLs | Várias | Alterações podem quebrar a execução ou o destino. |

## E. Pontos de revisão

Os itens abaixo descrevem riscos observados ou decisões que exigem contexto. Não devem ser tratados como uma ordem de substituição global.

| Tema | Situação a evitar | Direção recomendada | Exemplos de chaves |
| --- | --- | --- | --- |
| Capitalização | `Nova Versão Disponível`, `Falha na Instalação` | Use caixa de frase: `Nova versão disponível`, `Falha na instalação`. | Presente em vários namespaces |
| Assinatura | Usar `Inscrição` para ação e objeto | `Assinar` para a ação; `Assinatura` para a entidade. | `subscribe`, `subscribe_url`, `count_subscribes` |
| Skill | Traduzir todos os rótulos como `Habilidade` | Preserve `Skill` para a entidade ligada a `SKILL.md`. | `skills_add`, `skill_install`, `import_skill` |
| Origem | Usar `Fonte` para qualquer ocorrência de `source` | Use `Origem` para procedência e nomes mais específicos conforme o contexto. | `source`, `col_source`, `loading_desc` |
| Abas do navegador | Rótulo genérico `Todos` | Use `Todas as abas` quando o campo se refere a browser tabs. | `script_run_env.all` |
| Refresh vs update | Traduzir ambos como `Atualizar` | Use `Recarregar` para refresh e `Atualizar` para versão/conteúdo. | `skills_refresh`, `update` |
| Ação vs estado | `Redefinir configuração` em mensagem de sucesso | Use estado concluído: `Configuração redefinida`. | `*_reset`, `*_saved` |
| Links localizados | Inventar `/pt-BR/` a partir de uma URL em inglês | Preserve a URL até o destino pt-BR ser confirmado. | `guide.json` |
| Navegador específico | Copiar `Chrome` em comportamento que vale para vários navegadores | Use `navegador`, salvo se o comportamento for comprovadamente exclusivo do Chrome. | `enable_background.description` |
| Interpolação e concordância | `{{count}} selecionados` sem saber o substantivo | Inclua um substantivo neutro (`itens`) ou revise a concordância na tela real. | Contadores em vários namespaces |
| Texto dividido | Traduzir cada fragmento isoladamente | Monte e teste a frase completa na interface. | `menu_expand_num_before`, `menu_expand_num_after` |
| Fonte inglês/chinês divergente | Escolher uma versão sem verificar o produto | Confirme o comportamento e depois alinhe `en-US`, `zh-CN` e `pt-BR`. | `setting_sync_content`, `latest_version`, descrição de script em segundo plano |

## Vocabulário preferido

| Prefira | Evite, salvo contexto comprovado |
| --- | --- |
| `ScriptCat` | `Scriptcat` |
| `Script de usuário`, `Script de página`, `Script em segundo plano`, `Script agendado` | Misturar os tipos ou usar `script crontab` |
| `Assinar` (ação), `Assinatura` (objeto) | `Inscrição` para todos os contextos |
| `Skill` para a entidade de produto | Traduzir a entidade como `Habilidade` enquanto `SKILL.md`/`SkillScript` permanecem em inglês |
| `Configurações` para opções; `Configuração` para dados/objeto | `Config` em texto comum |
| `Origem` para procedência | `Fonte` como tradução automática de todo `source` |
| `Aba` para browser tab | Rótulos sem objeto como `Todos` |
| `Menu de contexto` | `Menu de clique com o botão direito` |
| `Entre origens (CORS)` | `Origem cruzada`, `cors` em minúsculas |
| `Monitorar arquivo` | `Observar arquivo` em contexto técnico contínuo |
| `Expressão regular` / `regex` | `Condição` quando a sintaxe aceita é regex |
| `Storage API` | Renomear o identificador técnico |
| `String` | `Texto` como nome do tipo técnico |
| `Clique` em interface de desktop | `Toque` fora de uma superfície móvel |
| `Em tempo real` para logs | `Ao vivo` |
| Caixa de frase | Capitalizar todas as palavras |
| `@require`, `@resource`, `@match`, `@exclude`, `@grant`, `@connect`, `@antifeature` | Traduzir ou alterar os identificadores |

## Checklist para IA e colaboradores

Ao adicionar ou editar textos em `pt-BR`:

1. Confirme que o locale de destino é `pt-BR` e leia este documento e `docs/translation.md`.
2. Compare a string com `en-US` e `zh-CN`; se houver divergência, verifique o comportamento da interface antes de escolher uma versão.
3. Preserve as diferenças entre os tipos de script e reutilize os termos de produto definidos aqui.
4. Diferencie ação, objeto e estado, especialmente em `Assinar`/`Assinatura` e mensagens `*_reset`/`*_saved`.
5. Use caixa de frase e português brasileiro natural; evite calques como `puxar dados`, `origem cruzada` e `menu de clique com o botão direito`.
6. Preserve placeholders, tags, interpolação, URLs, nomes técnicos e identificadores de metadata.
7. Não localize uma URL sem confirmar que o destino existe.
8. Verifique concordância de gênero e número em textos com contadores.
9. Teste strings divididas e textos longos na interface real.
10. Antes da entrega, procure no conteúdo editado por:
    - `Scriptcat`
    - `Inscrição`
    - `Habilidade` em rótulos da entidade Skill
    - `Fonte` usado como procedência
    - `lista negra`
    - `origem cruzada`
    - `Ao Vivo`
    - `Toque` em controles de desktop
    - capitalização excessiva
    - identificadores ou URLs alterados
