package ar.com.alertasapd.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://alertasapd.com.ar/";
    private static final String HERRAMIENTAS_URL = "https://alertasapd.com.ar/herramientas.html";
    private static final String BUSCAR_URL = "https://alertasapd.com.ar/buscar-herramientas.html";
    private static final String LICENCIAS_URL = "https://alertasapd.com.ar/licencias-docentes.html";
    private static final String HABERES_URL = "https://alertasapd.com.ar/calculadora-haberes-docentes.html";
    private static final String LOGIN_URL = "https://ancient-wildflower-cd37.apdocentepba.workers.dev/api/login";

    private LinearLayout root;
    private WebView webView;
    private TextView title;
    private TextView notificationStatus;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestNotificationPermissionIfNeeded();
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
        subtitle.setPadding(0, 18, 0, 20);
        root.addView(subtitle, fullWidth());

        addExternalButton(root, "Abrir panel y alertas", HOME_URL);
        addInternalButton(root, "Herramientas docentes", HERRAMIENTAS_URL);
        addInternalButton(root, "Buscar herramientas", BUSCAR_URL);
        addInternalButton(root, "Licencias docentes", LICENCIAS_URL);
        addInternalButton(root, "Calculadora de haberes", HABERES_URL);
        addMenuButton(root, "Configurar notificaciones", this::showNotificationsSetup);

        notificationStatus = new TextView(this);
        notificationStatus.setText(currentNotificationSummary());
        notificationStatus.setTextSize(13);
        notificationStatus.setTextColor(Color.rgb(55, 65, 81));
        notificationStatus.setGravity(Gravity.CENTER);
        notificationStatus.setPadding(0, 18, 0, 0);
        root.addView(notificationStatus, fullWidth());

        TextView note = new TextView(this);
        note.setText("Esta APK no modifica Cloudflare, Worker ni Supabase.");
        note.setTextSize(13);
        note.setTextColor(Color.rgb(75, 85, 99));
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, 16, 0, 0);
        root.addView(note, fullWidth());

        setContentView(root);
    }

    private void showNotificationsSetup() {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER_HORIZONTAL);
        page.setPadding(36, 48, 36, 36);
        page.setBackgroundColor(Color.rgb(245, 248, 255));

        TextView header = new TextView(this);
        header.setText("Notificaciones locales");
        header.setTextSize(24);
        header.setTextColor(Color.rgb(11, 45, 92));
        header.setGravity(Gravity.CENTER);
        page.addView(header, fullWidth());

        TextView info = new TextView(this);
        info.setText("La app revisa tus alertas cada 15 minutos usando tu cuenta. No es push del servidor y no cambia la web.");
        info.setTextSize(14);
        info.setTextColor(Color.rgb(55, 65, 81));
        info.setGravity(Gravity.CENTER);
        info.setPadding(0, 14, 0, 20);
        page.addView(info, fullWidth());

        EditText email = new EditText(this);
        email.setHint("Email");
        email.setSingleLine(true);
        page.addView(email, fullWidth());

        EditText password = new EditText(this);
        password.setHint("Contraseña");
        password.setSingleLine(true);
        password.setInputType(0x00000081);
        page.addView(password, fullWidth());

        TextView status = new TextView(this);
        status.setText(currentNotificationSummary());
        status.setTextSize(13);
        status.setTextColor(Color.rgb(55, 65, 81));
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, 16, 0, 16);
        page.addView(status, fullWidth());

        Button activate = makeButton("Activar notificaciones");
        activate.setOnClickListener(v -> loginAndEnableNotifications(email.getText().toString(), password.getText().toString(), status));
        addButtonView(page, activate);

        Button test = makeButton("Probar ahora");
        test.setOnClickListener(v -> {
            status.setText("Revisando alertas...");
            WorkManager.getInstance(this).enqueue(new OneTimeWorkRequest.Builder(AlertCheckWorker.class).build());
            status.setText("Chequeo solicitado. Si hay cambios, Android mostrara una notificacion.");
        });
        addButtonView(page, test);

        Button disable = makeButton("Desactivar notificaciones");
        disable.setOnClickListener(v -> {
            WorkManager.getInstance(this).cancelUniqueWork("apd_alert_check");
            getSharedPreferences(AlertCheckWorker.PREFS, MODE_PRIVATE).edit().clear().apply();
            status.setText("Notificaciones desactivadas.");
        });
        addButtonView(page, disable);

        Button back = makeButton("Volver al menu");
        back.setOnClickListener(v -> showMenu());
        addButtonView(page, back);

        setContentView(page);
    }

    private void loginAndEnableNotifications(String email, String password, TextView status) {
        final String emailTrim = email == null ? "" : email.trim();
        final String passTrim = password == null ? "" : password.trim();
        if (emailTrim.isEmpty() || passTrim.isEmpty()) {
            status.setText("Completa email y contraseña.");
            return;
        }

        status.setText("Validando cuenta...");
        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("email", emailTrim);
                payload.put("password", passTrim);
                JSONObject response = postJson(LOGIN_URL, payload);
                if (response == null || !response.optBoolean("ok", false)) {
                    String msg = response != null ? response.optString("message", "No se pudo ingresar") : "No se pudo ingresar";
                    runOnUiThread(() -> status.setText(msg));
                    return;
                }

                String token = response.optString("session_token", response.optString("token", ""));
                JSONObject user = response.optJSONObject("user");
                String userId = user != null ? user.optString("id", response.optString("token", "")) : response.optString("token", "");
                if (userId == null || userId.trim().isEmpty()) {
                    runOnUiThread(() -> status.setText("No se pudo obtener usuario."));
                    return;
                }

                getSharedPreferences(AlertCheckWorker.PREFS, MODE_PRIVATE).edit()
                        .putString(AlertCheckWorker.KEY_USER_ID, userId)
                        .putString(AlertCheckWorker.KEY_TOKEN, token == null || token.isEmpty() ? userId : token)
                        .putInt(AlertCheckWorker.KEY_LAST_TOTAL, -1)
                        .putString(AlertCheckWorker.KEY_LAST_FINGERPRINT, "")
                        .apply();

                scheduleAlertChecks();
                WorkManager.getInstance(this).enqueue(new OneTimeWorkRequest.Builder(AlertCheckWorker.class).build());
                runOnUiThread(() -> status.setText("Notificaciones activadas. La app revisa cada 15 minutos."));
            } catch (Exception e) {
                runOnUiThread(() -> status.setText("Error activando notificaciones."));
            }
        }).start();
    }

    private JSONObject postJson(String url, JSONObject payload) throws Exception {
        java.net.HttpURLConnection conn = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Accept", "application/json");
        conn.setDoOutput(true);
        java.io.OutputStream os = conn.getOutputStream();
        os.write(payload.toString().getBytes("UTF-8"));
        os.close();
        int code = conn.getResponseCode();
        java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(
                code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream()
        ));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        return new JSONObject(sb.toString());
    }

    private void scheduleAlertChecks() {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(AlertCheckWorker.class, 15, TimeUnit.MINUTES).build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("apd_alert_check", ExistingPeriodicWorkPolicy.UPDATE, request);
    }

    private String currentNotificationSummary() {
        SharedPreferences prefs = getSharedPreferences(AlertCheckWorker.PREFS, MODE_PRIVATE);
        String userId = prefs.getString(AlertCheckWorker.KEY_USER_ID, "");
        int lastTotal = prefs.getInt(AlertCheckWorker.KEY_LAST_TOTAL, -1);
        if (userId == null || userId.isEmpty()) return "Notificaciones: desactivadas.";
        if (lastTotal >= 0) return "Notificaciones: activadas. Ultimo total detectado: " + lastTotal + ".";
        return "Notificaciones: activadas. Aun sin chequeo inicial.";
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 10);
        }
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

    private void addMenuButton(LinearLayout root, String text, Runnable action) {
        Button button = makeButton(text);
        button.setOnClickListener(v -> action.run());
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
