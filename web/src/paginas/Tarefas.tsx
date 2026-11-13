import { useRef, useState, type FormEvent } from 'react';
import { FRENTES, type Frente } from '../../../src/dominio/tipos.ts';
import { Topo } from '../App.tsx';
import { api } from '../api.ts';
import { CampoLigacao, Erro, LinhaTarefa, lerLigacao, useCarregar, type CamposDaTarefa } from '../componentes.tsx';
import { quando } from '../formato.ts';

type Filtro = Frente | 'sem-frente' | undefined;

const CAMPOS_VAZIOS: CamposDaTarefa = { titulo: '', dia: '', hora: '', ligacao: '' };

/** Uma tarefa que a tela já mostra enquanto ela ainda está sendo gravada. */
interface TarefaEnviando {
  chave: number;
  titulo: string;
  dia: string | null;
  hora: string | null;
}

export function PaginaTarefas({ parametros }: { parametros: URLSearchParams }) {
  const [filtro, setFiltro] = useState<Filtro>(undefined);
  const { dados, erro, recarregar } = useCarregar(
    () => Promise.all([api.tarefas('abertas', filtro), api.tarefas('feitas', filtro), api.oportunidades(), api.hoje()]),
    [filtro],
  );
  const [abertas, feitas, oportunidades, hoje] = dados ?? [[], [], [], null];

  const ligacaoInicial = parametros.get('oportunidade') ? `o:${parametros.get('oportunidade')}` : '';
  const [campos, setCampos] = useState<CamposDaTarefa>({ ...CAMPOS_VAZIOS, ligacao: ligacaoInicial });
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<TarefaEnviando[]>([]);
  const proximaChave = useRef(1);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const digitado = campos;
    const titulo = digitado.titulo.trim();
    if (!titulo) {
      setErroForm('A tarefa precisa de um título.');
      return;
    }
    const dia = digitado.dia || null;
    const hora = dia ? digitado.hora || null : null;
    const chave = proximaChave.current++;
    // A tarefa aparece na lista na hora e o formulário fica livre para a próxima; a gravação segue por trás.
    setEnviando((lista) => [...lista, { chave, titulo, dia, hora }]);
    setCampos(CAMPOS_VAZIOS);
    setErroForm(null);
    if (parametros.get('oportunidade')) window.location.hash = '#/tarefas';
    try {
      await api.criarTarefa({ titulo, dia, hora, ...lerLigacao(digitado.ligacao) });
      await recarregar();
    } catch (falha) {
      // Não gravou: o que foi digitado volta para o formulário, a não ser que outra tarefa já esteja sendo escrita.
      setCampos((agora) => (agora.titulo ? agora : digitado));
      setErroForm(`Não salvou "${titulo}": ${(falha as Error).message}`);
    } finally {
      setEnviando((lista) => lista.filter((item) => item.chave !== chave));
    }
  };

  const oportunidadeEscolhida = oportunidades.find((o) => `o:${o.id}` === campos.ligacao);

  return (
    <>
      <Topo titulo="Tarefas" sub="toda tarefa com hora vira compromisso no Google Agenda" />
      <Erro mensagem={erro} />

      <form className="p corte form-tarefa" onSubmit={criar}>
        <label className="campo">
          O que fazer
          <input
            type="text"
            required
            value={campos.titulo}
            autoFocus={Boolean(ligacaoInicial)}
            placeholder={oportunidadeEscolhida ? `Próximo passo de ${oportunidadeEscolhida.nome}` : 'Ex.: mandar a demonstração'}
            onChange={(e) => setCampos({ ...campos, titulo: e.target.value })}
          />
        </label>
        <label className="campo">
          Dia
          <input type="date" value={campos.dia} onChange={(e) => setCampos({ ...campos, dia: e.target.value })} />
        </label>
        <label className="campo">
          Hora
          <input type="time" value={campos.dia ? campos.hora : ''} disabled={!campos.dia} onChange={(e) => setCampos({ ...campos, hora: e.target.value })} />
        </label>
        <CampoLigacao valor={campos.ligacao} aoMudar={(ligacao) => setCampos({ ...campos, ligacao })} oportunidades={oportunidades} />
        <button type="submit" className="btn corte-p" style={{ padding: '12px 20px' }}>
          Criar
        </button>
        {erroForm && (
          <div style={{ gridColumn: '1 / -1' }}>
            <Erro mensagem={erroForm} />
          </div>
        )}
      </form>

      <div role="group" aria-label="Filtrar por frente" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {([undefined, ...FRENTES, 'sem-frente'] as Filtro[]).map((f) => (
          <button key={f ?? 'todas'} type="button" className="filtro corte-p" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
            {f === undefined ? 'Todas' : f === 'sem-frente' ? 'Sem frente' : f}
          </button>
        ))}
      </div>

      <section className="p corte" aria-labelledby="t-abertas">
        <h2 className="rot" id="t-abertas">
          Abertas · {abertas.length + enviando.length}
        </h2>
        {abertas.length + enviando.length === 0 && <p className="vazio">{dados === null && !erro ? 'Carregando.' : 'Nenhuma tarefa aberta aqui.'}</p>}
        {hoje &&
          enviando.map((item) => (
            <div key={`enviando-${item.chave}`} className="obj enviando" aria-busy="true">
              <span className="losango" aria-hidden="true" />
              <div className="obj-texto">
                <p className="obj-titulo">{item.titulo}</p>
                <p className="obj-sub">salvando</p>
              </div>
              <span className={`obj-hora${item.dia ? '' : ' sem'}`}>{quando(item, hoje.dia)}</span>
            </div>
          ))}
        {hoje && abertas.map((t) => <LinhaTarefa key={t.id} tarefa={t} hoje={hoje.dia} aoMudar={recarregar} apagar />)}
      </section>

      <details className="p corte">
        <summary className="rot" style={{ cursor: 'pointer', margin: 0 }}>
          Feitas · {feitas.length}
        </summary>
        {hoje && feitas.slice(0, 50).map((t) => <LinhaTarefa key={t.id} tarefa={t} hoje={hoje.dia} aoMudar={recarregar} />)}
      </details>
    </>
  );
}
