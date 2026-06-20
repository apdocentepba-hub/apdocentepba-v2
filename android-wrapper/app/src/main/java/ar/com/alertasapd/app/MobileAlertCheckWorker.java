package ar.com.alertasapd.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

public class MobileAlertCheckWorker extends Worker {
    static final String PREFS = "apd_prefs";
    static final String KEY_USER_ID = "mobile_user_id";
    static final String KEY_LAST_FINGERPRINT = "mobile_last_fingerprint";
    static final String KEY_LAST_TOTAL = "mobile_last_total";
    static final String KEY_LAST_ERROR = "mobile_last_error";
    static final String KEY_LAST_CHECK = "mobile_last_check";
    static final String CHANNEL_ID = "apd_alertas";
    static final String CHECK_BASE = "https://apdocentepba-mobile-alerts-sandbox.apdocentepba.workers.dev/mobile/alerts?user_id=";

    public MobileAlertCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            String userId = prefs.getString(KEY_USER_ID, "");
            if (userId == null || userId.trim().isEmpty()) return Result.success();

            JSONObject data = fetchJson(CHECK_BASE + URLEncoder.encode(userId.trim(), "UTF-8"));
            if (data == null || !data.optBoolean("ok", false)) {
                prefs.edit()
                        .putString(KEY_LAST_ERROR, data == null ? "sin respuesta" : data.optString("error", "respuesta no OK"))
                        .putLong(KEY_LAST_CHECK, System.currentTimeMillis())
                        .apply();
                return Result.retry();
            }

            int total = data.optInt("total", 0);
            String fingerprint = data.optString("fingerprint", "total-" + total);
            int oldTotal = prefs.getInt(KEY_LAST_TOTAL, -1);
            String oldFingerprint = prefs.getString(KEY_LAST_FINGERPRINT, "");

            prefs.edit()
                    .putInt(KEY_LAST_TOTAL, total)
                    .putString(KEY_LAST_FINGERPRINT, fingerprint)
                    .putString(KEY_LAST_ERROR, "")
                    .putLong(KEY_LAST_CHECK, System.currentTimeMillis())
                    .apply();

            boolean first = oldTotal < 0 && total > 0;
            boolean increased = oldTotal >= 0 && total > oldTotal;
            boolean changed = oldTotal >= 0 && total > 0 && !fingerprint.equals(oldFingerprint);
            if (first || increased || changed) showNotification(context, total);
            return Result.success();
        } catch (Exception e) {
            prefs.edit()
                    .putString(KEY_LAST_ERROR, e.getMessage() == null ? "error" : e.getMessage())
                    .putLong(KEY_LAST_CHECK, System.currentTimeMillis())
                    .apply();
            return Result.retry();
        }
    }

    private static JSONObject fetchJson(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(25000);
        conn.setRequestProperty("Accept", "application/json");
        int code = conn.getResponseCode();
        BufferedReader br = new BufferedReader(new InputStreamReader(code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream()));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = br.readLine()) != null) sb.append(line);
        br.close();
        if (sb.length() == 0) return null;
        return new JSONObject(sb.toString());
    }

    private static void showNotification(Context context, int total) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Alertas APDocentePBA", NotificationManager.IMPORTANCE_DEFAULT);
            nm.createNotificationChannel(channel);
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://alertasapd.com.ar/"));
        PendingIntent pi = PendingIntent.getActivity(context, 3001, intent, Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_UPDATE_CURRENT);
        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new android.app.Notification.Builder(context, CHANNEL_ID) : new android.app.Notification.Builder(context);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("APDocentePBA")
                .setContentText("Tenes " + total + " alerta(s) compatible(s) para revisar")
                .setContentIntent(pi)
                .setAutoCancel(true);
        nm.notify(3001, builder.build());
    }
}
