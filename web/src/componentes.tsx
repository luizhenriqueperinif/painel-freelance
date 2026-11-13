import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FRENTES, type Frente, type MudancaTarefa, type OportunidadeComPasso, type Tarefa } from '../../src/dominio/tipos.ts';
import { api } from './api.ts';
import { quando, quandoFoiFeita } from './formato.ts';

const PEDIDO_DE_ATUALIZACAO = 'painel:atualizar';
const PAUSA_ENTRE_VOLTAS_MS = 2000;

/** O botão "atualizar" do topo: a tela aberta busca os dados de novo. */
export function pedirAtualizacao() {
  window.dispatchEvent(new Event(PEDIDO_DE_ATUALIZACAO));
}

/**
 * Carrega dados e recarrega quando chamado. Também recarrega pelo botão "atualizar" e,
 * a não ser que aoVoltar seja false, quando a janela volta ao foco: é assim que aparece
 * o que mudou em outro aparelho ou pelo Claude.
 */
export function useCarregar<T>(buscar: () => Promise<T>, dependencias: unknown[] = [], opcoes: { aoVoltar?: boolean } = {}) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recarregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await buscar());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, dependencias);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const aoVoltar = opcoes.aoVoltar !== false;
  useEffect(() => {
    let ultima = Date.now();
    // Foco e visibilidade costumam chegar juntos: a pausa evita buscar duas vezes.
    const voltou = () => {
      if (document.visibilityState !== 'visible' || Date.now() - ultima < PAUSA_ENTRE_VOLTAS_MS) return;
      ultima = Date.now();
      void recarregar();
    };
    const pedido = () => {
      ultima = Date.now();
      void recarregar();
    };
    window.addEventListener(PEDIDO_DE_ATUALIZACAO, pedido);
    if (aoVoltar) {
      window.addEventListener('focus', voltou);
      document.addEventListener('visibilitychange', voltou);
    }
    return () => {
      window.removeEventListener(PEDIDO_DE_ATUALIZACAO, pedido);
      window.removeEventListener('focus', voltou);
      document.removeEventListener('visibilitychange', voltou);
    };
  }, [recarregar, aoVoltar]);

  return { dados, erro, carregando, recarregar };
}

export function Erro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <p className="erro" role="alert">
      {mensagem}
    </p>
  );
}

/** Botão que abre o Google Agenda já preenchido e marca a tarefa como "na agenda". */
export function BotaoAgenda({ tarefa, aoMudar }: { tarefa: Tarefa; aoMudar: () => void | Promise<void> }) {
  if (!tarefa.linkAgenda) return null;
  if (tarefa.naAgenda) return <span className="ag">na agenda</span>;
  return (
    <a
      className="btn2"
      href={tarefa.linkAgenda}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        api.atualizarTarefa(tarefa.id, { naAgenda: true }).then(aoMudar).catch(() => undefined);
      }}
    >
      Adicionar à agenda
    </a>
  );
}

/** A que uma Tarefa está ligada, como valor de um campo: "o:12" (Oportunidade), "f:Jogos" (só a frente) ou "". */
export function ligacaoDe(tarefa: Pick<Tarefa, 'oportunidadeId' | 'frente'>): string {
  if (tarefa.oportunidadeId !== null) return `o:${tarefa.oportunidadeId}`;
  return tarefa.frente ? `f:${tarefa.frente}` : '';
}

export function lerLigacao(ligacao: string): { oportunidadeId: number | null; frente: Frente | null } {
  const [tipo, valor] = ligacao.split(':');
  return { oportunidadeId: tipo === 'o' ? Number(valor) : null, frente: tipo === 'f' ? (valor as Frente) : null };
}

/** O campo "Ligada a": uma Oportunidade, só uma frente ou nada. */
export function CampoLigacao({
  valor,
  aoMudar,
  oportunidades,
  atual,
}: {
  valor: string;
  aoMudar: (valor: string) => void;
  oportunidades: OportunidadeComPasso[];
  /** A Oportunidade já ligada, para ela aparecer mesmo que não esteja na lista (ainda carregando, ou perdida). */
  atual?: { valor: string; rotulo: string };
}) {
  const faltaAAtual = atual !== undefined && !oportunidades.some((o) => `o:${o.id}` === atual.valor);
  return (
    <label className="campo">
      Ligada a
      <select value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">Nada</option>
        <optgroup label="Oportunidade">
          {faltaAAtual && <option value={atual.valor}>{atual.rotulo}</option>}
          {oportunidades.map((o) => (
            <option key={o.id} value={`o:${o.id}`}>
              {o.frente} · {o.nome}
            </option>
          ))}
        </optgroup>
        <optgroup label="Só a frente">
          {FRENTES.map((f) => (
            <option key={f} value={`f:${f}`}>
              {f}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

export interface CamposDaTarefa {
  titulo: string;
  dia: string;
  hora: string;
  ligacao: string;
}

const camposDe = (tarefa: Tarefa): CamposDaTarefa => ({ titulo: tarefa.titulo, dia: tarefa.dia ?? '', hora: tarefa.hora ?? '', ligacao: ligacaoDe(tarefa) });

/** Só o que foi mexido vai para o painel: o resto da Tarefa fica como está. */
function mudancaDe(tarefa: Tarefa, campos: CamposDaTarefa): MudancaTarefa {
  const mudanca: MudancaTarefa = {};
  const dia = campos.dia || null;
  const hora = dia ? campos.hora || null : null;
  if (campos.titulo.trim() !== tarefa.titulo) mudanca.titulo = campos.titulo;
  if (dia !== tarefa.dia) mudanca.dia = dia;
  if (hora !== tarefa.hora) mudanca.hora = hora;
  if (campos.ligacao !== ligacaoDe(tarefa)) Object.assign(mudanca, lerLigacao(campos.ligacao));
  return mudanca;
}

/** Edita o título, o dia, a hora e a ligação de uma Tarefa. Quem grava é a linha que abriu o diálogo. */
function DialogoTarefa({
  tarefa,
  inicio,
  erro,
  aoFechar,
  aoSalvar,
}: {
  tarefa: Tarefa;
  /** O que mostrar nos campos. Sem isso, vale o que a Tarefa tem hoje. */
  inicio?: CamposDaTarefa;
  erro?: string;
  aoFechar: () => void;
  aoSalvar: (campos: CamposDaTarefa) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [campos, setCampos] = useState<CamposDaTarefa>(inicio ?? camposDe(tarefa));
  const { dados: oportunidades } = useCarregar(() => api.oportunidades(), [], { aoVoltar: false });

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const salvar = (e: FormEvent) => {
    e.preventDefault();
    aoSalvar(campos);
  };

  return (
    <dialog ref={ref} onClose={aoFechar} aria-labelledby={`titulo-tarefa-${tarefa.id}`}>
      <form className="dialogo" onSubmit={salvar}>
        <h2 id={`titulo-tarefa-${tarefa.id}`}>Tarefa</h2>
        <div className="dialogo-grade">
          <label className="campo largo">
            O que fazer
            <input type="text" required value={campos.titulo} onChange={(e) => setCampos({ ...campos, titulo: e.target.value })} autoFocus />
          </label>
          <label className="campo">
            Dia
            <input type="date" value={campos.dia} onChange={(e) => setCampos({ ...campos, dia: e.target.value })} />
          </label>
          <label className="campo">
            Hora
            <input type="time" value={campos.dia ? campos.hora : ''} disabled={!campos.dia} onChange={(e) => setCampos({ ...campos, hora: e.target.value })} />
          </label>
          <div className="largo">
            <CampoLigacao
              valor={campos.ligacao}
              aoMudar={(ligacao) => setCampos({ ...campos, ligacao })}
              oportunidades={oportunidades ?? []}
              atual={
                tarefa.oportunidadeId !== null
                  ? { valor: `o:${tarefa.oportunidadeId}`, rotulo: [tarefa.frente, tarefa.oportunidadeNome].filter(Boolean).join(' · ') }
                  : undefined
              }
            />
          </div>
        </div>
        <Erro mensagem={erro ?? null} />
        <div className="acoes">
          <button type="button" className="btn2" onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className="btn corte-p">
            Salvar
          </button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * Uma linha de tarefa com o losango de concluir. A linha muda na hora do clique e a
 * gravação segue por trás; se a gravação falhar, a linha volta ao que era e mostra o motivo.
 */
export function LinhaTarefa({
  tarefa,
  hoje,
  aoMudar,
  apagar = false,
}: {
  tarefa: Tarefa;
  hoje: string;
  aoMudar: () => void | Promise<void>;
  apagar?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  /** O que a linha mostra enquanto a mudança ainda está indo para o repositório de dados. */
  const [pendente, setPendente] = useState<Partial<Pick<Tarefa, 'titulo' | 'dia' | 'hora' | 'feitaEm'>> | null>(null);
  const [apagada, setApagada] = useState(false);
  const [editando, setEditando] = useState<{ inicio?: CamposDaTarefa; erro?: string } | null>(null);

  const vista = { ...tarefa, ...pendente };
  const feita = vista.feitaEm !== null;
  const atrasada = !feita && vista.dia !== null && vista.dia < hoje;
  const ligacao = [tarefa.frente ?? 'Sem frente', tarefa.oportunidadeNome, tarefa.repositorio].filter(Boolean).join(' · ');

  /** Mostra a mudança, grava e busca os dados de novo. Devolve o motivo se a gravação falhar. */
  const gravar = async (visao: NonNullable<typeof pendente>, mudanca: MudancaTarefa): Promise<string | null> => {
    setPendente(visao);
    setErro(null);
    try {
      await api.atualizarTarefa(tarefa.id, mudanca);
      await aoMudar();
      return null;
    } catch (falha) {
      return (falha as Error).message;
    } finally {
      setPendente(null);
    }
  };

  const alternar = async () => {
    // Um clique de cada vez: o segundo espera a gravação do primeiro terminar.
    if (pendente) return;
    const falha = await gravar({ feitaEm: feita ? null : new Date().toISOString() }, { feita: !feita });
    if (falha) setErro(falha);
  };

  const salvarEdicao = async (campos: CamposDaTarefa) => {
    setEditando(null);
    const mudanca = mudancaDe(tarefa, campos);
    if (Object.keys(mudanca).length === 0) return;
    const dia = campos.dia || null;
    const falha = await gravar({ titulo: campos.titulo.trim() || tarefa.titulo, dia, hora: dia ? campos.hora || null : null }, mudanca);
    // Não gravou: o diálogo volta com o que foi digitado, para não precisar escrever de novo.
    if (falha) setEditando({ inicio: campos, erro: falha });
  };

  const remover = async () => {
    if (!window.confirm(`Apagar a tarefa "${tarefa.titulo}"?`)) return;
    setApagada(true);
    setErro(null);
    try {
      await api.apagarTarefa(tarefa.id);
      await aoMudar();
    } catch (falha) {
      setApagada(false);
      setErro((falha as Error).message);
    }
  };

  if (apagada) return null;

  return (
    <div className="obj">
      <input type="checkbox" className="losango" checked={feita} onChange={alternar} aria-label={feita ? `Reabrir: ${vista.titulo}` : `Concluir: ${vista.titulo}`} />
      <div className="obj-texto">
        <p className={`obj-titulo${feita ? ' feita' : ''}`}>{vista.titulo}</p>
        <p className="obj-sub">{ligacao}</p>
        <Erro mensagem={erro} />
      </div>
      <div className="obj-fim">
        {feita ? (
          <span className="obj-hora sem">{quandoFoiFeita(vista.feitaEm!, hoje)}</span>
        ) : (
          <span className={`obj-hora${vista.dia ? '' : ' sem'}${atrasada ? ' atrasada' : ''}`}>{quando(vista, hoje)}</span>
        )}
        {!feita && !pendente && <BotaoAgenda tarefa={tarefa} aoMudar={aoMudar} />}
        {!feita && (
          <button type="button" className="btn-texto" onClick={() => setEditando({})} disabled={pendente !== null}>
            editar
          </button>
        )}
        {apagar && (
          <button type="button" className="btn-texto" onClick={remover} disabled={pendente !== null}>
            apagar
          </button>
        )}
      </div>
      {editando && <DialogoTarefa tarefa={tarefa} inicio={editando.inicio} erro={editando.erro} aoFechar={() => setEditando(null)} aoSalvar={salvarEdicao} />}
    </div>
  );
}
