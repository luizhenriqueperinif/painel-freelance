---
status: accepted
---

# Sem chave de API: o Claude gerencia o painel pelo MCP

O painel não chama a API da Anthropic. Toda a inteligência vem do Claude Code, que lê e altera os dados por um servidor MCP local quando o Luiz conversa com ele. Escolhemos assim porque a v1 roda só no PC, onde o Claude Code já está; porque não há custo por uso enquanto o freelance ainda não dá retorno; e porque o código é público, e sem chave não existe segredo que possa vazar.

## Consequências

- O painel não age sozinho: não gera resumo nem analisa nada sem uma conversa aberta com o Claude.
- As ações (criar tarefa, mudar a situação de uma oportunidade, listar repositórios) ficam numa camada própria que o servidor MCP só expõe. Um assistente com chave de API, se vier, deve usar essa mesma camada, e não uma segunda cópia das regras.
- Se a chave for adicionada no futuro, ela deve ser opcional e desligada por padrão: o painel precisa funcionar inteiro sem ela, a chave fica só no PC (fora do banco e do GitHub) e nenhuma chamada à API acontece com a opção desligada.
