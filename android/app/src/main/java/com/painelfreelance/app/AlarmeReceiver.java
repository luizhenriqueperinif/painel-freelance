package com.painelfreelance.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Chega na hora de um aviso. Só mostra se a tarefa ainda estiver aberta e com o mesmo horário. */
public class AlarmeReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context contexto, Intent intent) {
        int tarefa = intent.getIntExtra(Avisos.EXTRA_TAREFA, -1);
        boolean antes = intent.getBooleanExtra(Avisos.EXTRA_ANTES, false);
        long inicio = intent.getLongExtra(Avisos.EXTRA_INICIO, -1);
        if (tarefa < 0 || inicio < 0) return;
        Avisos.Aviso aviso = Avisos.aindaVale(contexto, tarefa, antes, inicio);
        if (aviso != null) Avisos.mostrar(contexto, aviso);
    }
}
