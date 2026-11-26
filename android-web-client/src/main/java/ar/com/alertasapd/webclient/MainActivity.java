package ar.com.alertasapd.webclient;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import android.view.View;
import android.view.WindowInsets;

public final class MainActivity extends Activity {
    private static final Uri HOME = Uri.parse("https://alertasapd.com.ar/");
    private TextView status;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.rgb(241,246,251));
        int pad = Math.round(24 * getResources().getDisplayMetrics().density);
        root.setPadding(pad,pad,pad,pad);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(pad + insets.getSystemWindowInsetLeft(), pad + insets.getSystemWindowInsetTop(),
                pad + insets.getSystemWindowInsetRight(), pad + insets.getSystemWindowInsetBottom());
            return insets;
        });
        TextView title = new TextView(this);
        title.setText("AlertasAPD"); title.setTextSize(30);
        title.setTextColor(Color.rgb(8,44,67)); title.setGravity(Gravity.CENTER);
        root.addView(title);
        TextView desc = new TextView(this);
        desc.setText("Versión Android de prueba · acceso al servicio web real");
        desc.setTextSize(16); desc.setGravity(Gravity.CENTER);
        root.addView(desc);
        Button open = new Button(this);
        open.setText("Abrir AlertasAPD");
        open.setOnClickListener(v -> openSite());
        root.addView(open);
        status = new TextView(this);
        status.setText("Requiere conexión. La sesión se gestiona en tu navegador.");
        status.setGravity(Gravity.CENTER);
        root.addView(status);
        setContentView(root);
    }

    private void openSite() {
        // Never trust incoming intent data or receive credentials in this app.
        try {
            CustomTabColorSchemeParams colors = new CustomTabColorSchemeParams.Builder()
                .setToolbarColor(Color.rgb(8,44,67)).build();
            CustomTabsIntent tab = new CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(colors).setShowTitle(true).build();
            tab.launchUrl(this, HOME);
        } catch (ActivityNotFoundException | SecurityException ex) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, HOME).addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (ActivityNotFoundException | SecurityException unavailable) {
                status.setText("No hay un navegador disponible. Instalá o habilitá uno para ingresar.");
            }
        }
    }
}
