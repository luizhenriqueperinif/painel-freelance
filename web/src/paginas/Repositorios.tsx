import { useState } from 'react';
import { FRENTES, type Frente, type Repositorio } from '../../../src/dominio/tipos.ts';
import { Topo } from '../App.tsx';
import { api } from '../api.ts';
import { Erro, useCarregar } from '../componentes.tsx';
import { tempoRelativo } from '../formato.ts';

export function PaginaRepositorios() {
  // Relê as pastas toda vez que a tela abre e pelo botão "Atualizar". Nada roda em segundo plano,
  // nem quando a janela volta ao foco: ler todas as pastas é pesado.
  const { dados, erro, carregando, recarregar } = useCarregar(() => api.repositorios(), [], { aoVoltar: false });
  const repositorios = dados?.repositorios ?? [];
  const inativos = repositorios.filter((r) => r.inativo).length;
  const semGit = repositorios.filter((r) => r.existe && !r.temGit).length;
  const comSegredo = repositorios.filter((r) => r.segredosNoGit.length > 0);

  return (
    <>
      <Topo titulo="Repositórios" sub="só leitura // nada aqui altera as pastas" />
      <Erro mensagem={erro} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span className="pilula">{repositorios.length} repositórios</span>
        <span className="pilula" style={{ color: 'var(--terciaria)' }}>
          {inativos} inativos (+30 dias)
        </span>
        <span className="pilula">{semGit} sem git</span>
        {comSegredo.length > 0 && (
          <span className="pilula" style={{ color: 'var(--alerta-texto)' }}>
            {comSegredo.length} com arquivo de segredo no git
          </span>
        )}
        <span className="mono suave" style={{ marginLeft: 'auto', fontSize: 13 }}>
          {carregando ? 'lendo as pastas' : dados ? `lido às ${new Date(dados.lidoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
        <button type="button" className="btn corte-p" onClick={() => void recarregar()} disabled={carregando}>
          Atualizar
        </button>
      </div>

      {comSegredo.length > 0 && (
        <section className="p corte alerta" aria-labelledby="t-segredos">
          <h2 className="rot" id="t-segredos">
            Alerta · arquivos que podem ter senha estão indo para o git
          </h2>
          {comSegredo.map((r) => (
            <p key={r.nome} style={{ margin: '6px 0' }}>
              <b>{r.nome}</b>: <span className="mono">{r.segredosNoGit.join(', ')}</span>
            </p>
          ))}
          <p className="suave" style={{ margin: '10px 0 0', fontSize: 13 }}>
            O painel só vê o nome dos arquivos; o conteúdo nunca é aberto. Confira se o arquivo deveria estar no .gitignore.
          </p>
        </section>
      )}

      <section className="p corte tabela-rolagem">
        <table>
          <thead>
            <tr>
              <th>Repositório</th>
              <th>Tecnologia</th>
              <th>Último commit</th>
              <th>Mudanças</th>
              <th>Frente</th>
              <th>
                <span className="sr">Link</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {repositorios.map((r) => (
              <Linha key={r.nome} repositorio={r} />
            ))}
          </tbody>
        </table>
        {!carregando && repositorios.length === 0 && !erro && <p className="vazio">Nenhum repositório configurado.</p>}
      </section>
    </>
  );
}

function Linha({ repositorio: r }: { repositorio: Repositorio }) {
  const [frente, setFrente] = useState<Frente | null>(r.frente);
  const [erro, setErro] = useState<string | null>(null);

  const escolher = (valor: string) => {
    const nova = valor === '' ? null : (valor as Frente);
    setFrente(nova);
    api.definirFrenteDoRepositorio(r.nome, nova).catch((e: Error) => setErro(e.message));
  };

  return (
    <tr>
      <td style={{ fontWeight: 600 }}>
        {r.nome}
        {r.descricao && <span className="s">{r.descricao}</span>}
        {r.erro && <span className="s" style={{ color: 'var(--alerta-texto)' }}>{r.erro}</span>}
        {erro && <span className="s" style={{ color: 'var(--alerta-texto)' }}>{erro}</span>}
      </td>
      <td className="mono" style={{ fontSize: 13 }}>
        {r.tecnologias.join(', ') || '—'}
      </td>
      <td className="mono" style={{ fontSize: 13 }}>
        {!r.temGit && r.existe ? (
          <span className="chip neutro">sem git</span>
        ) : r.ultimoCommit ? (
          <>
            {tempoRelativo(r.ultimoCommit)}
            {r.inativo && (
              <span className="chip inativo" style={{ marginLeft: 8 }}>
                inativo
              </span>
            )}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="mono" style={{ fontSize: 13 }}>
        {r.temGit ? (r.mudancasNaoSalvas > 0 ? `${r.mudancasNaoSalvas} não salvas` : 'em dia') : '—'}
      </td>
      <td style={{ width: 170 }}>
        <select value={frente ?? ''} onChange={(e) => escolher(e.target.value)} aria-label={`Frente de ${r.nome}`}>
          <option value="">Nenhuma</option>
          {FRENTES.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </td>
      <td>
        {r.github && (
          <a href={r.github} target="_blank" rel="noreferrer">
            GitHub
          </a>
        )}
      </td>
    </tr>
  );
}
