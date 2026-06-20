package ar.com.alertasapd.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://alertasapd.com.ar/";
    private static final String HERRAMIENTAS_URL = "https://alertasapd.com.ar/herramientas.html";
    private static final String BUSCAR_URL = "https://alertasapd.com.ar/buscar-herramientas.html";
    private static final String LICENCIAS_URL = "https://alertasapd.com.ar/licencias-docentes.html";
    private static final String HABERES_URL = "https://alertasapd.com.ar/calculadora-haberes-docentes.html";

    private LinearLayout root;
    private WebView webView;
    private TextView title;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showMenu();
    }

    private void showMenu() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(36, 48, 36, 36);
        root.setBackgroundColor(Color.rgb(245, 248, 255));

        title = new TextView(this);
        title.setText("APDocentePBA");
        title.setTextSize(28);
        title.setTextColor(Color.rgb(11, 45, 92));
        title.setGravity(Gravity.CENTER);
        root.addView(title, fullWidth());

        TextView subtitle = new TextView(this);
        subtitle.setText("Panel y alertas se abren en navegador. Herramientas publicas se pueden ver dentro de la app.");
        subtitle.setTextSize(15);
        subtitle.setTextColor(Color.rgb(55, 65, 81));
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 18, 0, 26);
        root.addView(subtitle, fullWidth());

        addExternalButton(root, "Abrir panel y alertas", HOME_URL);
        addInternalButton(root, "Herramientas docentes", HERRAMIENTAS_URL);
        addInternalButton(root, "Buscar herramientas", BUSCAR_URL);
        addInternalButton(root, "Licencias docentes", LICENCIAS_URL);
        addInternalButton(root, "Calculadora de haberes", HABERES_URL);

        TextView note = new TextView(this);
        note.setText("Esta APK no modifica Cloudflare, Worker ni Supabase.");
        note.setTextSize(13);
        note.setTextColor(Color.rgb(75, 85, 99));
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, 28, 0, 0);
        root.addView(note, fullWidth());

        setContentView(root);
    }

    private void showWeb(String label, String url) {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(Color.WHITE);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(12, 10, 12, 10);
        bar.setBackgroundColor(Color.rgb(11, 45, 92));

        Button back = new Button(this);
        back.setText("Menu");
        back.setAllCaps(false);
        back.setOnClickListener(v -> showMenu());
        bar.addView(back);

        TextView barTitle = new TextView(this);
        barTitle.setText(label);
        barTitle.setTextColor(Color.WHITE);
        barTitle.setTextSize(16);
        barTitle.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        titleParams.setMargins(12, 0, 12, 0);
        bar.addView(barTitle, titleParams);

        Button open = new Button(this);
        open.setText("Chrome");
        open.setAllCaps(false);
        open.setOnClickListener(v -> openExternal(url));
        bar.addView(open);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String requestUrl) {
                if (requestUrl == null) return false;
                Uri uri = Uri.parse(requestUrl);
                String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase();
                if (host.endsWith("alertasapd.com.ar")) return false;
                openExternal(requestUrl);
                return true;
            }
        });

        page.addView(bar, fullWidth());
        page.addView(webView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(page);
        webView.loadUrl(url);
    }

    private void addInternalButton(LinearLayout root, String text, String url) {
        Button button = makeButton(text);
        button.setOnClickListener(v -> showWeb(text, url));
        addButtonView(root, button);
    }

    private void addExternalButton(LinearLayout root, String text, String url) {
        Button button = makeButton(text);
        button.setOnClickListener(v -> openExternal(url));
        addButtonView(root, button);
    }

    private Button makeButton(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setAllCaps(false);
        button.setTextSize(16);
        return button;
    }

    private void addButtonView(LinearLayout root, Button button) {
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

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        showMenu();
    }
}
