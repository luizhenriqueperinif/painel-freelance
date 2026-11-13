import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Armazem } from './armazem.ts';
import { ArmazemEmArquivo } from './armazem-arquivo.ts';
import { ArmazemSqlite } from './armazem-sqlite.ts';
import { ArquivoNoGithub } from './arquivo-github.ts';
import { ArquivoNaMemoria } from './arquivo-memoria.ts';
import { abrirBanco } from './banco.ts';
import { githubDeMentira } from './github-de-mentira.ts';
import { Painel } from './painel.ts';
import { ErroDeValidacao, NaoEncontrado } from './tipos.ts';
import { linkDoCompromisso } from './agenda.ts';
import { ehArquivoDeSegredo, linkDoGithub } from './repositorios.ts';

// 12/11/2026, 15h em Brasília.
const relogio = () => new Date('2026-11-12T18:00:00Z');

// As mesmas regras precisam valer em qualquer armazém.
const ARMAZENS: [string, () => Armazem][] = [
  ['arquivo', () => new ArmazemEmArquivo(new ArquivoNaMemoria())],
  [
    'github de mentira',
    () =>
      new ArmazemEmArquivo(
        new ArquivoNoGithub({ repositorio: 'fulano/dados', token: () => 'token-de-teste', buscar: githubDeMentira('fulano/dados', 'token-de-teste').buscar }),
      ),
  ],
  ['sqlite', () => new ArmazemSqlite(abrirBanco(':memory:'))],
];

for (const [nome, criarArmazem] of ARMAZENS) {
  const novoPainel = () => new Painel(criarArmazem(), relogio);
  const teste = (titulo: string, corpo: () => Promise<void>) => test(`${titulo} [${nome}]`, corpo);

  teste('oportunidade sem tarefa aberta fica parada', async () => {
    const painel = novoPainel();
    const crm = await painel.criarOportunidade({ nome: 'Sistema de vendas', frente: 'Plataformas', situacao: 'Proposta enviada', valorCentavos: 150000 });
    assert.equal(crm.parada, true);
    await painel.criarTarefa({ titulo: 'Ver se respondeu', oportunidadeId: crm.id });
    assert.equal((await painel.buscarOportunidade(crm.id)).parada, false);
  });

  teste('oportunidade encerrada nunca fica parada', async () => {
    const painel = novoPainel();
    const perdida = await painel.criarOportunidade({ nome: 'Integração de pedidos', frente: 'Plataformas', situacao: 'Perdida' });
    assert.equal(perdida.parada, false);
  });

  teste('próximo passo é a tarefa aberta mais próxima', async () => {
    const painel = novoPainel();
    const ong = await painel.criarOportunidade({ nome: 'Site de uma ONG', frente: 'ONGs', situacao: 'Demonstração pronta' });
    await painel.criarTarefa({ titulo: 'Sem data', oportunidadeId: ong.id });
    await painel.criarTarefa({ titulo: 'Dia 17', dia: '2026-11-17', hora: '09:00', oportunidadeId: ong.id });
    const dia13 = await painel.criarTarefa({ titulo: 'Dia 13', dia: '2026-11-13', oportunidadeId: ong.id });
    assert.equal((await painel.buscarOportunidade(ong.id)).proximoPasso?.titulo, 'Dia 13');
    assert.equal((await painel.listarOportunidades())[0]?.proximoPasso?.titulo, 'Dia 13');
    await painel.atualizarTarefa(dia13.id, { feita: true });
    assert.equal((await painel.buscarOportunidade(ong.id)).proximoPasso?.titulo, 'Dia 17');
  });

  teste('hoje separa tarefas de hoje, atrasadas, próximos dias e sem data', async () => {
    const painel = novoPainel();
    await painel.criarTarefa({ titulo: 'hoje', dia: '2026-11-12', hora: '17:20' });
    await painel.criarTarefa({ titulo: 'ontem', dia: '2026-11-11' });
    await painel.criarTarefa({ titulo: 'semana que vem', dia: '2026-11-17' });
    await painel.criarTarefa({ titulo: 'muito longe', dia: '2026-12-30' });
    await painel.criarTarefa({ titulo: 'sem data' });
    const hoje = await painel.hoje();
    assert.equal(hoje.dia, '2026-11-12');
    assert.deepEqual(hoje.paraHoje.map((t) => t.titulo), ['hoje']);
    assert.deepEqual(hoje.atrasadas.map((t) => t.titulo), ['ontem']);
    assert.deepEqual(hoje.proximosDias.map((t) => t.titulo), ['semana que vem']);
    assert.deepEqual(hoje.semData.map((t) => t.titulo), ['sem data']);
  });

  teste('tarefas abertas: sem dia no fim e, no mesmo dia, as com hora primeiro', async () => {
    const painel = novoPainel();
    await painel.criarTarefa({ titulo: 'sem data' });
    await painel.criarTarefa({ titulo: 'dia 14 sem hora', dia: '2026-11-14' });
    await painel.criarTarefa({ titulo: 'dia 14 às 15h', dia: '2026-11-14', hora: '15:00' });
    await painel.criarTarefa({ titulo: 'dia 14 às 9h', dia: '2026-11-14', hora: '09:00' });
    await painel.criarTarefa({ titulo: 'dia 13', dia: '2026-11-13' });
    assert.deepEqual(
      (await painel.listarTarefas()).map((t) => t.titulo),
      ['dia 13', 'dia 14 às 9h', 'dia 14 às 15h', 'dia 14 sem hora', 'sem data'],
    );
  });

  teste('tarefa feita sai da lista de abertas', async () => {
    const painel = novoPainel();
    const t = await painel.criarTarefa({ titulo: 'testar no celular', dia: '2026-11-12' });
    await painel.atualizarTarefa(t.id, { feita: true });
    assert.equal((await painel.hoje()).paraHoje.length, 0);
    assert.equal((await painel.listarTarefas({ estado: 'feitas' })).length, 1);
    await painel.atualizarTarefa(t.id, { feita: false });
    assert.equal((await painel.listarTarefas({ estado: 'feitas' })).length, 0);
  });

  teste('frente da tarefa vem da oportunidade', async () => {
    const painel = novoPainel();
    const padaria = await painel.criarOportunidade({ nome: 'Padaria', frente: 'Comércios' });
    const testar = await painel.criarTarefa({ titulo: 'testar', oportunidadeId: padaria.id });
    await painel.criarTarefa({ titulo: 'jogo no itch.io', frente: 'Jogos' });
    await painel.criarTarefa({ titulo: 'solta' });
    assert.equal(testar.oportunidadeNome, 'Padaria');
    assert.deepEqual((await painel.listarTarefas({ frente: 'Comércios' })).map((t) => t.titulo), ['testar']);
    assert.deepEqual((await painel.listarTarefas({ frente: 'Jogos' })).map((t) => t.titulo), ['jogo no itch.io']);
    assert.deepEqual((await painel.listarTarefas({ frente: 'sem-frente' })).map((t) => t.titulo), ['solta']);
    assert.deepEqual((await painel.listarTarefas({ oportunidadeId: padaria.id })).map((t) => t.titulo), ['testar']);
  });

  teste('validações de tarefa', async () => {
    const painel = novoPainel();
    await assert.rejects(painel.criarTarefa({ titulo: '  ' }), ErroDeValidacao);
    await assert.rejects(painel.criarTarefa({ titulo: 'x', hora: '10:00' }), /precisa ter dia/);
    await assert.rejects(painel.criarTarefa({ titulo: 'x', dia: '2026-02-30' }), /Dia inválido/);
    await assert.rejects(painel.criarTarefa({ titulo: 'x', dia: '2026-11-12', hora: '25:00' }), /Hora inválida/);
    await assert.rejects(painel.criarTarefa({ titulo: 'x', oportunidadeId: 99 }), NaoEncontrado);
    await assert.rejects(painel.atualizarTarefa(99, { feita: true }), NaoEncontrado);
  });

  teste('mudar o horário tira a marca de "na agenda"', async () => {
    const painel = novoPainel();
    const t = await painel.criarTarefa({ titulo: 'ONG', dia: '2026-11-17', hora: '09:00' });
    assert.equal((await painel.atualizarTarefa(t.id, { naAgenda: true })).naAgenda, true);
    assert.equal((await painel.atualizarTarefa(t.id, { titulo: 'ONG: mandar a mensagem' })).naAgenda, true);
    assert.equal((await painel.atualizarTarefa(t.id, { hora: '10:00' })).naAgenda, false);
  });

  teste('tirar o dia também tira a hora', async () => {
    const painel = novoPainel();
    const t = await painel.criarTarefa({ titulo: 'x', dia: '2026-11-17', hora: '09:00' });
    const sem = await painel.atualizarTarefa(t.id, { dia: null });
    assert.equal(sem.dia, null);
    assert.equal(sem.hora, null);
    assert.equal((await painel.buscarTarefa(t.id)).hora, null);
  });

  teste('apagar tarefa', async () => {
    const painel = novoPainel();
    const t = await painel.criarTarefa({ titulo: 'x' });
    await painel.apagarTarefa(t.id);
    assert.equal((await painel.listarTarefas({ estado: 'todas' })).length, 0);
    await assert.rejects(painel.apagarTarefa(t.id), NaoEncontrado);
  });

  teste('atualizar oportunidade muda só o que foi enviado', async () => {
    const painel = novoPainel();
    const site = await painel.criarOportunidade({ nome: 'Site', frente: 'Comércios', valorCentavos: 60000, contato: 'Dona Maria' });
    const depois = await painel.atualizarOportunidade(site.id, { situacao: 'Conversando', contato: '' });
    assert.equal(depois.situacao, 'Conversando');
    assert.equal(depois.valorCentavos, 60000);
    assert.equal(depois.contato, null);
    assert.equal(depois.criadaEm, site.criadaEm);
    await assert.rejects(painel.atualizarOportunidade(99, { nome: 'x' }), NaoEncontrado);
  });

  teste('valor e situação são validados', async () => {
    const painel = novoPainel();
    await assert.rejects(painel.criarOportunidade({ nome: 'x', frente: 'Plataformas', valorCentavos: -1 }), /centavos/);
    await assert.rejects(painel.criarOportunidade({ nome: 'x', frente: 'Plataformas', situacao: 'Enviada' as never }), /Situação inválida/);
    await assert.rejects(painel.criarOportunidade({ nome: 'x', frente: 'Freelas' as never }), /Frente inválida/);
  });

  teste('contadores da tela Hoje', async () => {
    const painel = novoPainel();
    await painel.criarOportunidade({ nome: 'a', frente: 'Plataformas', situacao: 'Proposta enviada' });
    await painel.criarOportunidade({ nome: 'b', frente: 'Plataformas', situacao: 'Perdida' });
    await painel.criarOportunidade({ nome: 'c', frente: 'ONGs', situacao: 'Avaliada' });
    const hoje = await painel.hoje();
    assert.equal(hoje.oportunidadesAtivas, 1);
    assert.equal(hoje.propostasEsperando, 1);
    assert.equal(hoje.avaliacoes, 1);
    assert.deepEqual(hoje.frentes.find((f) => f.frente === 'Plataformas'), { frente: 'Plataformas', oportunidades: 1 });
    assert.equal((await painel.listarOportunidades()).length, 2);
    assert.equal((await painel.listarOportunidades({ incluirPerdidas: true })).length, 3);
  });

  teste('tema padrão é coral e só aceita temas conhecidos', async () => {
    const painel = novoPainel();
    assert.equal(await painel.tema(), 'coral');
    await painel.definirTema('azul');
    assert.equal(await painel.tema(), 'azul');
    await assert.rejects(painel.definirTema('rosa' as never), /Tema inválido/);
  });

  teste('frente escolhida para um repositório', async () => {
    const painel = novoPainel();
    await painel.definirFrenteDoRepositorio('site-demo', 'Comércios');
    await painel.definirFrenteDoRepositorio('jogo', 'Jogos');
    await painel.definirFrenteDoRepositorio('jogo', null);
    assert.deepEqual([...(await painel.frentesDosRepositorios())].sort(), [
      ['jogo', null],
      ['site-demo', 'Comércios'],
    ]);
  });
}

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
  for (const nome of ['.env.example', '.env.exemplo', 'src/app.ts', 'package.json', 'README.md', 'src/auth/recuperar-senha-form.tsx', 'js/chaveamento.js', 'prompts/redesenhar_molde.txt', 'audio/win_secret_drums.ogg', 'docs/secret-falls.md']) {
    assert.equal(ehArquivoDeSegredo(nome), false, nome);
  }
});

test('link do GitHub a partir do remote', () => {
  assert.equal(linkDoGithub('git@github.com:fulano/projeto.git'), 'https://github.com/fulano/projeto');
  assert.equal(linkDoGithub('https://github.com/fulano/projeto.git'), 'https://github.com/fulano/projeto');
  assert.equal(linkDoGithub('https://gitlab.com/fulano/projeto.git'), null);
});
