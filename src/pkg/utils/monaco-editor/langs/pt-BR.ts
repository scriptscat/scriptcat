const grantValuePrompts = {
  none: "Não solicita permissões especiais de GM API; o script é executado de forma parecida com um script comum de página.",
  unsafeWindow: "Acessa o objeto window da própria página para interagir com os scripts nativos da página.",
  GM_getValue: "Lê um valor do armazenamento persistente do script.",
  GM_getValues: "Lê vários valores do armazenamento persistente do script.",
  GM_setValue: "Grava um valor no armazenamento persistente do script.",
  GM_setValues: "Grava vários valores no armazenamento persistente do script.",
  GM_deleteValue: "Exclui um valor do armazenamento persistente do script.",
  GM_deleteValues: "Exclui vários valores do armazenamento persistente do script.",
  GM_listValues: "Lista todas as chaves do armazenamento persistente do script.",
  GM_addValueChangeListener: "Monitora alterações nos valores do armazenamento do script.",
  GM_removeValueChangeListener: "Remove um listener de alterações de valores do armazenamento do script.",
  GM_xmlhttpRequest:
    "Faz requisições de rede entre origens; os hosts de destino normalmente precisam ser permitidos com @connect.",
  GM_download:
    "Baixa arquivos. Aceita uma URL e um nome de arquivo, ou um objeto de detalhes com campos como url, name, headers e saveAs, e retorna um handle que permite abort.",
  GM_openInTab: "Abre uma nova aba, com opções como abrir em primeiro ou segundo plano.",
  GM_closeInTab: "Fecha uma aba aberta ou gerenciada pelo script.",
  GM_getTab: "Lê dados temporários associados à aba atual.",
  GM_saveTab: "Salva dados temporários associados à aba atual.",
  GM_getTabs: "Lê todos os dados temporários de abas salvos pelo script.",
  GM_notification: "Exibe uma notificação do navegador e trata eventos como clique ou fechamento.",
  GM_closeNotification: "Fecha uma notificação específica do script.",
  GM_updateNotification: "Atualiza uma notificação específica do script.",
  GM_setClipboard: "Grava na área de transferência do sistema.",
  GM_registerMenuCommand: "Registra um comando de menu do script.",
  GM_unregisterMenuCommand: "Cancela o registro de um comando de menu do script.",
  CAT_registerMenuInput: "API do ScriptCat: registra um comando de menu do script com campo de entrada.",
  CAT_unregisterMenuInput: "API do ScriptCat: cancela o registro de um comando de menu do script com campo de entrada.",
  GM_addStyle: "Injeta CSS na página.",
  GM_addElement: "Cria e insere um elemento na página.",
  GM_getResourceText: "Lê o conteúdo de texto de um recurso declarado com @resource.",
  GM_getResourceURL: "Obtém a URL de um recurso declarado com @resource.",
  GM_cookie: "Acessa a API de Cookie para ler, gravar ou excluir cookies.",
  GM_audio: "Controla e observa o estado de mudo e de reprodução de áudio da aba atual do navegador.",
  CAT_fetchBlob: "API interna do ScriptCat: lê um recurso acessível pelo lado da extensão e retorna um Blob.",
  CAT_fileStorage: "API do ScriptCat: acessa o armazenamento de arquivos do script.",
  CAT_userConfig: "API do ScriptCat: acessa a configuração de usuário do script.",
  CAT_scriptLoaded: "API do ScriptCat: aguarda o carregamento completo do script em cenários com @early-start.",
  "window.close": "Permite que o script chame window.close().",
  "window.focus": "Permite que o script chame window.focus().",
  "window.onurlchange": "Permite que o script escute eventos de mudança de URL.",
} as const;

export default {
  title: "Português (Brasil)",
  thisIsAUserScript: "Um script de usuário",
  undefinedPrompt: "Prompt não definido",
  quickfix: "Corrigir problema de {0}",
  addEslintDisableNextLine: "Adicionar comentário eslint-disable-next-line",
  addEslintDisable: "Adicionar comentário eslint-disable",
  declareGlobal: "Declarar '{0}' como variável global (/* global */)",
  removeConnectWildcard: "Remover curinga de @connect: {0}",
  replaceMatchTldWildcardWithInclude: "Substituir curinga de TLD em @match por @include {0}",
  replaceIncludeWithMatch: "Substituir @include por @match {0}",
  grantConflict: "@grant none não pode ser usado junto com GM APIs. Remova none ou todas as GM APIs.",
  grantValuePrompts,
  prompt: {
    name: "Nome do script",
    namespace: "Namespace do script",
    copyright: "Informações de direitos autorais do script",
    license: "Licença de código aberto do script",
    version: "Versão do script",
    description: "Descrição do script",
    icon: "Ícone do script",
    iconURL: "Ícone do script",
    defaulticon: "Ícone do script",
    icon64: "Ícone do script em 64x64",
    icon64URL: "Ícone do script em 64x64",
    grant: "Solicita permissões especiais de API para o script",
    author: "Autor do script",
    "run-at":
      "Momento de execução do script<br>`document-start`: injeta o script o mais cedo possível após a URL corresponder<br>`document-end`: injeta após o carregamento do DOM (imagens etc. podem ainda estar carregando)<br>`document-idle`: injeta após todo o conteúdo terminar de carregar<br>`document-body`: injeta apenas quando existe um elemento body",
    "run-in": "Contexto em que o script é injetado",
    homepage: "Página inicial do script",
    homepageURL: "Página inicial do script",
    website: "Página inicial do script",
    background: "Script em segundo plano",
    include: "Páginas cujas URLs correspondem e executam este script",
    match: "Páginas cujas URLs correspondem e executam este script",
    exclude: "Páginas cujas URLs correspondem e NÃO executam este script",
    connect: "Sites que o script pode acessar",
    resource: "Arquivos de recurso importados",
    require: "Arquivos JS externos importados",
    "require-css": "Arquivos CSS externos importados",
    noframes: "Não executa o script dentro de `<frame>`",
    compatible: "Informações de compatibilidade exibidas no GreasyFork",
    "inject-into":
      "Contexto de injeção do script<br>`content`: injeta no contexto content<br>`page`: injeta no contexto da página (padrão)<br>Observação: o SC não oferece suporte a `inject-into: auto`, que escolhe o contexto com base na CSP.",
    "early-start":
      "Usado com `run-at: document-start`. `early-start` permite que o script seja executado antes mesmo da página, mas pode afetar o desempenho e limitar as GM APIs. (Exclusivo do SC)",
    unwrap:
      "Faz o script de usuário ignorar o encapsulamento da sandbox e ser injetado e executado diretamente no escopo global nativo da página. <br>O script pode acessar e modificar diretamente as variáveis globais reais da página, mas não poderá usar APIs privilegiadas de script de usuário, como GM.*. <br>Usado geralmente em cenários que exigem interação profunda com os scripts nativos da página ou na migração de scripts comuns de página.",
    definition: "Exclusivo do ScriptCat: URL de um arquivo `.d.ts` usado para o preenchimento automático do editor",
    antifeature: `Relacionado aos mercados de scripts: funcionalidades indesejadas devem incluir este valor de descrição
referral-link: Este script modifica ou redireciona para o link de afiliado do autor
ads: Este script insere anúncios nas páginas que você visita
payment: Este script exige pagamento para funcionar corretamente
miner: Este script realiza atividades de mineração
membership: Este script exige registro como membro para funcionar corretamente
tracking: Este script rastreia suas informações de usuário`.replace(/\n/g, "<br>"),
    updateURL: "URL usada para verificar atualizações do script",
    downloadURL: "URL usada para baixar atualizações do script",
    supportURL: "Site de suporte / página de relato de bugs",
    source: "Página do código-fonte do script",
    scriptUrl: "URL do script de usuário referenciado por um script de assinatura",
    storageName:
      "Nome do armazenamento de valores do script, usado para compartilhar um mesmo espaço de armazenamento entre vários scripts",
    tag: "Tags do script, separadas por vírgulas ou espaços",
    cloudCat: "Marca o script como exportável para um pacote de script em nuvem do CloudCat",
    cloudServer: "Serviço em nuvem CloudCat usado pelo script",
    exportValue: "Valores de armazenamento do script a exportar ao exportar como script em nuvem",
    exportCookie: "Cookies a exportar ao exportar como script em nuvem",
    crontab: `Exemplos de crontab para scripts agendados (não se aplica a scripts em nuvem)
* * * * * * Executa a cada segundo
* * * * * Executa a cada minuto
0 */6 * * * Executa uma vez no minuto 0 a cada 6 horas
15 */6 * * * Executa uma vez no minuto 15 a cada 6 horas
* once * * * Executa uma vez por hora
* * once * * Executa uma vez por dia
* 10 once * * Executa uma vez por dia entre 10:00-10:59; se executar às 10:04, não executa de novo naquele dia entre 10:05-10:59
* 1,3,5 once * * Executa uma vez por dia à 1:00, às 3:00 ou às 5:00; se executar à 1:00, não executa de novo às 3:00 nem às 5:00
* */4 once * * Verifica e executa uma vez a cada 4 horas; se executar às 4:00, não executa de novo naquele dia às 8:00, 12:00, 16:00, 20:00, 24:00
* 10-23 once * * Executa uma vez por dia entre 10:00-23:59; se executar às 10:04, não executa de novo naquele dia entre 10:05-23:59
* once 13 * * Executa uma vez por hora no dia 13 de cada mês
* once(9-17) * * * Executa uma vez por hora entre 9h e 17h todos os dias
0,30 once * * * Executa uma vez por hora no minuto 0 ou 30, o que ocorrer primeiro; não repete na mesma hora
* * once(9-18) * * Executa uma vez por dia entre os dias 9 e 18 de cada mês
* * * * once(1-5) Executa uma vez por semana, apenas de segunda a sexta-feira`.replace(/\n/g, "<br>"),
  },
} as const;
