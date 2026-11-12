import Fastify, { type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import { exec } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { abrirBanco, RAIZ_DO_PROJETO } from '../dominio/banco.ts';
import { Painel } from '../dominio/painel.ts';
import { lerConfiguracao, lerRepositorios } from '../dominio/repositorios.ts';
import {
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

const painel = new Painel(abrirBanco());
// Só escuta no próprio PC: os dados não ficam acessíveis na rede.
const app = Fastify({ logger: { level: 'warn' } });

app.setErrorHandler((erro, _pedido, resposta: FastifyReply) => {
  if (erro instanceof ErroDeValidacao) return resposta.status(400).send({ erro: erro.message });
  if (erro instanceof NaoEncontrado) return resposta.status(404).send({ erro: erro.message });
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

app.get('/api/hoje', async () => ({ ...painel.hoje(), linkDoResumoDiario: painel.linkDoResumoDiario() }));

app.get('/api/oportunidades', async (pedido) => {
  const q = pedido.query as { frente?: Frente; perdidas?: string };
  return painel.listarOportunidades({ frente: q.frente, incluirPerdidas: q.perdidas === '1' });
});
app.post('/api/oportunidades', async (pedido, resposta) =>
  resposta.status(201).send(painel.criarOportunidade(pedido.body as NovaOportunidade)),
);
app.patch('/api/oportunidades/:id', async (pedido) => painel.atualizarOportunidade(idDe(pedido.params), pedido.body as MudancaOportunidade));

app.get('/api/tarefas', async (pedido) => {
  const q = pedido.query as { estado?: 'abertas' | 'feitas' | 'todas'; frente?: Frente | 'sem-frente' };
  return painel.listarTarefas({ estado: q.estado, frente: q.frente });
});
app.post('/api/tarefas', async (pedido, resposta) => resposta.status(201).send(painel.criarTarefa(pedido.body as NovaTarefa)));
app.patch('/api/tarefas/:id', async (pedido) => painel.atualizarTarefa(idDe(pedido.params), pedido.body as MudancaTarefa));
app.delete('/api/tarefas/:id', async (pedido, resposta) => {
  painel.apagarTarefa(idDe(pedido.params));
  return resposta.status(204).send();
});

app.get('/api/repositorios', async () => lerRepositorios(lerConfiguracao(), painel.frentesDosRepositorios()));
app.put('/api/repositorios/:nome/frente', async (pedido) => {
  const { nome } = pedido.params as { nome: string };
  const { frente } = pedido.body as { frente: Frente | null };
  painel.definirFrenteDoRepositorio(nome, frente ?? null);
  return { nome, frente: frente ?? null };
});

app.get('/api/tema', async () => ({ tema: painel.tema() }));
app.put('/api/tema', async (pedido) => ({ tema: painel.definirTema((pedido.body as { tema: Tema }).tema) }));

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
  console.log(`Painel do Freelance em ${ENDERECO}`);
  abrirNoNavegador();
} catch (erro) {
  if ((erro as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw erro;
  // O painel já está aberto em outra janela: só mostra a tela de novo.
  console.log(`O painel já está rodando em ${ENDERECO}.`);
  abrirNoNavegador();
}
