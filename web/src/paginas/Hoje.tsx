import { Topo, irPara } from '../App.tsx';
import { api } from '../api.ts';
import { BotaoAgenda, Erro, LinhaTarefa, useCarregar } from '../componentes.tsx';
import { diaPorExtenso, quando, reais } from '../formato.ts';

const COR_DA_FRENTE = ['var(--acento)', 'var(--terciaria)', 'var(--secundaria)', 'var(--suave)'];

export function PaginaHoje() {
  const { dados: hoje, erro, recarregar } = useCarregar(() => api.hoje());

  const sub = hoje ? `${diaPorExtenso(hoje.dia)} // dia ativo` : 'carregando';
  if (!hoje) {
    return (
      <>
        <Topo titulo="Painel" sub={sub} />
        <Erro mensagem={erro} />
      </>
    );
  }

  const maior = Math.max(1, ...hoje.frentes.map((f) => f.oportunidades));

  return (
    <>
      <Topo titulo="Painel" sub={sub} />
      <Erro mensagem={erro} />

      <div className="linha-flex">
        <section className="p corte" style={{ flex: '1.6 1 480px' }} aria-labelledby="t-hoje">
          <h2 className="rot" id="t-hoje">
            Objetivos de hoje
          </h2>
          {hoje.paraHoje.length === 0 && <p className="vazio">Nenhuma tarefa para hoje.</p>}
          {hoje.paraHoje.map((t) => (
            <LinhaTarefa key={t.id} tarefa={t} hoje={hoje.dia} aoMudar={recarregar} />
          ))}
          {hoje.atrasadas.length > 0 && (
            <>
              <h3 className="rot" style={{ marginTop: 18, color: 'var(--alerta-texto)' }}>
                Atrasadas · {hoje.atrasadas.length}
              </h3>
              {hoje.atrasadas.map((t) => (
                <LinhaTarefa key={t.id} tarefa={t} hoje={hoje.dia} aoMudar={recarregar} />
              ))}
            </>
          )}
          {hoje.atrasadas.length === 0 && <p className="vazio">Nenhuma tarefa atrasada.</p>}
        </section>

        <section className="p corte" style={{ flex: '1 1 320px' }} aria-labelledby="t-frentes">
          <h2 className="rot" id="t-frentes">
            Frentes
          </h2>
          {hoje.frentes.map((f, i) => (
            <a key={f.frente} href="#/frentes" className="frente-barra" style={{ color: 'inherit', textDecoration: 'none' }}>
              <span style={f.oportunidades === 0 ? { color: 'var(--suave)' } : undefined}>{f.frente}</span>
              <span className="barra">
                <i style={{ width: `${(f.oportunidades / maior) * 100}%`, background: COR_DA_FRENTE[i] }} />
              </span>
              <b>{f.oportunidades}</b>
            </a>
          ))}
          <p className="mono suave" style={{ margin: '14px 0 0', fontSize: 13 }}>
            {hoje.propostasEsperando} propostas aguardando · {hoje.avaliacoes} avaliações
          </p>
        </section>
      </div>

      <section className="p corte" aria-labelledby="t-tempo">
        <h2 className="rot" id="t-tempo">
          Próximos 7 dias
        </h2>
        {hoje.proximosDias.length === 0 ? (
          <p className="vazio">Nada marcado para os próximos dias.</p>
        ) : (
          <div className="tempo">
            <div className="tempo-itens">
              {hoje.proximosDias.map((t, i) => (
                <div key={t.id}>
                  <span className={`marco${i === 0 ? ' cheio' : ''}`} />
                  <p className="tempo-quando">{quando(t, hoje.dia)}</p>
                  <p className="tempo-titulo">{t.titulo}</p>
                  <p className="suave" style={{ margin: '2px 0 6px', fontSize: 13 }}>
                    {[t.frente, t.oportunidadeNome].filter(Boolean).join(' · ')}
                  </p>
                  <BotaoAgenda tarefa={t} aoMudar={recarregar} />
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {hoje.paradas.length > 0 && (
        <section className="p corte alerta" aria-labelledby="t-paradas">
          <h2 className="rot" id="t-paradas">
            Alerta · oportunidades sem próximo passo · {hoje.paradas.length}
          </h2>
          <div className="linha-flex">
            {hoje.paradas.map((o) => (
              <div key={o.id} className="alerta-item">
                <span style={{ flex: 1, fontWeight: 600, fontSize: 17 }}>
                  {o.nome}{' '}
                  <span className="mono" style={{ fontSize: 13, color: 'var(--alerta-suave)' }}>
                    {o.frente}
                    {o.valorCentavos !== null ? ` · ${reais(o.valorCentavos)}` : ''}
                  </span>
                </span>
                <button type="button" className="btn corte-p" onClick={() => irPara('tarefas', { oportunidade: String(o.id) })}>
                  Definir
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="suave" style={{ fontSize: 13, margin: 0 }}>
        Quer um aviso no celular todo dia?{' '}
        <a href={hoje.linkDoResumoDiario} target="_blank" rel="noreferrer">
          Criar o lembrete diário das 8h no Google Agenda
        </a>
        .
      </p>
    </>
  );
}
