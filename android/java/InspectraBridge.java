package org.kivy.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;
import android.view.View;
import android.webkit.JsResult;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLDecoder;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipFile;
import org.json.JSONObject;

/** Native photo/document operations for the app's loopback WebView only. */
public final class InspectraBridge extends WebChromeClient {
    private static final String TAG = "InspectraBridge";
    private static final String DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    private static final int PICK_PHOTO = 8101, SAVE_REPORT = 8102, CAMERA = 8103;
    private final Activity activity;
    private final WebView webView;
    private ValueCallback<Uri[]> photoCallback;
    private File cameraFile, pendingReport;
    private Uri cameraUri;
    private String reportToken;
    private boolean reportBusy;
    private volatile boolean closed;

    public InspectraBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        WebView.setWebContentsDebuggingEnabled((activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        activity.getWindow().getDecorView().setBackgroundColor(0xff173b2f);
        webView.getSettings().setUserAgentString(webView.getSettings().getUserAgentString() + " InspectraAndroid/0.1.2");
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(true);
        webView.setWebChromeClient(this);
        // API 35 enforces edge-to-edge: keep controls clear of cutouts, bars and keyboard.
        View content = activity.findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
        for (String name : new String[] {"capture", "reports"}) {
            File[] files = new File(activity.getCacheDir(), name).listFiles();
            if (files != null) for (File file : files) {
                if (file.isFile() && System.currentTimeMillis() - file.lastModified() > 86_400_000) file.delete();
            }
        }
    }

    private static boolean local(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        return "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost()) && uri.getPort() == 5000;
    }

    @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
        if (!local(url)) { result.cancel(); return true; }
        new AlertDialog.Builder(activity).setTitle("Konfirmasi Inspectra").setMessage(message)
                .setPositiveButton("Lanjutkan", (dialog, which) -> result.confirm())
                .setNegativeButton("Batal", (dialog, which) -> result.cancel())
                .setOnCancelListener(dialog -> result.cancel()).show();
        return true;
    }

    @Override public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) {
        return onJsConfirm(view, url, "Perubahan belum tersimpan. Tetap tinggalkan halaman?", result);
    }

    @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        finishPhoto(null);
        if (!local(view.getUrl())) { callback.onReceiveValue(null); return true; }
        photoCallback = callback;
        new AlertDialog.Builder(activity).setTitle("Foto inspeksi")
                .setItems(new String[] {"Ambil foto", "Pilih foto"}, (dialog, option) -> {
                    if (option == 0) launchCamera();
                    else {
                        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                        picker.setType("image/*");
                        picker.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {"image/jpeg", "image/png", "image/webp"});
                        picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                        try { activity.startActivityForResult(picker, PICK_PHOTO); }
                        catch (ActivityNotFoundException error) { finishPhoto(null); toast("Pemilih foto tidak tersedia."); }
                    }
                }).setOnCancelListener(dialog -> finishPhoto(null)).show();
        return true;
    }

    private void finishPhoto(Uri[] result) {
        ValueCallback<Uri[]> callback = photoCallback;
        photoCallback = null;
        if (callback != null) callback.onReceiveValue(result);
    }

    private File directory(String name) throws IOException {
        File directory = new File(activity.getCacheDir(), name);
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Penyimpanan sementara tidak tersedia.");
        return directory;
    }

    private void launchCamera() {
        try {
            cameraFile = File.createTempFile("qc-", ".jpg", directory("capture"));
            cameraUri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", cameraFile);
            Intent intent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            intent.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
            intent.setClipData(ClipData.newRawUri("Foto inspeksi", cameraUri));
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            activity.startActivityForResult(intent, CAMERA);
        } catch (IOException | RuntimeException error) {
            if (cameraFile != null) cameraFile.delete();
            cameraFile = null; cameraUri = null;
            finishPhoto(null);
            toast("Kamera tidak tersedia. Gunakan Pilih foto.");
        }
    }

    public boolean handleUrl(Uri uri) {
        if ("inspectra-report".equals(uri.getScheme())) {
            if (local(webView.getUrl()) && uri.getPathSegments().size() == 1)
                generateReport(uri.getPathSegments().get(0), uri.getHost(), uri.getQueryParameter("token"));
            return true;
        }
        if (local(uri.toString()) || "file:///android_asset/_load.html".equals(uri.toString())
                || "about:blank".equals(uri.toString())) return false;
        if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
            try { activity.startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (ActivityNotFoundException error) { toast("Aplikasi pembuka tautan tidak tersedia."); }
        }
        return true;
    }

    private void toast(String message) {
        if (!closed) Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
    }

    private void result(String token, String status, String message) {
        if (closed) return;
        try {
            JSONObject detail = new JSONObject().put("token", token).put("status", status).put("message", message);
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('inspectra-report-result',{detail:"
                    + detail.toString() + "}))", null);
        } catch (org.json.JSONException error) { Log.e(TAG, "Report feedback failed", error); }
        toast(message);
    }

    private void finishReport(String status, String message) {
        String token = reportToken;
        reportToken = null; reportBusy = false;
        result(token, status, message);
    }

    private static String filename(String header) throws IOException {
        if (header == null) return "Inspectra.docx";
        Matcher utf8 = Pattern.compile("filename\\*=UTF-8''([^;]+)", Pattern.CASE_INSENSITIVE).matcher(header);
        Matcher plain = Pattern.compile("filename=\"?([^\";]+)", Pattern.CASE_INSENSITIVE).matcher(header);
        String name = utf8.find() ? URLDecoder.decode(utf8.group(1).replace("+", "%2B"), "UTF-8")
                : plain.find() ? plain.group(1) : "Inspectra.docx";
        name = name.replaceAll("[\\\\/\\p{Cntrl}]", "_");
        if (name.length() > 180) name = name.substring(0, 175) + ".docx";
        return name.endsWith(".docx") ? name : name + ".docx";
    }

    private void generateReport(String id, String action, String token) {
        try { UUID.fromString(id); UUID.fromString(token); }
        catch (RuntimeException error) { result(token, "error", "Permintaan laporan tidak valid."); return; }
        if (!"open".equals(action) && !"download".equals(action)) return;
        if (reportBusy) { result(token, "error", "Selesaikan dialog laporan yang masih terbuka."); return; }
        reportBusy = true; reportToken = token;
        new Thread(() -> {
            HttpURLConnection connection = null;
            File report = null;
            try {
                connection = (HttpURLConnection) new URL("http://127.0.0.1:5000/api/inspections/" + id + "/report/docx").openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(5000); connection.setReadTimeout(120000);
                if (connection.getResponseCode() != 200) throw new IOException("Pembuatan DOCX ditolak. Periksa ulang inspeksi (HTTP " + connection.getResponseCode() + ").");
                String title = filename(connection.getHeaderField("Content-Disposition"));
                report = File.createTempFile("report-", ".docx", directory("reports"));
                long total = 0;
                try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(report)) {
                    byte[] buffer = new byte[65536]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        total += count;
                        if (closed || total > 100_000_000) throw new IOException("DOCX terlalu besar atau aplikasi ditutup.");
                        output.write(buffer, 0, count);
                    }
                }
                if (total == 0) throw new IOException("DOCX kosong.");
                try (ZipFile zip = new ZipFile(report)) {
                    if (zip.getEntry("word/document.xml") == null) throw new IOException("DOCX tidak lengkap.");
                }
                final File ready = report;
                activity.runOnUiThread(() -> {
                    if (closed) { ready.delete(); return; }
                    if ("open".equals(action)) {
                        Uri source = FileProvider.getUriForFile(activity, activity.getPackageName() + ".files", ready);
                        Intent viewer = new Intent(Intent.ACTION_VIEW).setDataAndType(source, DOCX);
                        viewer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        viewer.setClipData(ClipData.newRawUri(title, source));
                        try {
                            activity.startActivity(viewer);
                            finishReport("opened", "DOCX dibuka di aplikasi dokumen.");
                        } catch (ActivityNotFoundException error) {
                            ready.delete();
                            finishReport("error", "Pasang Word/WPS atau simpan DOCX untuk membukanya di aplikasi dokumen.");
                        }
                    } else {
                        pendingReport = ready;
                        Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);
                        picker.setType(DOCX); picker.putExtra(Intent.EXTRA_TITLE, title);
                        picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                        try { activity.startActivityForResult(picker, SAVE_REPORT); }
                        catch (ActivityNotFoundException error) {
                            pendingReport = null; ready.delete();
                            finishReport("error", "Pemilih lokasi simpan tidak tersedia.");
                        }
                    }
                });
            } catch (IOException | RuntimeException error) {
                if (report != null) report.delete();
                Log.e(TAG, "Generate report failed", error);
                activity.runOnUiThread(() -> finishReport("error", "Gagal membuat DOCX. " + error.getMessage()));
            } finally { if (connection != null) connection.disconnect(); }
        }, "InspectraReportExport").start();
    }

    private static byte[] digest(InputStream input) throws IOException {
        try (InputStream stream = input) {
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[65536]; int count;
            while ((count = stream.read(buffer)) != -1) sha.update(buffer, 0, count);
            return sha.digest();
        } catch (NoSuchAlgorithmException error) { throw new IOException(error); }
    }

    private void writeReport(File source, Uri destination) {
        new Thread(() -> {
            try {
                byte[] expected = digest(new FileInputStream(source));
                try (InputStream input = new FileInputStream(source);
                        OutputStream output = activity.getContentResolver().openOutputStream(destination, "wt")) {
                    if (output == null) throw new IOException("Lokasi simpan tidak dapat ditulis.");
                    byte[] buffer = new byte[65536]; int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                }
                InputStream saved = activity.getContentResolver().openInputStream(destination);
                if (saved == null || !Arrays.equals(expected, digest(saved))) throw new IOException("Isi berkas tersimpan belum dapat diverifikasi. Coba lokasi lain.");
                activity.runOnUiThread(() -> finishReport("saved", "DOCX tersimpan dan terverifikasi."));
            } catch (IOException | RuntimeException error) {
                Log.e(TAG, "Save report failed", error);
                activity.runOnUiThread(() -> finishReport("error", "Gagal menyimpan DOCX. " + error.getMessage()));
            } finally { source.delete(); }
        }, "InspectraReportSave").start();
    }

    public boolean onActivityResult(int request, int code, Intent intent) {
        if (request == PICK_PHOTO) {
            Uri[] selected = null;
            if (code == Activity.RESULT_OK && intent != null) {
                ClipData clip = intent.getClipData();
                if (clip != null) {
                    selected = new Uri[clip.getItemCount()];
                    for (int index = 0; index < selected.length; index++) selected[index] = clip.getItemAt(index).getUri();
                } else if (intent.getData() != null) selected = new Uri[] {intent.getData()};
            }
            finishPhoto(selected); return true;
        }
        if (request == CAMERA) {
            boolean ok = code == Activity.RESULT_OK && cameraFile != null && cameraFile.length() > 0;
            finishPhoto(ok ? new Uri[] {cameraUri} : null);
            // WebView reads the URI asynchronously; retain successful captures until next-day cleanup.
            if (!ok && cameraFile != null) cameraFile.delete();
            cameraFile = null; cameraUri = null; return true;
        }
        if (request == SAVE_REPORT) {
            File report = pendingReport; pendingReport = null;
            if (code == Activity.RESULT_OK && intent != null && intent.getData() != null && report != null)
                writeReport(report, intent.getData());
            else {
                if (report != null) report.delete();
                finishReport("cancelled", "Penyimpanan DOCX dibatalkan.");
            }
            return true;
        }
        return false;
    }

    public void back() {
        if (reportBusy) { toast("Selesaikan proses laporan dahulu."); return; }
        webView.evaluateJavascript("window.dispatchEvent(new Event('inspectra-back',{cancelable:true}))", value -> {
            if (closed || "false".equals(value)) return;
            new AlertDialog.Builder(activity).setTitle("Tutup Inspectra?")
                    .setMessage("Data yang sudah tersimpan tetap ada di HP ini.")
                    .setPositiveButton("Tutup", (dialog, which) -> activity.finish())
                    .setNegativeButton("Batal", null).show();
        });
    }

    public void close() {
        closed = true;
        finishPhoto(null);
        if (pendingReport != null) pendingReport.delete();
        if (cameraFile != null) cameraFile.delete();
    }
}
