import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abrirBanco } from './banco.ts';
import { Painel } from './painel.ts';
import { ErroDeValidacao } from './tipos.ts';
import { linkDoCompromisso } from './agenda.ts';
import { ehArquivoDeSegredo, linkDoGithub } from './repositorios.ts';

// 12/11/2026, 15h em Brasília.
const relogio = () => new Date('2026-11-12T18:00:00Z');
const novoPainel = () => new Painel(abrirBanco(':memory:'), relogio);

test('oportunidade sem tarefa aberta fica parada', () => {
  const painel = novoPainel();
  const crm = painel.criarOportunidade({ nome: 'Sistema de vendas', frente: 'Plataformas', situacao: 'Proposta enviada', valorCentavos: 150000 });
  assert.equal(crm.parada, true);
  painel.criarTarefa({ titulo: 'Ver se respondeu', oportunidadeId: crm.id });
  assert.equal(painel.buscarOportunidade(crm.id).parada, false);
});

test('oportunidade encerrada nunca fica parada', () => {
  const painel = novoPainel();
  const perdida = painel.criarOportunidade({ nome: 'Integração de pedidos', frente: 'Plataformas', situacao: 'Perdida' });
  assert.equal(perdida.parada, false);
});

test('próximo passo é a tarefa aberta mais próxima', () => {
  const painel = novoPainel();
  const ong = painel.criarOportunidade({ nome: 'Site de uma ONG', frente: 'ONGs', situacao: 'Demonstração pronta' });
  painel.criarTarefa({ titulo: 'Sem data', oportunidadeId: ong.id });
  painel.criarTarefa({ titulo: 'Dia 17', dia: '2026-11-17', hora: '09:00', oportunidadeId: ong.id });
  const dia13 = painel.criarTarefa({ titulo: 'Dia 13', dia: '2026-11-13', oportunidadeId: ong.id });
  assert.equal(painel.buscarOportunidade(ong.id).proximoPasso?.titulo, 'Dia 13');
  painel.atualizarTarefa(dia13.id, { feita: true });
  assert.equal(painel.buscarOportunidade(ong.id).proximoPasso?.titulo, 'Dia 17');
});

test('hoje separa tarefas de hoje, atrasadas, próximos dias e sem data', () => {
  const painel = novoPainel();
  painel.criarTarefa({ titulo: 'hoje', dia: '2026-11-12', hora: '17:20' });
  painel.criarTarefa({ titulo: 'ontem', dia: '2026-11-11' });
  painel.criarTarefa({ titulo: 'semana que vem', dia: '2026-11-17' });
  painel.criarTarefa({ titulo: 'muito longe', dia: '2026-12-30' });
  painel.criarTarefa({ titulo: 'sem data' });
  const hoje = painel.hoje();
  assert.equal(hoje.dia, '2026-11-12');
  assert.deepEqual(hoje.paraHoje.map((t) => t.titulo), ['hoje']);
  assert.deepEqual(hoje.atrasadas.map((t) => t.titulo), ['ontem']);
  assert.deepEqual(hoje.proximosDias.map((t) => t.titulo), ['semana que vem']);
  assert.deepEqual(hoje.semData.map((t) => t.titulo), ['sem data']);
});

test('tarefa feita sai da lista de abertas', () => {
  const painel = novoPainel();
  const t = painel.criarTarefa({ titulo: 'testar no celular', dia: '2026-11-12' });
  painel.atualizarTarefa(t.id, { feita: true });
  assert.equal(painel.hoje().paraHoje.length, 0);
  assert.equal(painel.listarTarefas({ estado: 'feitas' }).length, 1);
});

test('frente da tarefa vem da oportunidade', () => {
  const painel = novoPainel();
  const padaria = painel.criarOportunidade({ nome: 'Padaria', frente: 'Comércios' });
  painel.criarTarefa({ titulo: 'testar', oportunidadeId: padaria.id });
  painel.criarTarefa({ titulo: 'jogo no itch.io', frente: 'Jogos' });
  painel.criarTarefa({ titulo: 'solta' });
  assert.deepEqual(painel.listarTarefas({ frente: 'Comércios' }).map((t) => t.titulo), ['testar']);
  assert.deepEqual(painel.listarTarefas({ frente: 'Jogos' }).map((t) => t.titulo), ['jogo no itch.io']);
  assert.deepEqual(painel.listarTarefas({ frente: 'sem-frente' }).map((t) => t.titulo), ['solta']);
});

test('validações de tarefa', () => {
  const painel = novoPainel();
  assert.throws(() => painel.criarTarefa({ titulo: '  ' }), ErroDeValidacao);
  assert.throws(() => painel.criarTarefa({ titulo: 'x', hora: '10:00' }), /precisa ter dia/);
  assert.throws(() => painel.criarTarefa({ titulo: 'x', dia: '2026-02-30' }), /Dia inválido/);
  assert.throws(() => painel.criarTarefa({ titulo: 'x', dia: '2026-11-12', hora: '25:00' }), /Hora inválida/);
});

test('mudar o horário tira a marca de "na agenda"', () => {
  const painel = novoPainel();
  const t = painel.criarTarefa({ titulo: 'ONG', dia: '2026-11-17', hora: '09:00' });
  assert.equal(painel.atualizarTarefa(t.id, { naAgenda: true }).naAgenda, true);
  assert.equal(painel.atualizarTarefa(t.id, { titulo: 'ONG: mandar a mensagem' }).naAgenda, true);
  assert.equal(painel.atualizarTarefa(t.id, { hora: '10:00' }).naAgenda, false);
});

test('tirar o dia também tira a hora', () => {
  const painel = novoPainel();
  const t = painel.criarTarefa({ titulo: 'x', dia: '2026-11-17', hora: '09:00' });
  const sem = painel.atualizarTarefa(t.id, { dia: null });
  assert.equal(sem.dia, null);
  assert.equal(sem.hora, null);
});

test('valor e situação são validados', () => {
  const painel = novoPainel();
  assert.throws(() => painel.criarOportunidade({ nome: 'x', frente: 'Plataformas', valorCentavos: -1 }), /centavos/);
  assert.throws(() => painel.criarOportunidade({ nome: 'x', frente: 'Plataformas', situacao: 'Enviada' as never }), /Situação inválida/);
  assert.throws(() => painel.criarOportunidade({ nome: 'x', frente: 'Freelas' as never }), /Frente inválida/);
});

test('contadores da tela Hoje', () => {
  const painel = novoPainel();
  painel.criarOportunidade({ nome: 'a', frente: 'Plataformas', situacao: 'Proposta enviada' });
  painel.criarOportunidade({ nome: 'b', frente: 'Plataformas', situacao: 'Perdida' });
  painel.criarOportunidade({ nome: 'c', frente: 'ONGs', situacao: 'Avaliada' });
  const hoje = painel.hoje();
  assert.equal(hoje.oportunidadesAtivas, 1);
  assert.equal(hoje.propostasEsperando, 1);
  assert.equal(hoje.avaliacoes, 1);
  assert.deepEqual(hoje.frentes.find((f) => f.frente === 'Plataformas'), { frente: 'Plataformas', oportunidades: 1 });
});

test('tema padrão é coral e só aceita temas conhecidos', () => {
  const painel = novoPainel();
  assert.equal(painel.tema(), 'coral');
  painel.definirTema('azul');
  assert.equal(painel.tema(), 'azul');
  assert.throws(() => painel.definirTema('rosa' as never), /Tema inválido/);
});

test('link do Google Agenda usa o fuso de Brasília e 30 minutos', () => {
  const url = new URL(linkDoCompromisso({ titulo: 'ONG', dia: '2026-11-17', hora: '23:45' }));
  assert.equal(url.searchParams.get('dates'), '20261117T234500/20261118T001500');
  assert.equal(url.searchParams.get('ctz'), 'America/Sao_Paulo');
  assert.equal(url.searchParams.get('text'), 'ONG');
});

test('arquivos de segredo pelo nome', () => {
  for (const nome of ['.env', 'api/.env.local', 'certs/key.pem', 'config.json', 'chave-google.txt', 'dados/senhas.txt', 'credentials.json', '.ssh/id_rsa']) {
    assert.equal(ehArquivoDeSegredo(nome), true, nome);
  }
  for (const nome of ['.env.example', 'src/app.ts', 'package.json', 'README.md', 'src/auth/recuperar-senha-form.tsx', 'js/chaveamento.js', 'prompts/redesenhar_molde.txt', 'audio/win_secret_drums.ogg', 'docs/secret-falls.md']) {
    assert.equal(ehArquivoDeSegredo(nome), false, nome);
  }
});

test('link do GitHub a partir do remote', () => {
  assert.equal(linkDoGithub('git@github.com:fulano/projeto.git'), 'https://github.com/fulano/projeto');
  assert.equal(linkDoGithub('https://github.com/fulano/projeto.git'), 'https://github.com/fulano/projeto');
  assert.equal(linkDoGithub('https://gitlab.com/fulano/projeto.git'), null);
});
