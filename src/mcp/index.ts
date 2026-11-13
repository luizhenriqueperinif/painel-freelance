// Servidor MCP: é por aqui que o Claude Code gerencia o painel (docs/adr/0001).
// Ele só expõe as ações de src/dominio/painel.ts, sem regra própria.
// Atenção: em stdio, o stdout é do protocolo. Nada de console.log aqui.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { abrirArmazem } from '../dominio/abrir-armazem.ts';
import { diaDeHoje, horaEmBrasilia } from '../dominio/datas.ts';
import { Painel } from '../dominio/painel.ts';
import { lerConfiguracao, lerRepositorios } from '../dominio/repositorios.ts';
import { FRENTES, SITUACOES } from '../dominio/tipos.ts';

// O painel só abre na primeira ferramenta chamada. Se a configuração do armazém estiver errada,
// o servidor continua de pé e a ferramenta devolve a explicação.
let painelAberto: Painel | null = null;
const painel = () => (painelAberto ??= new Painel(abrirArmazem()));

const servidor = new McpServer({ name: 'painel-freelance', version: '0.1.0' });

const frente = z.enum(FRENTES);
const situacao = z.enum(SITUACOES);
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Dia no formato AAAA-MM-DD');
const hora = z.string().regex(/^\d{2}:\d{2}$/).describe('Hora no formato HH:MM, horário de Brasília');

function responder(dados: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(dados, null, 2) }] };
}

/** Sem conexão, a resposta vem de uma leitura antiga guardada no PC: quem lê precisa saber de quando ela é. */
function avisoDeSemConexao(): string | null {
  const { semConexao, dadosDe } = painel().estadoDosDados();
  if (!semConexao || !dadosDe) return null;
  const lidos = new Date(dadosDe);
  const [ano, mes, dia] = diaDeHoje(lidos).split('-');
  return `Aviso: sem conexão com o GitHub. Estes são os dados guardados no PC em ${dia}/${mes}/${ano} às ${horaEmBrasilia(lidos)} e podem estar desatualizados. Não dá para gravar até a conexão voltar.`;
}

async function seguro(acao: () => unknown | Promise<unknown>) {
  try {
    const resposta = responder(await acao());
    const aviso = avisoDeSemConexao();
    if (aviso) resposta.content.push({ type: 'text' as const, text: aviso });
    return resposta;
  } catch (erro) {
    return { content: [{ type: 'text' as const, text: (erro as Error).message }], isError: true };
  }
}

servidor.registerTool(
  'hoje',
  {
    title: 'O que tem para hoje',
    description: 'Tarefas de hoje, atrasadas, dos próximos 7 dias e sem data, oportunidades paradas e os contadores das frentes.',
    inputSchema: {},
  },
  () => seguro(() => painel().hoje()),
);

servidor.registerTool(
  'listar_oportunidades',
  {
    title: 'Listar oportunidades',
    description: 'Lista as oportunidades com situação, valor (em centavos) e próximo passo. Perdidas ficam de fora, a não ser que peça.',
    inputSchema: { frente: frente.optional(), incluirPerdidas: z.boolean().optional() },
  },
  (args) => seguro(() => painel().listarOportunidades(args)),
);

servidor.registerTool(
  'criar_oportunidade',
  {
    title: 'Criar oportunidade',
    description: 'Cria um possível trabalho: proposta numa plataforma, demonstração para comércio ou ONG. Valor em centavos e vazio para voluntário.',
    inputSchema: {
      nome: z.string().min(1),
      frente,
      situacao: situacao.optional(),
      valorCentavos: z.number().int().nonnegative().nullable().optional(),
      prazo: z.string().nullable().optional(),
      link: z.string().nullable().optional(),
      contato: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    },
  },
  (args) => seguro(() => painel().criarOportunidade(args)),
);

servidor.registerTool(
  'atualizar_oportunidade',
  {
    title: 'Atualizar oportunidade',
    description: 'Muda a situação ou outros campos de uma oportunidade. Só os campos enviados mudam.',
    inputSchema: {
      id: z.number().int(),
      nome: z.string().min(1).optional(),
      frente: frente.optional(),
      situacao: situacao.optional(),
      valorCentavos: z.number().int().nonnegative().nullable().optional(),
      prazo: z.string().nullable().optional(),
      link: z.string().nullable().optional(),
      contato: z.string().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    },
  },
  ({ id, ...mudanca }) => seguro(() => painel().atualizarOportunidade(id, mudanca)),
);

servidor.registerTool(
  'listar_tarefas',
  {
    title: 'Listar tarefas',
    description: 'Lista tarefas abertas (padrão), feitas ou todas. Dá para filtrar por frente ou por oportunidade.',
    inputSchema: {
      estado: z.enum(['abertas', 'feitas', 'todas']).optional(),
      frente: z.enum([...FRENTES, 'sem-frente']).optional(),
      oportunidadeId: z.number().int().optional(),
    },
  },
  (args) => seguro(() => painel().listarTarefas(args)),
);

servidor.registerTool(
  'criar_tarefa',
  {
    title: 'Criar tarefa',
    description:
      'Cria uma tarefa. Ligue a uma oportunidade quando for o próximo passo dela. Tarefa com hora gera um link do Google Agenda (linkAgenda) para o Luiz salvar.',
    inputSchema: {
      titulo: z.string().min(1),
      dia: dia.nullable().optional(),
      hora: hora.nullable().optional(),
      oportunidadeId: z.number().int().nullable().optional(),
      repositorio: z.string().nullable().optional(),
      frente: frente.nullable().optional(),
    },
  },
  (args) => seguro(() => painel().criarTarefa(args)),
);

servidor.registerTool(
  'atualizar_tarefa',
  {
    title: 'Atualizar tarefa',
    description: 'Marca como feita (feita: true), reabre (feita: false) ou muda título, dia, hora e ligações de uma tarefa.',
    inputSchema: {
      id: z.number().int(),
      titulo: z.string().min(1).optional(),
      dia: dia.nullable().optional(),
      hora: hora.nullable().optional(),
      oportunidadeId: z.number().int().nullable().optional(),
      repositorio: z.string().nullable().optional(),
      frente: frente.nullable().optional(),
      feita: z.boolean().optional(),
    },
  },
  ({ id, ...mudanca }) => seguro(() => painel().atualizarTarefa(id, mudanca)),
);

servidor.registerTool(
  'listar_repositorios',
  {
    title: 'Listar repositórios',
    description:
      'Lê os repositórios do PC (só leitura): tecnologia, último commit, inativo, mudanças não salvas, GitHub e nomes de arquivos de segredo que estão indo para o git.',
    inputSchema: {},
  },
  () => seguro(async () => lerRepositorios(lerConfiguracao(), await painel().frentesDosRepositorios())),
);

await servidor.connect(new StdioServerTransport());
