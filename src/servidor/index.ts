import Fastify, { type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { abrirArmazem, lerEscolha } from '../dominio/abrir-armazem.ts';
import { RAIZ_DO_PROJETO } from '../dominio/banco.ts';
import { Painel } from '../dominio/painel.ts';
import { lerConfiguracao, lerRepositorios } from '../dominio/repositorios.ts';
import {
  ErroDeArmazenamento,
  ErroDeValidacao,
  NaoEncontrado,
  type Frente,
  type MudancaOportunidade,
  type MudancaTarefa,
  type NovaOportunidade,
  type NovaTarefa,
  type Tema,
} from '../dominio/tipos.ts';

export const PORTA = Number(process.env.PORTA ?? 5180);
const PASTA_DO_SITE = join(RAIZ_DO_PROJETO, 'dist');

// Os dados moram no SQLite do PC ou num repositório privado do GitHub (docs/adr/0002).
const escolha = lerEscolha();
const painel = new Painel(abrirArmazem(escolha));
// Só escuta no próprio PC: os dados não ficam acessíveis na rede.
const app = Fastify({ logger: { level: 'warn' } });

app.setErrorHandler((erro, _pedido, resposta: FastifyReply) => {
  if (erro instanceof ErroDeValidacao) return resposta.status(400).send({ erro: erro.message });
  if (erro instanceof NaoEncontrado) return resposta.status(404).send({ erro: erro.message });
  // Sem internet ou sem acesso ao repositório de dados: a tela mostra a explicação.
  if (erro instanceof ErroDeArmazenamento) return resposta.status(503).send({ erro: erro.message });
  const status = (erro as { statusCode?: number }).statusCode;
  if (status && status < 500) return resposta.status(status).send({ erro: (erro as Error).message });
  app.log.error(erro);
  return resposta.status(500).send({ erro: 'Erro inesperado no painel.' });
});

const idDe = (params: unknown) => {
  const id = Number((params as { id: string }).id);
  if (!Number.isInteger(id)) throw new ErroDeValidacao('Id inválido.');
  return id;
};

app.get('/api/hoje', async () => ({ ...(await painel.hoje()), linkDoResumoDiario: painel.linkDoResumoDiario() }));

app.get('/api/oportunidades', async (pedido) => {
  const q = pedido.query as { frente?: Frente; perdidas?: string };
  return painel.listarOportunidades({ frente: q.frente, incluirPerdidas: q.perdidas === '1' });
});
app.post('/api/oportunidades', async (pedido, resposta) =>
  resposta.status(201).send(await painel.criarOportunidade(pedido.body as NovaOportunidade)),
);
app.patch('/api/oportunidades/:id', async (pedido) => painel.atualizarOportunidade(idDe(pedido.params), pedido.body as MudancaOportunidade));

app.get('/api/tarefas', async (pedido) => {
  const q = pedido.query as { estado?: 'abertas' | 'feitas' | 'todas'; frente?: Frente | 'sem-frente' };
  return painel.listarTarefas({ estado: q.estado, frente: q.frente });
});
app.post('/api/tarefas', async (pedido, resposta) => resposta.status(201).send(await painel.criarTarefa(pedido.body as NovaTarefa)));
app.patch('/api/tarefas/:id', async (pedido) => painel.atualizarTarefa(idDe(pedido.params), pedido.body as MudancaTarefa));
app.delete('/api/tarefas/:id', async (pedido, resposta) => {
  await painel.apagarTarefa(idDe(pedido.params));
  return resposta.status(204).send();
});

app.get('/api/repositorios', async () => lerRepositorios(lerConfiguracao(), await painel.frentesDosRepositorios()));
app.put('/api/repositorios/:nome/frente', async (pedido) => {
  const { nome } = pedido.params as { nome: string };
  const { frente } = pedido.body as { frente: Frente | null };
  await painel.definirFrenteDoRepositorio(nome, frente ?? null);
  return { nome, frente: frente ?? null };
});

app.get('/api/tema', async () => ({ tema: await painel.tema() }));
app.put('/api/tema', async (pedido) => ({ tema: await painel.definirTema((pedido.body as { tema: Tema }).tema) }));

if (existsSync(PASTA_DO_SITE)) {
  await app.register(fastifyStatic, { root: PASTA_DO_SITE });
  app.setNotFoundHandler((pedido, resposta) =>
    pedido.url.startsWith('/api/') ? resposta.status(404).send({ erro: 'Rota não encontrada.' }) : resposta.sendFile('index.html'),
  );
}

const ENDERECO = `http://localhost:${PORTA}`;

/** Abre o painel no navegador padrão. Só quando o atalho pede (ABRIR_NAVEGADOR=1). */
function abrirNoNavegador() {
  if (process.env.ABRIR_NAVEGADOR !== '1') return;
  const comando = process.platform === 'win32' ? `start "" "${ENDERECO}"` : process.platform === 'darwin' ? `open "${ENDERECO}"` : `xdg-open "${ENDERECO}"`;
  exec(comando);
}

try {
  await app.listen({ host: '127.0.0.1', port: PORTA });
  console.log(`Painel do Freelance em ${ENDERECO} (dados: ${escolha.dados === 'github' ? `GitHub, ${escolha.repositorio}` : 'SQLite do PC'})`);
  abrirNoNavegador();
} catch (erro) {
  if ((erro as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw erro;
  // O painel já está aberto em outra janela: só mostra a tela de novo.
  console.log(`O painel já está rodando em ${ENDERECO}.`);
  abrirNoNavegador();
}
