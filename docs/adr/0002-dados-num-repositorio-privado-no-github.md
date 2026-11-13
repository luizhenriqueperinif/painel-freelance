---
status: accepted
---

# Dados num repositório privado do GitHub, sem login

Os dados do painel (oportunidades, tarefas, preferências) deixam de ficar só no arquivo SQLite do PC e passam para um arquivo JSON num repositório privado do GitHub, na conta de quem usa o painel. Escolhemos assim porque o painel vai ganhar um app de desktop (Electron) e um de Android (Capacitor, instalado por APK), e os dois precisam ver os mesmos dados de qualquer lugar, mesmo com o PC desligado. O Luiz quer um app sem tela de login e sem um serviço a mais para cuidar, e o GitHub ele já usa.

A alternativa mais forte era um banco no Supabase com login por e-mail e senha. Ela chegou a ser construída em 13/11/2026 e foi descartada: exigia criar projeto, usuário e tabelas, pedia login em cada aparelho e, se outras pessoas usassem o app, os clientes e valores delas ficariam guardados no projeto do Luiz. As outras alternativas eram o celular acessar o PC pela rede de casa ou por uma rede privada, que só funcionam com o PC ligado.

## Consequências

- Clientes e valores saem do PC. Ficam num repositório privado, e quem tem acesso a ele é quem tem a conta do GitHub ou um token dela. Isso substitui a ideia de "dados só no PC" da primeira versão.
- No PC não há nada para digitar: o painel usa o acesso ao GitHub que o git do computador já tem. No celular, o token é colado uma vez numa tela de configuração e fica guardado só no aparelho. O token nunca vai embutido no APK nem no código, então o mesmo app serve para qualquer pessoa.
- Cada pessoa que usa o app aponta para o repositório privado dela. Os dados de uma pessoa nunca passam por nada que seja de outra, e o Luiz não tem como ver os dados de ninguém.
- Montar o próprio repositório e o próprio token é coisa para quem tem conta no GitHub. Abrir o app para o público em geral é outra decisão, com outro armazém.
- Toda mudança vira um commit no repositório de dados: o histórico e o backup vêm de graça, e salvar leva de 1 a 2 segundos. A tela mostra a mudança na hora e volta atrás, com o motivo, se a gravação falhar.
- Vários aparelhos gravam no mesmo arquivo. Cada gravação diz qual versão leu; se a versão já mudou, o painel lê de novo e refaz só aquela mudança. Se dois aparelhos mexem no mesmo item, vale a última gravação.
- O painel inteiro cabe num arquivo só. Serve para o volume de uma pessoa; não é um banco de dados.
- Sem internet o painel mostra a última leitura, que fica guardada no aparelho, com um aviso de quando ela é, e não grava. Guardar mudanças feitas sem internet para enviar depois não faz parte desta decisão.
- A tela Repositórios continua dependendo do PC e não aparece no celular. O app de desktop em Electron saiu do plano em 13/11/2026: o atalho que liga o painel sem janela e o instalador já resolvem o PC.
- No Android, os avisos das tarefas com hora e a conferência do arquivo a cada 15 minutos são uma parte nativa pequena do app, e não o plugin pronto de tarefa em segundo plano: aquele plugin só agenda avisos e não cancela, então uma tarefa concluída no PC continuaria avisando no celular.
- No Android, as telas se atualizam sozinhas por um pacote (telas.zip) em cada Release; só a parte nativa pede um APK novo. O pacote só é aceito se vier das Releases do repositório do código, então quem pode publicar ali pode mudar o que o app faz com o token, o mesmo que já valia para o APK.
- As ações continuam numa camada única (ADR 0001). Ela não usa nada do Node, porque o app de Android não tem servidor local, e fala com os dados por um armazém que pode ser trocado.
- O servidor MCP lê e grava no mesmo arquivo, para o Claude continuar gerenciando o painel.
