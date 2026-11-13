package com.painelfreelance.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.json.JSONException;
import org.junit.Test;

public class AvisosTest {
    // 13/11/2026, 13h em Brasília (16h UTC).
    private static final long AGORA = 1_794_585_600_000L;

    private static final String DADOS = "{"
        + "\"formato\": 1,"
        + "\"oportunidades\": [{\"id\": 3, \"nome\": \"Padaria Flor do Trigo\"}],"
        + "\"tarefas\": ["
        + "  {\"id\": 1, \"titulo\": \"Ligar para a padaria\", \"dia\": \"2026-11-13\", \"hora\": \"14:00\", \"oportunidadeId\": 3, \"frente\": null, \"feitaEm\": null},"
        + "  {\"id\": 2, \"titulo\": \"Já feita\", \"dia\": \"2026-11-13\", \"hora\": \"15:00\", \"oportunidadeId\": null, \"frente\": \"Jogos\", \"feitaEm\": \"2026-11-13T12:00:00.000Z\"},"
        + "  {\"id\": 3, \"titulo\": \"Sem hora\", \"dia\": \"2026-11-13\", \"hora\": null, \"oportunidadeId\": null, \"frente\": null, \"feitaEm\": null},"
        + "  {\"id\": 4, \"titulo\": \"Daqui a 10 minutos\", \"dia\": \"2026-11-13\", \"hora\": \"13:10\", \"oportunidadeId\": null, \"frente\": \"ONGs\", \"feitaEm\": null},"
        + "  {\"id\": 5, \"titulo\": \"Ontem\", \"dia\": \"2026-11-12\", \"hora\": \"09:00\", \"oportunidadeId\": null, \"frente\": null, \"feitaEm\": null},"
        + "  {\"id\": 6, \"titulo\": \"Daqui a dois meses\", \"dia\": \"2027-01-20\", \"hora\": \"09:00\", \"oportunidadeId\": null, \"frente\": null, \"feitaEm\": null}"
        + "]}";

    @Test
    public void horarioDeBrasilia() {
        assertEquals(AGORA, Avisos.instante("2026-11-13", "13:00"));
        assertEquals(-1, Avisos.instante("13/11/2026", "13:00"));
    }

    @Test
    public void quinzeMinutosAntesENaHoraSoDoQueEstaAbertoEComHora() throws JSONException {
        List<Avisos.Aviso> avisos = Avisos.calcular(DADOS, AGORA);
        // A tarefa das 13:10 já passou do aviso de 15 minutos antes: só sobra o da hora.
        assertEquals(3, avisos.size());
        assertEquals(4, avisos.get(0).tarefa);
        assertEquals(false, avisos.get(0).antes);
        assertEquals("ONGs", avisos.get(0).ligacao);

        Avisos.Aviso antes = avisos.get(1);
        assertEquals(1, antes.tarefa);
        assertTrue(antes.antes);
        assertEquals(Avisos.instante("2026-11-13", "13:45"), antes.quando());
        assertEquals("Padaria Flor do Trigo", antes.ligacao);
        assertEquals("14:00", antes.hora);

        Avisos.Aviso naHora = avisos.get(2);
        assertEquals(Avisos.instante("2026-11-13", "14:00"), naHora.quando());
        assertNotEquals(antes.codigo(), naHora.codigo());
    }

    @Test
    public void semDadosNaoHaAviso() throws JSONException {
        assertEquals(0, Avisos.calcular(null, AGORA).size());
        assertEquals(0, Avisos.calcular("{\"formato\": 1}", AGORA).size());
    }
}
