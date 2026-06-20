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

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;

public class AlertCheckWorker extends Worker {
    static final String PREFS = "apd_prefs";
    static final String KEY_USER_ID = "user_id";
    static final String KEY_TOKEN = "token";
    static final String KEY_LAST_FINGERPRINT = "last_fingerprint";
    static final String KEY_LAST_TOTAL = "last_total";
    static final String CHANNEL_ID = "apd_alertas";
    static final String CHECK_URL = "https://ancient-wildflower-cd37.apdocentepba.workers.dev/api/mis-alertas?user_id=";

    public AlertCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            Context context = getApplicationContext();
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String userId = prefs.getString(KEY_USER_ID, "");
            String token = prefs.getString(KEY_TOKEN, userId);
            if (userId == null || userId.trim().isEmpty()) return Result.success();

            JSONObject data = fetchAlerts(userId.trim(), token == null ? "" : token.trim());
            if (data == null || !data.optBoolean("ok", false)) return Result.retry();

            JSONArray arr = data.optJSONArray("resultados");
            if (arr == null) arr = data.optJSONArray("items");
            if (arr == null) arr = data.optJSONArray("alertas");
            int total = arr == null ? data.optInt("total", 0) : arr.length();
            String fingerprint = fingerprint(arr, total);

            String oldFingerprint = prefs.getString(KEY_LAST_FINGERPRINT, "");
            int oldTotal = prefs.getInt(KEY_LAST_TOTAL, -1);

            prefs.edit()
                    .putString(KEY_LAST_FINGERPRINT, fingerprint)
                    .putInt(KEY_LAST_TOTAL, total)
                    .apply();

            boolean firstWithAlerts = oldTotal < 0 && total > 0;
            boolean changed = oldTotal >= 0 && total > 0 && !fingerprint.equals(oldFingerprint);
            boolean increased = oldTotal >= 0 && total > oldTotal;

            if (firstWithAlerts || changed || increased) {
                notifyAlerts(context, total);
            }

            return Result.success();
        } catch (Exception e) {
            return Result.retry();
        }
    }

    static JSONObject fetchAlerts(String userId, String token) throws Exception {
        String url = CHECK_URL + URLEncoder.encode(userId, "UTF-8");
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setRequestProperty("Accept", "application/json");
        if (token != null && !token.isEmpty()) {
            conn.setRequestProperty("Authorization", "Bearer " + token);
        }

        int code = conn.getResponseCode();
        BufferedReader reader = new BufferedReader(new InputStreamReader(
                code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream()
        ));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        if (code < 200 || code >= 300) return null;
        return new JSONObject(sb.toString());
    }

    static String fingerprint(JSONArray arr, int total) throws Exception {
        StringBuilder sb = new StringBuilder();
        sb.append(total).append("|");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject item = arr.optJSONObject(i);
                if (item == null) continue;
                sb.append(item.optString("source_offer_key", ""));
                sb.append(item.optString("iddetalle", ""));
                sb.append(item.optString("idoferta", ""));
                sb.append(item.optString("cargo", ""));
                sb.append(item.optString("distrito", ""));
                sb.append("|");
            }
        }
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(sb.toString().getBytes("UTF-8"));
        StringBuilder hex = new StringBuilder();
        for (byte b : digest) hex.append(String.format("%02x", b));
        return hex.toString();
    }

    static void notifyAlerts(Context context, int total) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Alertas APDocentePBA",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Avisos locales cuando cambian tus alertas APD");
            nm.createNotificationChannel(channel);
        }

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://alertasapd.com.ar/"));
        PendingIntent pi = PendingIntent.getActivity(
                context,
                100,
                intent,
                Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT : PendingIntent.FLAG_UPDATE_CURRENT
        );

        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new android.app.Notification.Builder(context, CHANNEL_ID)
                : new android.app.Notification.Builder(context);

        builder.setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("APDocentePBA")
                .setContentText("Tenes " + total + " alerta(s) APD para revisar")
                .setContentIntent(pi)
                .setAutoCancel(true);

        nm.notify(2001, builder.build());
    }
}
