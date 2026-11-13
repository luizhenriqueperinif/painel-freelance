# Painel do Freelance

Painel pessoal para organizar o trabalho de freelance: as frentes onde procuro clientes, as oportunidades de cada uma, as tarefas e os repositórios de código que tenho no PC. Roda só no meu computador.

O painel não usa chave de API. Quem gerencia os dados por conversa é o Claude Code, por um servidor MCP local (veja [a decisão](docs/adr/0001-sem-chave-de-api-claude-pelo-mcp.md)).

## O que tem

- **Hoje**: tarefas do dia, atrasadas, os próximos 7 dias e as oportunidades paradas (as que não têm nenhuma tarefa aberta).
- **Frentes**: as oportunidades de Plataformas, Comércios, ONGs e Jogos, com situação, valor e próximo passo.
- **Repositórios**: lê as pastas de código sem alterar nada. Mostra tecnologia, último commit, mudanças não salvas e avisa se um arquivo de senha está indo para o git (só pelo nome, sem abrir o arquivo).
- **Tarefas**: criar, concluir e filtrar. Tarefa com hora ganha um botão que abre o Google Agenda já preenchido.
- Cinco temas de cor.

Os termos usados no código estão no [GLOSSARY.md](GLOSSARY.md).

## Tecnologia

TypeScript de ponta a ponta: Node 24 (roda `.ts` direto), Fastify, React com Vite e SQLite (`node:sqlite`). O servidor MCP usa o SDK oficial.

```
src/dominio    regras do painel (a única camada com regra de negócio) e os armazéns
src/servidor   API e site, só em 127.0.0.1
src/mcp        servidor MCP para o Claude Code
web            telas em React
dados          banco e configuração pessoal (fora do git)
```

As regras ficam em `src/dominio/painel.ts` e não sabem onde os dados moram: elas falam com um armazém, que pode ser o SQLite do PC ou um arquivo num repositório privado do GitHub.

## Instalar num PC (Windows)

Num PC novo, abra o PowerShell e cole:

```
irm https://raw.githubusercontent.com/luizhenriqueperinif/painel-freelance/main/scripts/instalar.ps1 -OutFile $env:TEMP\instalar.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\instalar.ps1
```

Num PC que já tem o código, dê dois cliques no `instalar.cmd`. O instalador:

1. instala o git e o Node 24 pelo winget, se faltarem (pergunta antes);
2. baixa o código em `Documentos\Projetos\painel-freelance` e monta as telas;
3. pergunta qual é o repositório privado de dados e confere se o git do PC enxerga ele (se o GitHub pedir login, é você que entra, na janela dele);
4. lista as pastas com git ao lado do painel em `dados/repositorios.json`;
5. cria o atalho "Painel do Freelance" na área de trabalho e faz o painel ligar sozinho, sem janela, quando o Windows abre;
6. liga o painel ao Claude Code, se ele estiver instalado.

Pode rodar de novo quando quiser: o que já está feito fica como está. Para tirar o início automático, apague o atalho "Painel do Freelance" da pasta que abre com `Win + R` e `shell:startup`.

Toda vez que o painel liga, ele traz a versão nova do código do GitHub, desde que o PC esteja no ramo `main` e sem mudanças por fazer. O registro fica em `dados/servidor.log`.

## App de Android

O app tem as mesmas telas (menos Repositórios, que depende das pastas do PC) e fala direto com o repositório de dados no GitHub, sem precisar do PC ligado.

- **Primeiro uso:** o app abre em "ajustes". Coloque o repositório de dados (`dono/nome`) e cole um token do GitHub criado só para ele (o passo a passo está na própria tela: fine-grained token, só o repositório de dados, permissão Contents: Read and write). O token fica guardado só no celular e não vai para o backup do Google. Se perder o celular, revogue o token no GitHub.
- **Avisos:** cada tarefa aberta com hora avisa 15 minutos antes e na hora. Com o app fechado, ele confere o GitHub a cada 15 minutos (o menor intervalo que o Android aceita), então uma tarefa criada no PC ou pelo Claude também avisa no celular. Concluída ou apagada, o aviso some.
- **No Redmi (e em outros Xiaomi):** nos ajustes do app no Android, ligue "Início automático" e deixe a bateria "Sem restrições". Sem isso o sistema corta a conferência por trás.
- **Sem internet:** igual ao PC, mostra a última leitura com aviso e não grava.

O APK não leva token nem dado nenhum, então serve para qualquer pessoa, cada uma com o próprio repositório de dados.

**Instalar:** abra no navegador do celular https://github.com/luizhenriqueperinif/painel-freelance/releases/latest/download/painel-freelance.apk, baixe e toque em Instalar (na primeira vez o Android pede para permitir instalar apps do navegador).

**Atualizar:** as telas se atualizam sozinhas. O app confere as Releases ao abrir e a cada hora; quando sai uma versão nova, ele baixa as telas e passa a usá-las logo ao abrir ou quando volta para a frente. Se as telas novas não abrirem direito, o app volta para as anteriores em 30 segundos. Só quando a parte Android muda (avisos, onde o token fica) é preciso instalar um APK novo: aí o app avisa no topo com o botão "Baixar". Instalar por cima mantém o token e os dados. O Android não deixa um app de fora da Play Store se instalar sem um toque de confirmação.

**Lançar uma versão nova:** aumente `version` no `package.json`. Se mexeu na parte Android (Java ou manifesto), aumente também `versaoDaParteAndroid`. Faça o commit e o push na main e rode:

```
powershell -ExecutionPolicy Bypass -File scripts\publicar-android.ps1
```

O script gera as telas e o APK e publica a Release com os dois arquivos (`painel-freelance.apk` e `telas.zip`). O APK é assinado com a chave de debug do PC onde foi gerado; para instalar por cima, os APKs precisam sair do mesmo PC.

Para gerar o APK (precisa do Android Studio ou do SDK do Android e do Java 21):

```
npm run build
npx cap sync android
cd android
gradlew assembleDebug
```

O arquivo sai em `android/app/build/outputs/apk/debug/app-debug.apk`. A parte nativa (avisos, conferência por trás e onde o token fica) está em `android/app/src/main/java/com/painelfreelance/app/`.

## Como rodar à mão

```
npm install
copy repositorios.exemplo.json dados\repositorios.json   (e ajuste as pastas)
npm start
```

Abre em http://localhost:5180. O `iniciar.cmd` liga o painel sem janela e abre o navegador (se já estiver ligado, só abre).

Para desenvolver: `npm run dev` (site em http://localhost:5173, com recarga automática). Testes: `npm test`.

Para trazer dados iniciais de uma vez: `npm run importar -- dados/importacao.json` (formato em `importacao.exemplo.json`).

## Claude Code

Registre o servidor MCP uma vez:

```
claude mcp add painel-freelance --scope user -- node "CAMINHO\painel-freelance\src\mcp\index.ts"
```

Depois é só pedir na conversa: "o que tem para hoje?", "cria uma tarefa para a oportunidade X amanhã às 14h", "muda a situação da oportunidade Y para Conversando".

## Dados

Tudo fica em `dados/`, que não vai para o repositório do código: o banco (`painel.db`), a lista de pastas (`repositorios.json`) e a escolha de onde os dados moram (`armazem.json`).

## Dados num repositório privado do GitHub (em mudança)

Os dados estão saindo do SQLite do PC para um arquivo (`painel.json`) num repositório privado do GitHub, para o painel ganhar um app de desktop e um de Android sem tela de login ([a decisão](docs/adr/0002-dados-num-repositorio-privado-no-github.md)). Cada mudança vira um commit nesse repositório. Enquanto `dados/armazem.json` não disser `"dados": "github"`, nada muda: o painel continua no SQLite.

1. Crie um repositório **privado** no GitHub só para os dados (por exemplo `painel-freelance-dados`).
2. Copie `armazem.exemplo.json` para `dados/armazem.json` e coloque o nome do repositório, no formato `usuario/nome`.
3. `npm run copiar-para-o-github`: leva tudo do SQLite, com os mesmos números, e confere se ficou igual.
4. Troque para `"dados": "github"` em `dados/armazem.json` e abra o painel de novo (e o Claude Code, para o servidor MCP recomeçar).

Para voltar atrás, troque a linha para `"sqlite"`. O `dados/painel.db` não é alterado pela cópia.

No PC não há nada para digitar: o painel pede ao git do computador o acesso ao GitHub que ele já usa para o push, e esse acesso fica só na memória do programa. Quem preferir um token que só enxerga o repositório de dados pode colocá-lo em `dados/token-github.txt`.

Cada pessoa que usa o painel aponta para o repositório privado dela, então os dados de uma pessoa nunca passam pela conta de outra.

Sem conexão com o GitHub, o painel mostra a última leitura (guardada em `dados/copia-do-painel.json`) com um aviso no topo dizendo de quando ela é. Nesse estado não dá para gravar: a tela avisa, devolve o que foi digitado e volta ao normal sozinha quando a conexão retorna.
