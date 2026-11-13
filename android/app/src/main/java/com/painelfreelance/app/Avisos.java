package com.painelfreelance.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Os avisos das tarefas com hora: um 15 minutos antes e outro na hora.
 * Tudo sai da última leitura do arquivo de dados. Toda leitura nova refaz a agenda inteira:
 * tarefa concluída, apagada ou com outro horário perde os avisos antigos.
 */
final class Avisos {
    static final String CANAL = "tarefas";
    static final long ANTECEDENCIA_MS = 15 * 60_000L;
    /** Só agenda o que cai nos próximos 30 dias: o Android limita quantos alarmes um app pode ter. */
    private static final long JANELA_MS = 30L * 24 * 60 * 60_000L;
    private static final int LIMITE = 200;
    /** As tarefas são marcadas no horário de Brasília, como no resto do painel. */
    private static final TimeZone FUSO = TimeZone.getTimeZone("America/Sao_Paulo");

    static final String EXTRA_TAREFA = "tarefa";
    static final String EXTRA_ANTES = "antes";
    static final String EXTRA_INICIO = "inicio";

    static final class Aviso {
        final int tarefa;
        final boolean antes;
        final long inicio;
        final String titulo;
        final String hora;
        final String ligacao;

        Aviso(int tarefa, boolean antes, long inicio, String titulo, String hora, String ligacao) {
            this.tarefa = tarefa;
            this.antes = antes;
            this.inicio = inicio;
            this.titulo = titulo;
            this.hora = hora;
            this.ligacao = ligacao;
        }

        long quando() {
            return antes ? inicio - ANTECEDENCIA_MS : inicio;
        }

        /** O mesmo código para o mesmo aviso: é por ele que o Android acha o alarme para trocar ou cancelar. */
        int codigo() {
            return tarefa * 2 + (antes ? 0 : 1);
        }
    }

    private Avisos() {}

    private static String texto(JSONObject objeto, String campo) {
        return objeto.isNull(campo) ? null : objeto.optString(campo, null);
    }

    /** "2026-11-17" e "09:00" no horário de Brasília, em milissegundos. -1 se não der para ler. */
    static long instante(String dia, String hora) {
        try {
            String[] d = dia.split("-");
            String[] h = hora.split(":");
            Calendar calendario = Calendar.getInstance(FUSO);
            calendario.clear();
            calendario.set(Integer.parseInt(d[0]), Integer.parseInt(d[1]) - 1, Integer.parseInt(d[2]), Integer.parseInt(h[0]), Integer.parseInt(h[1]), 0);
            return calendario.getTimeInMillis();
        } catch (RuntimeException erro) {
            return -1;
        }
    }

    /** Todos os avisos que a leitura pede, do mais próximo para o mais distante. */
    static List<Aviso> calcular(String texto, long agora) throws JSONException {
        List<Aviso> avisos = new ArrayList<>();
        if (texto == null) return avisos;
        JSONObject dados = new JSONObject(texto);

        Map<Integer, String> oportunidades = new HashMap<>();
        JSONArray listaDeOportunidades = dados.optJSONArray("oportunidades");
        for (int i = 0; listaDeOportunidades != null && i < listaDeOportunidades.length(); i++) {
            JSONObject o = listaDeOportunidades.getJSONObject(i);
            oportunidades.put(o.getInt("id"), o.optString("nome", ""));
        }

        JSONArray tarefas = dados.optJSONArray("tarefas");
        for (int i = 0; tarefas != null && i < tarefas.length(); i++) {
            JSONObject t = tarefas.getJSONObject(i);
            if (!t.isNull("feitaEm")) continue;
            String dia = texto(t, "dia");
            String hora = texto(t, "hora");
            if (dia == null || hora == null) continue;
            long inicio = instante(dia, hora);
            if (inicio < 0) continue;
            String ligacao = t.isNull("oportunidadeId") ? texto(t, "frente") : oportunidades.get(t.getInt("oportunidadeId"));
            for (boolean antes : new boolean[] {true, false}) {
                Aviso aviso = new Aviso(t.getInt("id"), antes, inicio, t.optString("titulo", "Tarefa"), hora, ligacao);
                if (aviso.quando() > agora && aviso.quando() <= agora + JANELA_MS) avisos.add(aviso);
            }
        }
        Collections.sort(avisos, (a, b) -> Long.compare(a.quando(), b.quando()));
        return avisos.size() > LIMITE ? new ArrayList<>(avisos.subList(0, LIMITE)) : avisos;
    }

    private static PendingIntent intencao(Context contexto, Aviso aviso) {
        Intent intent = new Intent(contexto, AlarmeReceiver.class)
            .putExtra(EXTRA_TAREFA, aviso.tarefa)
            .putExtra(EXTRA_ANTES, aviso.antes)
            .putExtra(EXTRA_INICIO, aviso.inicio);
        return PendingIntent.getBroadcast(contexto, aviso.codigo(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean podeAvisarNaHoraCerta(Context contexto) {
        AlarmManager alarmes = contexto.getSystemService(AlarmManager.class);
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmes.canScheduleExactAlarms();
    }

    /** Refaz a agenda de avisos a partir de uma leitura do arquivo de dados (null cancela tudo). */
    static synchronized int agendar(Context contexto, String texto) {
        List<Aviso> avisos;
        try {
            avisos = calcular(texto, System.currentTimeMillis());
        } catch (JSONException erro) {
            // Arquivo que não dá para ler: os avisos que já estavam marcados continuam.
            return -1;
        }
        AlarmManager alarmes = contexto.getSystemService(AlarmManager.class);
        boolean exato = podeAvisarNaHoraCerta(contexto);
        SharedPreferences guardados = Guardados.de(contexto);
        Set<String> antigos = new HashSet<>(guardados.getStringSet(Guardados.AGENDADOS, Collections.emptySet()));
        Set<String> novos = new HashSet<>();

        for (Aviso aviso : avisos) {
            PendingIntent intencao = intencao(contexto, aviso);
            if (exato) alarmes.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, aviso.quando(), intencao);
            else alarmes.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, aviso.quando(), intencao);
            novos.add(String.valueOf(aviso.codigo()));
        }
        for (String codigo : antigos) {
            if (novos.contains(codigo)) continue;
            PendingIntent velho = PendingIntent.getBroadcast(
                contexto, Integer.parseInt(codigo), new Intent(contexto, AlarmeReceiver.class), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (velho != null) {
                alarmes.cancel(velho);
                velho.cancel();
            }
        }
        guardados.edit().putStringSet(Guardados.AGENDADOS, novos).apply();
        return novos.size();
    }

    /** Confere na leitura mais recente se o aviso ainda vale: a tarefa pode ter sido concluída ou mudado de hora. */
    static Aviso aindaVale(Context contexto, int tarefa, boolean antes, long inicio) {
        try {
            for (Aviso aviso : calcular(Guardados.de(contexto).getString(Guardados.TEXTO, null), inicio - 2 * ANTECEDENCIA_MS)) {
                if (aviso.tarefa == tarefa && aviso.antes == antes && aviso.inicio == inicio) return aviso;
            }
        } catch (JSONException erro) {
            return null;
        }
        return null;
    }

    static void criarCanal(Context contexto) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Tarefas com hora", NotificationManager.IMPORTANCE_HIGH);
        canal.setDescription("Aviso 15 minutos antes e na hora de cada tarefa com hora.");
        contexto.getSystemService(NotificationManager.class).createNotificationChannel(canal);
    }

    static boolean podeNotificar(Context contexto) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(contexto, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(contexto).areNotificationsEnabled();
    }

    static void mostrar(Context contexto, Aviso aviso) {
        if (!podeNotificar(contexto)) return;
        criarCanal(contexto);
        Intent abrir = contexto.getPackageManager().getLaunchIntentForPackage(contexto.getPackageName());
        PendingIntent aoTocar = PendingIntent.getActivity(contexto, 0, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String quando = aviso.antes ? "Daqui a 15 minutos, às " + aviso.hora : "Agora, " + aviso.hora;
        String texto = aviso.ligacao == null || aviso.ligacao.isEmpty() ? quando : quando + " · " + aviso.ligacao;
        NotificationCompat.Builder notificacao = new NotificationCompat.Builder(contexto, CANAL)
            .setSmallIcon(R.drawable.ic_aviso)
            .setContentTitle(aviso.titulo)
            .setContentText(texto)
            .setWhen(aviso.inicio)
            .setShowWhen(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setContentIntent(aoTocar)
            .setAutoCancel(true);
        try {
            NotificationManagerCompat.from(contexto).notify(aviso.codigo(), notificacao.build());
        } catch (SecurityException semPermissao) {
            // A permissão foi tirada entre a conferência e o aviso: não há o que mostrar.
        }
    }
}
