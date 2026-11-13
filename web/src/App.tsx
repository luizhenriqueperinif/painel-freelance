import { useCallback, useEffect, useRef, useState } from 'react';
import { diaDeHoje, horaEmBrasilia } from '../../src/dominio/datas.ts';
import { TEMAS, type Tema } from '../../src/dominio/tipos.ts';
import { api } from './api.ts';
import { pedirAtualizacao } from './componentes.tsx';
import { SEM_COPIA, useDadosDe } from './conexao.ts';
import { quando } from './formato.ts';
import { PaginaHoje } from './paginas/Hoje.tsx';
import { PaginaFrentes } from './paginas/Frentes.tsx';
import { PaginaRepositorios } from './paginas/Repositorios.tsx';
import { PaginaTarefas } from './paginas/Tarefas.tsx';

export type NomeDaPagina = 'hoje' | 'frentes' | 'repositorios' | 'tarefas';

const PAGINAS: { nome: NomeDaPagina; rotulo: string }[] = [
  { nome: 'hoje', rotulo: 'Hoje' },
  { nome: 'frentes', rotulo: 'Frentes' },
  { nome: 'repositorios', rotulo: 'Repositórios' },
  { nome: 'tarefas', rotulo: 'Tarefas' },
];

const COR_DO_TEMA: Record<Tema, string> = {
  coral: '#ff5a4e',
  azul: '#3d8bff',
  esmeralda: '#1fd18a',
  ciano: '#2fe6ff',
  'azul-claro': '#6fb6ff',
};

const NOME_DO_TEMA: Record<Tema, string> = {
  coral: 'Coral e verde-água',
  azul: 'Azul e azul-gelo',
  esmeralda: 'Esmeralda e âmbar',
  ciano: 'Ciano',
  'azul-claro': 'Azul-claro',
};

export interface Rota {
  pagina: NomeDaPagina;
  parametros: URLSearchParams;
}

function lerRota(): Rota {
  const [caminho = '', busca = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
  const pagina = PAGINAS.some((p) => p.nome === caminho) ? (caminho as NomeDaPagina) : 'hoje';
  return { pagina, parametros: new URLSearchParams(busca) };
}

export function irPara(pagina: NomeDaPagina, parametros?: Record<string, string>) {
  const busca = parametros ? `?${new URLSearchParams(parametros).toString()}` : '';
  window.location.hash = `#/${pagina}${busca}`;
}

function aplicarTema(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  try {
    localStorage.setItem('tema', tema);
  } catch {
    /* sem armazenamento local: o servidor guarda o tema */
  }
}

export function Topo({ titulo, sub }: { titulo: string; sub: string }) {
  const rota = lerRota();
  const [tema, setTema] = useState<Tema>((document.documentElement.dataset.tema as Tema) ?? 'coral');

  const escolher = (novo: Tema) => {
    setTema(novo);
    aplicarTema(novo);
    api.definirTema(novo).catch(() => undefined);
  };

  return (
    <header className="topo">
      <div>
        <p className="topo-sub mono">{sub}</p>
        <h1 className="topo-titulo">
          {titulo}
          {rota.pagina === 'hoje' && <span> LH</span>}
        </h1>
      </div>
      <nav className="menu" aria-label="Menu principal">
        {PAGINAS.map((p) => (
          <a key={p.nome} className="corte-p" href={`#/${p.nome}`} aria-current={rota.pagina === p.nome ? 'page' : undefined}>
            {p.rotulo}
          </a>
        ))}
      </nav>
      <div className="temas" role="group" aria-label="Tema de cores">
        {TEMAS.map((t) => (
          <button
            key={t}
            type="button"
            className="tema"
            style={{ background: COR_DO_TEMA[t] }}
            aria-pressed={tema === t}
            aria-label={`Tema ${NOME_DO_TEMA[t]}`}
            title={NOME_DO_TEMA[t]}
            onClick={() => escolher(t)}
          />
        ))}
      </div>
      <button type="button" className="btn-texto" onClick={pedirAtualizacao}>
        atualizar
      </button>
    </header>
  );
}

const PAUSA_ENTRE_TENTATIVAS_MS = 12_000;

/** Avisa que os dados na tela são uma leitura antiga e procura a conexão de novo, sozinho. */
function AvisoSemConexao() {
  const dadosDe = useDadosDe();
  const semConexao = dadosDe !== null;
  const estavaSemConexao = useRef(false);

  useEffect(() => {
    // A conexão voltou: a tela aberta busca os dados de agora.
    if (estavaSemConexao.current && !semConexao) pedirAtualizacao();
    estavaSemConexao.current = semConexao;
    if (!semConexao) return;
    // Um pedido leve basta para o servidor tentar o GitHub outra vez e contar como foi.
    const repetir = window.setInterval(() => void api.tema().catch(() => undefined), PAUSA_ENTRE_TENTATIVAS_MS);
    return () => window.clearInterval(repetir);
  }, [semConexao]);

  if (dadosDe === null) return null;
  const lidos = dadosDe === SEM_COPIA ? null : new Date(dadosDe);
  return (
    <p className="aviso" role="status">
      Sem conexão com o GitHub.{' '}
      {lidos && `Mostrando os dados de ${quando({ dia: diaDeHoje(lidos), hora: horaEmBrasilia(lidos) }, diaDeHoje())}. `}
      Não dá para gravar até a conexão voltar; o painel tenta de novo sozinho.
    </p>
  );
}

export function App() {
  const [rota, setRota] = useState<Rota>(lerRota);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem('tema') as Tema | null;
      if (salvo && TEMAS.includes(salvo)) aplicarTema(salvo);
    } catch {
      /* ignora */
    }
    api.tema().then(({ tema }) => aplicarTema(tema)).catch(() => undefined);
    const mudou = () => setRota(lerRota());
    window.addEventListener('hashchange', mudou);
    return () => window.removeEventListener('hashchange', mudou);
  }, []);

  const pagina = useCallback(() => {
    switch (rota.pagina) {
      case 'frentes':
        return <PaginaFrentes />;
      case 'repositorios':
        return <PaginaRepositorios />;
      case 'tarefas':
        return <PaginaTarefas parametros={rota.parametros} />;
      default:
        return <PaginaHoje />;
    }
  }, [rota]);

  return (
    <div className="pagina">
      <AvisoSemConexao />
      {pagina()}
    </div>
  );
}
