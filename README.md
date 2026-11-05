# Bitbucket .feature markers

Extensão do Chrome para revisar arquivos `.feature` (Gherkin/Cucumber) em pull requests do Bitbucket Cloud.

## O que faz

- **Destaca marcadores no diff**: linhas de tag com `@wip` ficam em laranja e linhas com `QUESTION` ficam em roxo.
- **Colore a sintaxe Gherkin** (pt e en): palavras de bloco (`Funcionalidade`, `Cenário`, `Esquema do Cenário`, `Exemplos`...), passos (`Dado`, `Quando`, `Então`, `E`, `Mas`...), tags, comentários `#`, `"strings"`, `<parâmetros>` e tabelas.
- **Side panel do Chrome** com a lista de todos os `@wip`, `QUESTION` e comentários inline dos `.feature` da PR:
  - mostra cada thread com autor, data e respostas;
  - esconde comentários **Outdated** (a linha mudou depois do comentário), ficando só o que ainda está pendente de review;
  - filtros por tipo: Todos, @wip, QUESTION, Comentário;
  - clicar num item rola a página até a linha. Se a linha não estiver na tela (ex.: aba Overview), abre "Files changed" já na linha.

## Instalar

1. Baixe ou clone este repositório.
2. Abra `chrome://extensions`.
3. Ligue o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** e escolha a pasta do repositório.
5. Opcional: no menu de extensões (peça de quebra-cabeça), fixe "Bitbucket .feature markers" com o alfinete.

## Usar

1. Abra uma PR no Bitbucket (`https://bitbucket.org/<workspace>/<repo>/pull-requests/<id>`).
2. Abra o painel pelo ícone da extensão ou pela aba azul **.feature (N)** na direita da página.
3. Clique num item para ir até a linha.

Depois de atualizar a extensão em `chrome://extensions`, dê F5 na página da PR.

## Como funciona

- `content.js` roda em `bitbucket.org`. Ele lê a PR pela API do Bitbucket na mesma origem (`/!api/2.0`, usando a sessão já logada): diffstat, conteúdo completo dos `.feature` no commit da PR e comentários (com `inline.outdated`). Também pinta as linhas do diff e rola até a linha quando o painel pede.
- `sidepanel.html` / `sidepanel.js` mostram a lista no side panel e conversam com a aba por `chrome.tabs.sendMessage`.
- `background.js` abre o side panel pelo ícone ou pela aba azul.

Nenhum dado sai do navegador: a extensão só fala com `bitbucket.org`.

## Limitações

- Funciona só na tela de pull request (não na tela de código-fonte `/src/...`).
- Depende do HTML atual do Bitbucket (ids `L<arquivo>T<linha>` nas linhas do diff). Se o Bitbucket mudar o HTML, o destaque e o "ir para a linha" precisam de ajuste.
