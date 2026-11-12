import { useState, type FormEvent } from 'react';
import { FRENTES, type Frente } from '../../../src/dominio/tipos.ts';
import { Topo } from '../App.tsx';
import { api } from '../api.ts';
import { Erro, LinhaTarefa, useCarregar } from '../componentes.tsx';

type Filtro = Frente | 'sem-frente' | undefined;

export function PaginaTarefas({ parametros }: { parametros: URLSearchParams }) {
  const [filtro, setFiltro] = useState<Filtro>(undefined);
  const { dados, erro, recarregar } = useCarregar(
    () => Promise.all([api.tarefas('abertas', filtro), api.tarefas('feitas', filtro), api.oportunidades(), api.hoje()]),
    [filtro],
  );
  const [abertas, feitas, oportunidades, hoje] = dados ?? [[], [], [], null];

  const ligacaoInicial = parametros.get('oportunidade') ? `o:${parametros.get('oportunidade')}` : '';
  const [campos, setCampos] = useState({ titulo: '', dia: '', hora: '', ligacao: ligacaoInicial });
  const [erroForm, setErroForm] = useState<string | null>(null);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const [tipo, valor] = campos.ligacao.split(':');
    try {
      await api.criarTarefa({
        titulo: campos.titulo,
        dia: campos.dia || null,
        hora: campos.hora || null,
        oportunidadeId: tipo === 'o' ? Number(valor) : null,
        frente: tipo === 'f' ? (valor as Frente) : null,
      });
      setCampos({ titulo: '', dia: '', hora: '', ligacao: '' });
      setErroForm(null);
      if (parametros.get('oportunidade')) window.location.hash = '#/tarefas';
      void recarregar();
    } catch (falha) {
      setErroForm((falha as Error).message);
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
          <input type="time" value={campos.hora} disabled={!campos.dia} onChange={(e) => setCampos({ ...campos, hora: e.target.value })} />
        </label>
        <label className="campo">
          Ligada a
          <select value={campos.ligacao} onChange={(e) => setCampos({ ...campos, ligacao: e.target.value })}>
            <option value="">Nada</option>
            <optgroup label="Oportunidade">
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
          Abertas · {abertas.length}
        </h2>
        {abertas.length === 0 && <p className="vazio">Nenhuma tarefa aberta aqui.</p>}
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
