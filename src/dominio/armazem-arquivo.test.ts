import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArmazemEmArquivo, ConflitoDeVersao, deTexto, paraTexto, type ArquivoDeDados } from './armazem-arquivo.ts';
import { ArquivoNoGithub } from './arquivo-github.ts';
import { ArquivoNaMemoria, CopiaNaMemoria } from './arquivo-memoria.ts';
import { githubDeMentira } from './github-de-mentira.ts';
import { Painel } from './painel.ts';
import { ErroDeArmazenamento, SemConexao } from './tipos.ts';

const relogio = () => new Date('2026-11-12T18:00:00Z');

/** Dois aparelhos (dois armazéns, cada um com a sua memória) no mesmo arquivo. */
function doisAparelhos() {
  const arquivo = new ArquivoNaMemoria();
  let agora = 0;
  const passarTempo = (ms: number) => (agora += ms);
  const pc = new Painel(new ArmazemEmArquivo(arquivo, () => agora), relogio);
  const celular = new Painel(new ArmazemEmArquivo(arquivo, () => agora), relogio);
  return { arquivo, pc, celular, passarTempo };
}

test('o que um aparelho grava o outro enxerga na leitura seguinte', async () => {
  const { pc, celular, passarTempo } = doisAparelhos();
  assert.equal((await celular.listarTarefas()).length, 0);
  await pc.criarTarefa({ titulo: 'criada no PC' });
  // Dentro de 2 segundos o celular ainda responde da memória; depois disso pergunta de novo.
  assert.equal((await celular.listarTarefas()).length, 0);
  passarTempo(2000);
  assert.deepEqual((await celular.listarTarefas()).map((t) => t.titulo), ['criada no PC']);
});

test('dois aparelhos gravando em cima da mesma leitura: nada se perde e os números não se repetem', async () => {
  const { arquivo, pc, celular } = doisAparelhos();
  await pc.criarOportunidade({ nome: 'Site', frente: 'Comércios' });
  // Os dois leram o arquivo antes de qualquer um gravar.
  await Promise.all([pc.listarTarefas(), celular.listarTarefas()]);
  const doPc = await pc.criarTarefa({ titulo: 'do PC', oportunidadeId: 1 });
  const doCelular = await celular.criarTarefa({ titulo: 'do celular' });
  assert.notEqual(doPc.id, doCelular.id);
  const guardado = deTexto(arquivo.texto!);
  assert.deepEqual(guardado.tarefas.map((t) => [t.id, t.titulo]), [
    [1, 'do PC'],
    [2, 'do celular'],
  ]);
  assert.equal(guardado.proximaTarefa, 3);
});

test('concluir uma tarefa num aparelho não desfaz o que o outro mudou em outra tarefa', async () => {
  const { arquivo, pc, celular, passarTempo } = doisAparelhos();
  const a = await pc.criarTarefa({ titulo: 'A' });
  const b = await pc.criarTarefa({ titulo: 'B' });
  passarTempo(2000);
  await celular.listarTarefas();
  await pc.atualizarTarefa(a.id, { titulo: 'A mudou no PC' });
  // O celular ainda tem a leitura antiga na memória e conclui a outra tarefa.
  await celular.atualizarTarefa(b.id, { feita: true });
  const guardado = deTexto(arquivo.texto!);
  assert.equal(guardado.tarefas.find((t) => t.id === a.id)?.titulo, 'A mudou no PC');
  assert.notEqual(guardado.tarefas.find((t) => t.id === b.id)?.feitaEm, null);
});

test('se o conflito não acaba, o armazém desiste com uma explicação', async () => {
  const sempreEmConflito: ArquivoDeDados = {
    ler: async () => null,
    gravar: async () => {
      throw new ConflitoDeVersao();
    },
  };
  const painel = new Painel(new ArmazemEmArquivo(sempreEmConflito), relogio);
  await assert.rejects(painel.criarTarefa({ titulo: 'x' }), (erro: Error) => erro instanceof ErroDeArmazenamento && /outro aparelho/.test(erro.message));
});

test('uma gravação que falha não trava as seguintes', async () => {
  const arquivo = new ArquivoNaMemoria();
  const gravar = arquivo.gravar.bind(arquivo);
  let falhar = true;
  arquivo.gravar = async (...argumentos) => {
    if (falhar) throw new ErroDeArmazenamento('Não consegui falar com o GitHub.');
    return gravar(...argumentos);
  };
  const painel = new Painel(new ArmazemEmArquivo(arquivo), relogio);
  await assert.rejects(painel.criarTarefa({ titulo: 'sem internet' }), ErroDeArmazenamento);
  falhar = false;
  assert.equal((await painel.criarTarefa({ titulo: 'voltou' })).id, 1);
  assert.deepEqual((await painel.listarTarefas()).map((t) => t.titulo), ['voltou']);
});

test('cada mudança vira uma gravação com mensagem, e o que não muda nada não grava', async () => {
  const arquivo = new ArquivoNaMemoria();
  const painel = new Painel(new ArmazemEmArquivo(arquivo), relogio);
  const site = await painel.criarOportunidade({ nome: 'Site da padaria', frente: 'Comércios' });
  const t = await painel.criarTarefa({ titulo: 'Mandar mensagem', oportunidadeId: site.id });
  await painel.atualizarOportunidade(site.id, { situacao: 'Conversando' });
  await painel.atualizarTarefa(t.id, { feita: true });
  await painel.atualizarTarefa(t.id, { feita: true });
  await painel.atualizarTarefa(t.id, { feita: false });
  await painel.atualizarTarefa(t.id, { titulo: 'Mandar mensagem no WhatsApp' });
  await painel.definirTema('azul');
  await painel.definirTema('azul');
  await painel.definirFrenteDoRepositorio('site-demo', 'Comércios');
  await painel.definirFrenteDoRepositorio('site-demo', 'Comércios');
  await painel.apagarTarefa(t.id);
  assert.deepEqual(arquivo.gravacoes, [
    'Oportunidade 1 criada: Site da padaria',
    'Tarefa 1 criada: Mandar mensagem',
    'Oportunidade 1 passou para Conversando: Site da padaria',
    'Tarefa 1 concluída: Mandar mensagem',
    'Tarefa 1 reaberta: Mandar mensagem',
    'Tarefa 1 alterada: Mandar mensagem no WhatsApp',
    'Preferência tema: azul',
    'Repositório site-demo: frente Comércios',
    'Tarefa 1 apagada: Mandar mensagem no WhatsApp',
  ]);
});

test('várias consultas ao mesmo tempo dividem uma leitura só', async () => {
  const arquivo = new ArquivoNaMemoria();
  let agora = 0;
  const painel = new Painel(new ArmazemEmArquivo(arquivo, () => agora), relogio);
  await Promise.all([painel.hoje(), painel.listarOportunidades(), painel.listarTarefas({ estado: 'feitas' }), painel.tema()]);
  assert.equal(arquivo.leituras, 1);
  agora += 2000;
  await painel.hoje();
  assert.equal(arquivo.leituras, 2);
});

test('o número de uma tarefa apagada não é reaproveitado', async () => {
  const painel = new Painel(new ArmazemEmArquivo(new ArquivoNaMemoria()), relogio);
  const primeira = await painel.criarTarefa({ titulo: 'a' });
  await painel.apagarTarefa(primeira.id);
  assert.equal((await painel.criarTarefa({ titulo: 'b' })).id, 2);
});

test('o texto do arquivo sai sempre na mesma ordem', async () => {
  const arquivo = new ArquivoNaMemoria();
  const painel = new Painel(new ArmazemEmArquivo(arquivo), relogio);
  await painel.definirFrenteDoRepositorio('zebra', 'Jogos');
  await painel.definirFrenteDoRepositorio('abelha', null);
  const t = await painel.criarTarefa({ titulo: 'x', dia: '2026-11-17', hora: '09:00' });
  await painel.atualizarTarefa(t.id, { naAgenda: true });
  const texto = arquivo.texto!;
  assert.equal(texto, paraTexto(deTexto(texto)));
  assert.ok(texto.endsWith('}\n'));
  assert.deepEqual(Object.keys(JSON.parse(texto)), ['formato', 'proximaOportunidade', 'proximaTarefa', 'oportunidades', 'tarefas', 'frentesDosRepositorios', 'preferencias']);
  assert.deepEqual(Object.keys(JSON.parse(texto).tarefas[0]), ['id', 'titulo', 'dia', 'hora', 'oportunidadeId', 'repositorio', 'frente', 'naAgenda', 'feitaEm', 'criadaEm']);
  assert.deepEqual(Object.keys(JSON.parse(texto).frentesDosRepositorios), ['abelha', 'zebra']);
});

test('arquivo estragado ou de formato mais novo é recusado sem ser sobrescrito', async () => {
  for (const [texto, padrao] of [
    ['{ isto não é json', /estragado/],
    ['{"formato": 2, "tarefas": []}', /formato \(2\)/],
    ['[]', /formato/],
  ] as const) {
    const arquivo = new ArquivoNaMemoria();
    arquivo.texto = texto;
    const painel = new Painel(new ArmazemEmArquivo(arquivo), relogio);
    await assert.rejects(painel.hoje(), (erro: Error) => erro instanceof ErroDeArmazenamento && padrao.test(erro.message));
    await assert.rejects(painel.criarTarefa({ titulo: 'x' }), ErroDeArmazenamento);
    assert.equal(arquivo.texto, texto);
    assert.equal(arquivo.gravacoes.length, 0);
  }
});

// ---------- sem conexão ----------

/** Um aparelho com relógio próprio e a cópia que ele guarda da última leitura. */
function aparelho(arquivo = new ArquivoNaMemoria(), copia = new CopiaNaMemoria()) {
  let agora = Date.parse('2026-11-13T13:16:00Z');
  const armazem = new ArmazemEmArquivo(arquivo, () => agora, copia);
  return { arquivo, copia, painel: new Painel(armazem, relogio), passarTempo: (ms: number) => (agora += ms) };
}

const umInstante = () => new Promise((resolve) => setImmediate(resolve));
const titulos = async (painel: Painel) => (await painel.listarTarefas()).map((t) => t.titulo);

test('sem conexão: o painel mostra a última leitura e diz de quando ela é', async () => {
  const { arquivo, painel, passarTempo } = aparelho();
  await painel.criarTarefa({ titulo: 'já estava aqui' });
  assert.deepEqual(painel.estadoDosDados(), { semConexao: false, dadosDe: null });
  passarTempo(60_000);
  await painel.listarTarefas();
  passarTempo(5 * 60_000);
  arquivo.foraDoAr = true;
  assert.deepEqual(await titulos(painel), ['já estava aqui']);
  assert.deepEqual(painel.estadoDosDados(), { semConexao: true, dadosDe: '2026-11-13T13:17:00.000Z' });
  assert.equal((await painel.hoje()).semData.length, 1);
});

test('sem conexão: as consultas não ficam batendo no arquivo a cada clique', async () => {
  const { arquivo, painel, passarTempo } = aparelho();
  await painel.criarTarefa({ titulo: 'a' });
  passarTempo(3000);
  arquivo.foraDoAr = true;
  await painel.listarTarefas();
  const leituras = arquivo.leituras;
  await Promise.all([painel.hoje(), painel.listarOportunidades(), painel.tema()]);
  passarTempo(9000);
  await painel.hoje();
  assert.equal(arquivo.leituras, leituras);
  // Passada a espera, a consulta responde na hora com o que tem e uma nova tentativa corre por trás.
  passarTempo(1000);
  assert.deepEqual(await titulos(painel), ['a']);
  await umInstante();
  assert.equal(arquivo.leituras, leituras + 1);
  assert.equal(painel.estadoDosDados().semConexao, true);
});

test('a conexão volta: o aviso some e aparece o que mudou em outro aparelho', async () => {
  const arquivo = new ArquivoNaMemoria();
  const pc = aparelho(arquivo);
  const celular = aparelho(arquivo);
  await pc.painel.criarTarefa({ titulo: 'do PC' });
  pc.passarTempo(3000);
  arquivo.foraDoAr = true;
  await pc.painel.listarTarefas();
  assert.equal(pc.painel.estadoDosDados().semConexao, true);
  arquivo.foraDoAr = false;
  await celular.painel.criarTarefa({ titulo: 'do celular' });
  pc.passarTempo(10_000);
  await pc.painel.listarTarefas();
  await umInstante();
  assert.deepEqual(pc.painel.estadoDosDados(), { semConexao: false, dadosDe: null });
  assert.deepEqual(await titulos(pc.painel), ['do PC', 'do celular']);
});

test('sem conexão logo ao abrir: vale a cópia guardada no aparelho', async () => {
  const antes = aparelho();
  await antes.painel.criarTarefa({ titulo: 'guardada' });
  // O painel é fechado e aberto de novo uma hora depois, sem internet.
  antes.arquivo.foraDoAr = true;
  const depois = aparelho(antes.arquivo, antes.copia);
  depois.passarTempo(3_600_000);
  assert.deepEqual(await titulos(depois.painel), ['guardada']);
  assert.deepEqual(depois.painel.estadoDosDados(), { semConexao: true, dadosDe: '2026-11-13T13:16:00.000Z' });
});

test('sem conexão e sem cópia nenhuma: o erro aparece em vez de um painel vazio', async () => {
  const arquivo = new ArquivoNaMemoria();
  arquivo.foraDoAr = true;
  for (const painel of [aparelho(arquivo).painel, new Painel(new ArmazemEmArquivo(arquivo), relogio)]) {
    await assert.rejects(painel.hoje(), SemConexao);
    assert.deepEqual(painel.estadoDosDados(), { semConexao: true, dadosDe: null });
  }
});

test('cópia estragada no aparelho é como não ter cópia', async () => {
  const { arquivo, copia, painel } = aparelho();
  copia.guardada = { texto: '{ isto não é json', versao: '1', lidaEm: 0 };
  arquivo.foraDoAr = true;
  await assert.rejects(painel.hoje(), SemConexao);
});

test('sem conexão: gravar é recusado na hora e volta a funcionar com a conexão', async () => {
  const { arquivo, painel, passarTempo } = aparelho();
  await painel.criarTarefa({ titulo: 'antes' });
  passarTempo(3000);
  arquivo.foraDoAr = true;
  await painel.listarTarefas();
  const leituras = arquivo.leituras;
  await assert.rejects(painel.criarTarefa({ titulo: 'não entra' }), (erro: Error) => erro instanceof SemConexao && /não deu para gravar/.test(erro.message));
  assert.equal(arquivo.leituras, leituras);
  // Passada a espera, o armazém procura o arquivo de verdade antes de desistir.
  passarTempo(10_000);
  await assert.rejects(painel.criarTarefa({ titulo: 'não entra' }), SemConexao);
  assert.equal(arquivo.leituras, leituras + 1);
  assert.deepEqual(arquivo.gravacoes, ['Tarefa 1 criada: antes']);
  arquivo.foraDoAr = false;
  passarTempo(10_000);
  assert.equal((await painel.criarTarefa({ titulo: 'depois' })).id, 2);
  assert.deepEqual(painel.estadoDosDados(), { semConexao: false, dadosDe: null });
  assert.deepEqual(await titulos(painel), ['antes', 'depois']);
});

test('a conexão cai na hora de gravar: o painel avisa e continua mostrando o que tinha', async () => {
  const { arquivo, painel } = aparelho();
  await painel.criarTarefa({ titulo: 'antes' });
  arquivo.foraDoAr = true;
  await assert.rejects(painel.criarTarefa({ titulo: 'não entra' }), SemConexao);
  assert.equal(painel.estadoDosDados().semConexao, true);
  assert.deepEqual(await titulos(painel), ['antes']);
});

test('depois de ficar sem conexão, a gravação é feita em cima do arquivo de agora', async () => {
  const arquivo = new ArquivoNaMemoria();
  const pc = aparelho(arquivo);
  const celular = aparelho(arquivo);
  await pc.painel.criarTarefa({ titulo: 'A' });
  pc.passarTempo(3000);
  arquivo.foraDoAr = true;
  await pc.painel.listarTarefas();
  arquivo.foraDoAr = false;
  await celular.painel.criarTarefa({ titulo: 'B' });
  pc.passarTempo(10_000);
  assert.equal((await pc.painel.criarTarefa({ titulo: 'C' })).id, 3);
  assert.deepEqual(deTexto(arquivo.texto!).tarefas.map((t) => t.titulo), ['A', 'B', 'C']);
});

test('token recusado e arquivo estragado aparecem mesmo com cópia guardada', async () => {
  const github = githubDeMentira(REPOSITORIO, TOKEN);
  const copia = new CopiaNaMemoria();
  const comAcesso = new Painel(new ArmazemEmArquivo(noGithub(github).arquivo, undefined, copia), relogio);
  await comAcesso.criarTarefa({ titulo: 'guardada' });
  assert.ok(copia.guardada);
  const semAcesso = new Painel(new ArmazemEmArquivo(noGithub(github, { token: 'vencido' }).arquivo, undefined, copia), relogio);
  await assert.rejects(semAcesso.hoje(), (erro: Error) => !(erro instanceof SemConexao) && /token não vale mais/.test(erro.message));
  assert.equal(semAcesso.estadoDosDados().semConexao, false);

  // O arquivo foi estragado por fora e o painel é aberto de novo, com a cópia boa ainda no aparelho.
  const estragado = new ArquivoNaMemoria();
  estragado.texto = '{ isto não é json';
  const { painel } = aparelho(estragado, copia);
  await assert.rejects(painel.hoje(), (erro: Error) => !(erro instanceof SemConexao) && /estragado/.test(erro.message));
  assert.equal(painel.estadoDosDados().semConexao, false);
});

test('a cópia do aparelho só é regravada quando o arquivo muda ou depois de um minuto', async () => {
  const { copia, painel, passarTempo } = aparelho();
  await painel.criarTarefa({ titulo: 'a' });
  assert.equal(copia.gravacoes, 1);
  for (let i = 0; i < 5; i++) {
    passarTempo(5000);
    await painel.listarTarefas();
  }
  assert.equal(copia.gravacoes, 1);
  passarTempo(60_000);
  await painel.listarTarefas();
  assert.equal(copia.gravacoes, 2);
  assert.equal(copia.guardada!.lidaEm, Date.parse('2026-11-13T13:17:25Z'));
  await painel.criarTarefa({ titulo: 'b' });
  assert.equal(copia.gravacoes, 3);
  assert.deepEqual(deTexto(copia.guardada!.texto).tarefas.map((t) => t.titulo), ['a', 'b']);
});

// ---------- o arquivo no GitHub ----------

const REPOSITORIO = 'fulano/dados';
const TOKEN = 'token-de-teste';
const noGithub = (github = githubDeMentira(REPOSITORIO, TOKEN), opcoes: { token?: string; repositorio?: string; ramo?: string } = {}) => ({
  github,
  arquivo: new ArquivoNoGithub({ repositorio: opcoes.repositorio ?? REPOSITORIO, token: () => opcoes.token ?? TOKEN, buscar: github.buscar, ramo: opcoes.ramo }),
});

test('github: arquivo que ainda não existe, criação e leitura com acento', async () => {
  const { github, arquivo } = noGithub();
  assert.equal(await arquivo.ler(), null);
  const texto = '{"nome": "Demonstração pronta — ação, coração, R$ 2.800"}\n';
  const versao = await arquivo.gravar(texto, null, 'cria');
  assert.equal(github.texto(), texto);
  assert.deepEqual(await arquivo.ler(), { texto, versao });
  assert.deepEqual(github.commits, ['cria']);
});

test('github: todo pedido leva o token e pede a resposta de agora, sem cache do navegador', async () => {
  const { github, arquivo } = noGithub();
  await arquivo.gravar('{}', null, 'cria');
  await arquivo.ler();
  assert.ok(github.pedidos.length >= 2);
  for (const pedido of github.pedidos) {
    assert.equal(pedido.cabecalhos.authorization, `Bearer ${TOKEN}`);
    assert.equal(pedido.cache, 'no-store');
  }
});

test('github: ler de novo sem mudança usa a etiqueta e não baixa o arquivo outra vez', async () => {
  const { github, arquivo } = noGithub();
  github.gravarPorFora('{"a": 1}');
  const primeira = await arquivo.ler();
  const segunda = await arquivo.ler();
  assert.deepEqual(segunda, primeira);
  assert.ok(github.pedidos.at(-1)!.cabecalhos['if-none-match']);
  github.gravarPorFora('{"a": 2}');
  assert.equal((await arquivo.ler())?.texto, '{"a": 2}');
});

test('github: gravar em cima de versão antiga é conflito, e criar o que já existe também', async () => {
  const { github, arquivo } = noGithub();
  const versao = await arquivo.gravar('{"a": 1}', null, 'cria');
  github.gravarPorFora('{"a": 2}');
  await assert.rejects(arquivo.gravar('{"a": 3}', versao, 'atrasado'), ConflitoDeVersao);
  await assert.rejects(arquivo.gravar('{"a": 3}', null, 'cria de novo'), ConflitoDeVersao);
  assert.equal(github.texto(), '{"a": 2}');
});

test('github: outro aparelho grava no meio e o armazém refaz a mudança em cima do arquivo novo', async () => {
  const { github, arquivo } = noGithub();
  const pc = new Painel(new ArmazemEmArquivo(arquivo), relogio);
  await pc.criarTarefa({ titulo: 'primeira' });
  // Logo antes da próxima gravação do PC chegar, o celular grava a dele.
  const celular = new Painel(new ArmazemEmArquivo(noGithub(github).arquivo), relogio);
  github.antesDeGravar = () => {
    github.antesDeGravar = null;
    const dados = deTexto(github.texto()!);
    dados.tarefas.push({ ...dados.tarefas[0]!, id: dados.proximaTarefa++, titulo: 'do celular' });
    github.gravarPorFora(paraTexto(dados));
  };
  const doPc = await pc.criarTarefa({ titulo: 'do PC' });
  assert.equal(doPc.id, 3);
  assert.deepEqual((await celular.listarTarefas()).map((t) => [t.id, t.titulo]), [
    [1, 'primeira'],
    [2, 'do celular'],
    [3, 'do PC'],
  ]);
});

test('github: arquivo com mais de 1 MB vem pelo blob', async () => {
  const { github, arquivo } = noGithub();
  github.limiteDoConteudo = 10;
  const texto = '{"observacoes": "um texto maior que o limite, com acentuação"}';
  github.gravarPorFora(texto);
  assert.equal((await arquivo.ler())?.texto, texto);
  assert.ok(github.pedidos.some((p) => p.caminho.includes('/git/blobs/')));
});

test('github: ramo próprio não mexe no principal', async () => {
  const { github, arquivo } = noGithub(undefined, { ramo: 'teste' });
  await arquivo.gravar('{"a": 1}', null, 'cria no ramo');
  assert.equal(github.texto('teste'), '{"a": 1}');
  assert.equal(github.texto(), null);
  assert.equal((await arquivo.ler())?.texto, '{"a": 1}');
});

test('github: repositório errado não aparece como painel vazio', async () => {
  const { arquivo } = noGithub(undefined, { repositorio: 'fulano/outro' });
  await assert.rejects(arquivo.ler(), (erro: Error) => erro instanceof ErroDeArmazenamento && /Não achei o repositório fulano\/outro/.test(erro.message));
});

test('github: token recusado e falta de internet viram explicação', async () => {
  const semAcesso = noGithub(undefined, { token: 'vencido' });
  await assert.rejects(semAcesso.arquivo.ler(), (erro: Error) => erro instanceof ErroDeArmazenamento && /token não vale mais/.test(erro.message));
  const { github, arquivo } = noGithub();
  github.foraDoAr = true;
  await assert.rejects(arquivo.ler(), (erro: Error) => erro instanceof ErroDeArmazenamento && /Confira a internet/.test(erro.message));
  await assert.rejects(arquivo.gravar('{}', null, 'x'), ErroDeArmazenamento);
});

test('github: sem resposta, erro do lado do GitHub e pausa contam como falta de conexão; o resto não', async () => {
  const { github, arquivo } = noGithub();
  github.gravarPorFora('{"a": 1}');
  github.foraDoAr = true;
  await assert.rejects(arquivo.ler(), SemConexao);
  await assert.rejects(arquivo.gravar('{}', null, 'x'), SemConexao);
  github.foraDoAr = false;
  github.comProblema = 502;
  await assert.rejects(arquivo.ler(), (erro: Error) => erro instanceof SemConexao && /erro 502/.test(erro.message));
  github.comProblema = null;
  github.pedindoPausa = true;
  await assert.rejects(arquivo.ler(), (erro: Error) => erro instanceof SemConexao && /pausa/.test(erro.message));
  github.pedindoPausa = false;
  assert.equal((await arquivo.ler())?.texto, '{"a": 1}');

  const naoEhConexao = (erro: Error) => erro instanceof ErroDeArmazenamento && !(erro instanceof SemConexao);
  await assert.rejects(noGithub(github, { token: 'vencido' }).arquivo.ler(), naoEhConexao);
  await assert.rejects(noGithub(github, { repositorio: 'fulano/outro' }).arquivo.ler(), naoEhConexao);
});

test('github: todo pedido tem limite de tempo', async () => {
  const { github } = noGithub();
  const sinais: (AbortSignal | null | undefined)[] = [];
  const buscar = github.buscar;
  const comSinal = new ArquivoNoGithub({
    repositorio: REPOSITORIO,
    token: () => TOKEN,
    buscar: ((entrada, opcoes) => {
      sinais.push(opcoes?.signal);
      return buscar(entrada, opcoes);
    }) as typeof fetch,
  });
  await comSinal.gravar('{}', null, 'cria');
  await comSinal.ler();
  assert.equal(sinais.length, 2);
  assert.ok(sinais.every((sinal) => sinal instanceof AbortSignal));
});

test('github: o nome do repositório precisa ser "dono/nome"', () => {
  assert.throws(() => new ArquivoNoGithub({ repositorio: 'so-o-nome', token: () => TOKEN }), /dono\/nome/);
});
