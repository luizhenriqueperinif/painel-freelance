package com.painelfreelance.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // O plugin do próprio app precisa ser registrado antes de a tela subir.
        registerPlugin(AvisosPlugin.class);
        super.onCreate(savedInstanceState);
        Avisos.criarCanal(this);
        // Garante a conferência por trás; se já estiver marcada, nada muda.
        if (Guardados.de(this).contains(Guardados.TOKEN)) ConferenciaWorker.agendar(this);
    }
}
