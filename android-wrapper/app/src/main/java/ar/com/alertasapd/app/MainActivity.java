package ar.com.alertasapd.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://alertasapd.com.ar/";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showMenu();
    }

    private void showMenu() {
        webView = null;

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(36, 48, 36, 36);
        root.setBackgroundColor(Color.rgb(245, 248, 255));

        TextView title = new TextView(this);
        title.setText("Alertas APDocentePBA");
        title.setTextSize(27);
        title.setTextColor(Color.rgb(11, 45, 92));
        title.setGravity(Gravity.CENTER);
        root.addView(title, fullWidth());

        TextView subtitle = new TextView(this);
        subtitle.setText("App enfocada solo en tus alertas. Podes entrar dentro de la app o abrir el panel en Chrome si el login embebido falla.");
        subtitle.setTextSize(15);
        subtitle.setTextColor(Color.rgb(55, 65, 81));
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 18, 0, 26);
        root.addView(subtitle, fullWidth());

        Button inside = makeButton("Ver alertas dentro de la app");
        inside.setOnClickListener(v -> showAlertsInside());
        addButtonView(root, inside);

        Button chrome = makeButton("Abrir alertas en Chrome");
        chrome.setOnClickListener(v -> openExternal(HOME_URL));
        addButtonView(root, chrome);

        Button clear = makeButton("Limpiar sesion de la app");
        clear.setOnClickListener(v -> clearWebSession(root));
        addButtonView(root, clear);

        TextView note = new TextView(this);
        note.setText("No modifica Cloudflare, Worker, Supabase ni la web principal.");
        note.setTextSize(13);
        note.setTextColor(Color.rgb(75, 85, 99));
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, 24, 0, 0);
        root.addView(note, fullWidth());

        setContentView(root);
    }

    private void showAlertsInside() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setBackgroundColor(Color.WHITE);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(12, 10, 12, 10);
        bar.setBackgroundColor(Color.rgb(11, 45, 92));

        Button menu = new Button(this);
        menu.setText("Menu");
        menu.setAllCaps(false);
        menu.setOnClickListener(v -> showMenu());
        bar.addView(menu);

        TextView barTitle = new TextView(this);
        barTitle.setText("Alertas");
        barTitle.setTextColor(Color.WHITE);
        barTitle.setTextSize(16);
        barTitle.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1);
        titleParams.setMargins(12, 0, 12, 0);
        bar.addView(barTitle, titleParams);

        Button chrome = new Button(this);
        chrome.setText("Chrome");
        chrome.setAllCaps(false);
        chrome.setOnClickListener(v -> openExternal(HOME_URL));
        bar.addView(chrome);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

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

            @Override
            public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
            }
        });

        page.addView(bar, fullWidth());
        page.addView(webView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(page);
        webView.loadUrl(HOME_URL);
    }

    private void clearWebSession(LinearLayout root) {
        try {
            CookieManager cm = CookieManager.getInstance();
            cm.removeAllCookies(null);
            cm.flush();
            TextView msg = new TextView(this);
            msg.setText("Sesion interna limpiada. Volve a entrar dentro de la app.");
            msg.setTextSize(13);
            msg.setTextColor(Color.rgb(55, 65, 81));
            msg.setGravity(Gravity.CENTER);
            msg.setPadding(0, 14, 0, 0);
            root.addView(msg, fullWidth());
        } catch (Exception ignored) {
        }
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
