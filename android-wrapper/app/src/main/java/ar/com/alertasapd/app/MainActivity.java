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
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.browser.customtabs.CustomTabsIntent;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private static final String HOME_URL = "https://alertasapd.com.ar/";
    private static final String DEFAULT_USER_ID = "3a300893-a552-43c2-9189-071ab4a23198";
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestNotificationPermissionIfNeeded();
        showMenu();
    }

    private void showMenu() {
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
        subtitle.setText("App solo para alertas. Abre el panel con tu sesion de Chrome y revisa en segundo plano el Worker movil sandbox.");
        subtitle.setTextSize(15);
        subtitle.setTextColor(Color.rgb(55, 65, 81));
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 18, 0, 26);
        root.addView(subtitle, fullWidth());

        Button appMode = makeButton("Ver alertas modo app");
        appMode.setOnClickListener(v -> openCustomTab(HOME_URL));
        addButtonView(root, appMode);

        Button activate = makeButton("Activar avisos de alertas");
        activate.setOnClickListener(v -> enableAlertChecks());
        addButtonView(root, activate);

        Button test = makeButton("Probar chequeo ahora");
        test.setOnClickListener(v -> testAlertCheckNow());
        addButtonView(root, test);

        Button disable = makeButton("Desactivar avisos");
        disable.setOnClickListener(v -> disableAlertChecks());
        addButtonView(root, disable);

        Button chrome = makeButton("Abrir alertas en navegador");
        chrome.setOnClickListener(v -> openExternal(HOME_URL));
        addButtonView(root, chrome);

        statusText = new TextView(this);
        statusText.setText(currentStatus());
        statusText.setTextSize(13);
        statusText.setTextColor(Color.rgb(55, 65, 81));
        statusText.setGravity(Gravity.CENTER);
        statusText.setPadding(0, 22, 0, 0);
        root.addView(statusText, fullWidth());

        TextView note = new TextView(this);
        note.setText("No modifica el Worker principal, Cloudflare de produccion, Supabase ni la web principal.");
        note.setTextSize(13);
        note.setTextColor(Color.rgb(75, 85, 99));
        note.setGravity(Gravity.CENTER);
        note.setPadding(0, 20, 0, 0);
        root.addView(note, fullWidth());

        setContentView(root);
    }

    private void enableAlertChecks() {
        SharedPreferences prefs = getSharedPreferences(MobileAlertCheckWorker.PREFS, MODE_PRIVATE);
        prefs.edit()
                .putString(MobileAlertCheckWorker.KEY_USER_ID, DEFAULT_USER_ID)
                .putInt(MobileAlertCheckWorker.KEY_LAST_TOTAL, -1)
                .putString(MobileAlertCheckWorker.KEY_LAST_FINGERPRINT, "")
                .putString(MobileAlertCheckWorker.KEY_LAST_ERROR, "")
                .apply();

        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(MobileAlertCheckWorker.class, 15, TimeUnit.MINUTES).build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("apd_mobile_alert_check", ExistingPeriodicWorkPolicy.UPDATE, request);
        WorkManager.getInstance(this).enqueue(new OneTimeWorkRequest.Builder(MobileAlertCheckWorker.class).build());
        updateStatus("Avisos activados. Primer chequeo solicitado. Luego revisa cada 15 minutos aprox.");
    }

    private void testAlertCheckNow() {
        SharedPreferences prefs = getSharedPreferences(MobileAlertCheckWorker.PREFS, MODE_PRIVATE);
        if (prefs.getString(MobileAlertCheckWorker.KEY_USER_ID, "").isEmpty()) {
            prefs.edit().putString(MobileAlertCheckWorker.KEY_USER_ID, DEFAULT_USER_ID).apply();
        }
        WorkManager.getInstance(this).enqueue(new OneTimeWorkRequest.Builder(MobileAlertCheckWorker.class).build());
        updateStatus("Chequeo solicitado. Si encuentra alertas o cambios, Android mostrara una notificacion.");
    }

    private void disableAlertChecks() {
        WorkManager.getInstance(this).cancelUniqueWork("apd_mobile_alert_check");
        getSharedPreferences(MobileAlertCheckWorker.PREFS, MODE_PRIVATE).edit().clear().apply();
        updateStatus("Avisos desactivados.");
    }

    private String currentStatus() {
        SharedPreferences prefs = getSharedPreferences(MobileAlertCheckWorker.PREFS, MODE_PRIVATE);
        String userId = prefs.getString(MobileAlertCheckWorker.KEY_USER_ID, "");
        int total = prefs.getInt(MobileAlertCheckWorker.KEY_LAST_TOTAL, -1);
        long lastCheck = prefs.getLong(MobileAlertCheckWorker.KEY_LAST_CHECK, 0L);
        String error = prefs.getString(MobileAlertCheckWorker.KEY_LAST_ERROR, "");
        if (userId == null || userId.isEmpty()) return "Avisos: desactivados.";
        String base = total >= 0 ? "Avisos: activados. Ultimo total detectado: " + total + "." : "Avisos: activados. Todavia sin resultado.";
        if (lastCheck > 0) base += " Ultimo chequeo: " + formatTime(lastCheck) + ".";
        if (error != null && !error.isEmpty()) base += " Error: " + error;
        return base;
    }

    private String formatTime(long time) {
        try {
            return new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date(time));
        } catch (Exception e) {
            return "-";
        }
    }

    private void updateStatus(String text) {
        if (statusText != null) statusText.setText(text);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 10);
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

    private void openCustomTab(String url) {
        try {
            CustomTabsIntent intent = new CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .setToolbarColor(Color.rgb(11, 45, 92))
                    .build();
            intent.launchUrl(this, Uri.parse(url));
        } catch (Exception e) {
            openExternal(url);
        }
    }

    private void openExternal(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (Exception ignored) {
        }
    }
}
