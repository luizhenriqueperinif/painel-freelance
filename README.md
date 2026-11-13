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

## Como rodar

```
npm install
copy repositorios.exemplo.json dados\repositorios.json   (e ajuste as pastas)
npm start
```

Abre em http://localhost:5180. No Windows, o `iniciar.cmd` faz tudo isso e abre o navegador.

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
