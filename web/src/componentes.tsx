import { useCallback, useEffect, useState } from 'react';
import type { Tarefa } from '../../src/dominio/tipos.ts';
import { api } from './api.ts';
import { quando } from './formato.ts';

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
export function BotaoAgenda({ tarefa, aoMudar }: { tarefa: Tarefa; aoMudar: () => void }) {
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

/** Uma linha de tarefa com o losango de concluir. */
export function LinhaTarefa({
  tarefa,
  hoje,
  aoMudar,
  apagar = false,
}: {
  tarefa: Tarefa;
  hoje: string;
  aoMudar: () => void;
  apagar?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const feita = tarefa.feitaEm !== null;
  const atrasada = !feita && tarefa.dia !== null && tarefa.dia < hoje;
  const ligacao = [tarefa.frente ?? 'Sem frente', tarefa.oportunidadeNome, tarefa.repositorio].filter(Boolean).join(' · ');

  const alternar = () =>
    api
      .atualizarTarefa(tarefa.id, { feita: !feita })
      .then(aoMudar)
      .catch((e: Error) => setErro(e.message));

  const remover = () => {
    if (!window.confirm(`Apagar a tarefa "${tarefa.titulo}"?`)) return;
    api
      .apagarTarefa(tarefa.id)
      .then(aoMudar)
      .catch((e: Error) => setErro(e.message));
  };

  return (
    <div className="obj">
      <input type="checkbox" className="losango" checked={feita} onChange={alternar} aria-label={feita ? `Reabrir: ${tarefa.titulo}` : `Concluir: ${tarefa.titulo}`} />
      <div className="obj-texto">
        <p className={`obj-titulo${feita ? ' feita' : ''}`}>{tarefa.titulo}</p>
        <p className="obj-sub">{ligacao}</p>
        <Erro mensagem={erro} />
      </div>
      {!feita && (
        <span className={`obj-hora${tarefa.dia ? '' : ' sem'}${atrasada ? ' atrasada' : ''}`}>{quando(tarefa, hoje)}</span>
      )}
      {!feita && <BotaoAgenda tarefa={tarefa} aoMudar={aoMudar} />}
      {apagar && (
        <button type="button" className="btn-texto" onClick={remover}>
          apagar
        </button>
      )}
    </div>
  );
}
