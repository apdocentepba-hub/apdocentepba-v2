package ar.com.alertasapd.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://alertasapd.com.ar/";
    private static final String HERRAMIENTAS_URL = "https://alertasapd.com.ar/herramientas.html";
    private static final String BUSCAR_URL = "https://alertasapd.com.ar/buscar-herramientas.html";
    private static final String LICENCIAS_URL = "https://alertasapd.com.ar/licencias-docentes.html";
    private static final String HABERES_URL = "https://alertasapd.com.ar/calculadora-haberes-docentes.html";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(36, 48, 36, 36);
        root.setBackgroundColor(Color.rgb(245, 248, 255));

        TextView title = new TextView(this);
        title.setText("APDocentePBA");
        title.setTextSize(28);
        title.setTextColor(Color.rgb(11, 45, 92));
        title.setGravity(Gravity.CENTER);
        root.addView(title, fullWidth());

        TextView subtitle = new TextView(this);
        subtitle.setText("Acceso directo a la web oficial. El login y las alertas se abren en tu navegador para usar la misma sesion que en Chrome.");
        subtitle.setTextSize(15);
        subtitle.setTextColor(Color.rgb(55, 65, 81));
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 18, 0, 26);
        root.addView(subtitle, fullWidth());

        addButton(root, "Abrir panel y alertas", HOME_URL);
        addButton(root, "Herramientas docentes", HERRAMIENTAS_URL);
        addButton(root, "Buscar herramientas", BUSCAR_URL);
        addButton(root, "Licencias docentes", LICENCIAS_URL);
        addButton(root, "Calculadora de haberes", HABERES_URL);

        TextView note = new TextView(this);
        note.setText("Esta APK no modifica Cloudflare, Worker ni Supabase. Solo abre secciones existentes de la web.");
        note.setTextSize(13);
        note.setTextColor(Color.rgb(75, 85, 99));
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, 28, 0, 0);
        root.addView(note, fullWidth());

        setContentView(root);
    }

    private void addButton(LinearLayout root, String text, String url) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(16);
        button.setOnClickListener(v -> openExternal(url));
        LinearLayout.LayoutParams params = fullWidth();
        params.setMargins(0, 10, 0, 10);
        root.addView(button, params);
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private void openExternal(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }
}
