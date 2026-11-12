import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FRENTES, SITUACOES, type Frente, type OportunidadeComPasso, type Situacao } from '../../../src/dominio/tipos.ts';
import { irPara } from '../App.tsx';
import { api } from '../api.ts';
import { Erro } from '../componentes.tsx';
import { centavosParaTexto, lerReais } from '../formato.ts';

export function DialogoOportunidade({
  oportunidade,
  aoFechar,
  aoSalvar,
}: {
  oportunidade: OportunidadeComPasso | null;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [campos, setCampos] = useState({
    nome: oportunidade?.nome ?? '',
    frente: (oportunidade?.frente ?? 'Plataformas') as Frente,
    situacao: (oportunidade?.situacao ?? 'Ideia') as Situacao,
    valor: centavosParaTexto(oportunidade?.valorCentavos ?? null),
    prazo: oportunidade?.prazo ?? '',
    link: oportunidade?.link ?? '',
    contato: oportunidade?.contato ?? '',
    observacoes: oportunidade?.observacoes ?? '',
  });

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const mudar = (campo: keyof typeof campos) => (e: { target: { value: string } }) => setCampos({ ...campos, [campo]: e.target.value });

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const dados = {
        nome: campos.nome,
        frente: campos.frente,
        situacao: campos.situacao,
        valorCentavos: lerReais(campos.valor),
        prazo: campos.prazo,
        link: campos.link,
        contato: campos.contato,
        observacoes: campos.observacoes,
      };
      if (oportunidade) await api.atualizarOportunidade(oportunidade.id, dados);
      else await api.criarOportunidade(dados);
      aoSalvar();
    } catch (falha) {
      setErro((falha as Error).message);
      setSalvando(false);
    }
  };

  return (
    <dialog ref={ref} onClose={aoFechar} aria-labelledby="titulo-dialogo">
      <form className="dialogo" onSubmit={salvar}>
        <h2 id="titulo-dialogo">{oportunidade ? 'Oportunidade' : 'Nova oportunidade'}</h2>
        <div className="dialogo-grade">
          <label className="campo largo">
            Nome
            <input type="text" required value={campos.nome} onChange={mudar('nome')} autoFocus />
          </label>
          <label className="campo">
            Frente
            <select value={campos.frente} onChange={mudar('frente')}>
              {FRENTES.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            Situação
            <select value={campos.situacao} onChange={mudar('situacao')}>
              {SITUACOES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            Valor que você recebe (R$)
            <input type="text" inputMode="decimal" placeholder="vazio se for voluntário" value={campos.valor} onChange={mudar('valor')} />
          </label>
          <label className="campo">
            Prazo
            <input type="text" placeholder="ex.: 4 dias" value={campos.prazo} onChange={mudar('prazo')} />
          </label>
          <label className="campo largo">
            Link
            <input type="url" value={campos.link} onChange={mudar('link')} />
          </label>
          <label className="campo largo">
            Contato
            <input type="text" value={campos.contato} onChange={mudar('contato')} />
          </label>
          <label className="campo largo">
            Observações
            <textarea value={campos.observacoes} onChange={mudar('observacoes')} />
          </label>
        </div>

        {oportunidade && (
          <p className="suave" style={{ margin: 0, fontSize: 14 }}>
            Próximo passo: {oportunidade.proximoPasso ? oportunidade.proximoPasso.titulo : 'nenhum.'}{' '}
            <button
              type="button"
              className="btn-texto"
              onClick={() => {
                ref.current?.close();
                irPara('tarefas', { oportunidade: String(oportunidade.id) });
              }}
            >
              criar tarefa para esta oportunidade
            </button>
          </p>
        )}

        <Erro mensagem={erro} />
        <div className="acoes">
          <button type="button" className="btn2" onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className="btn corte-p" disabled={salvando}>
            {salvando ? 'Salvando' : 'Salvar'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
