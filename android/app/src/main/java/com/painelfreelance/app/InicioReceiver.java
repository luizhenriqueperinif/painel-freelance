package com.painelfreelance.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Ao religar o celular ou atualizar o app, o Android esquece os alarmes: aqui eles voltam. */
public class InicioReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context contexto, Intent intent) {
        String acao = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(acao) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(acao)) return;
        Avisos.agendar(contexto, Guardados.de(contexto).getString(Guardados.TEXTO, null));
        ConferenciaWorker.agendar(contexto);
    }
}
