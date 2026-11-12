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
src/dominio    regras do painel (a única camada com regra de negócio)
src/servidor   API e site, só em 127.0.0.1
src/mcp        servidor MCP para o Claude Code
web            telas em React
dados          banco e configuração pessoal (fora do git)
```

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

Tudo fica em `dados/`, que não vai para o GitHub: o banco (`painel.db`) e a lista de pastas (`repositorios.json`).
