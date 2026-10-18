package io.github.mohiuddinramzan.simplechat;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.RequiresApi;
import androidx.annotation.StringRes;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewFeature;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;

/**
 * Hosts the bundled web app in a locked-down WebView.
 *
 * - Content is served from the APK assets through WebViewAssetLoader on
 *   https://appassets.androidplatform.net/ (no file:// access, no internet permission).
 * - No addJavascriptInterface: the page is never given a native object.
 * - Navigation and sub-requests are limited to that trusted local origin.
 */
public class MainActivity extends AppCompatActivity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME_URL = "https://" + HOST + "/assets/www/index.html";

    // Native -> JS only (evaluateJavascript). The page exposes these two hooks itself.
    private static final String BACK_JS =
            "(function(){try{return typeof window.__simplechatHandleBack==='function'"
                    + "?window.__simplechatHandleBack()===true:false;}catch(e){return false;}})()";
    private static final String READ_EXPORT_JS =
            "(function(){var v=window.__simplechatLastExport||null;"
                    + "window.__simplechatLastExport=null;return JSON.stringify(v);})()";

    private WebView webView;
    private WebViewAssetLoader assetLoader;
    private ValueCallback<Uri[]> pendingFileCallback;
    private String pendingExportText;

    private final ActivityResultLauncher<Intent> fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), result -> {
                ValueCallback<Uri[]> callback = pendingFileCallback;
                pendingFileCallback = null;
                if (callback != null) {
                    callback.onReceiveValue(WebChromeClient.FileChooserParams
                            .parseResult(result.getResultCode(), result.getData()));
                }
            });

    private final ActivityResultLauncher<String> exportLauncher = registerForActivityResult(
            new ActivityResultContracts.CreateDocument("application/json"), uri -> {
                String text = pendingExportText;
                pendingExportText = null;
                if (uri == null || text == null) {
                    toast(R.string.export_cancelled);
                    return;
                }
                writeExport(uri, text);
            });

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        assetLoader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(webView);

        configureSettings(webView.getSettings());
        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppChromeClient());
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) ->
                handleDownload(url));

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBack(this);
            }
        });

        boolean restored = savedInstanceState != null
                && webView.restoreState(savedInstanceState) != null;
        if (!restored) {
            webView.loadUrl(HOME_URL);
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @SuppressWarnings("deprecation")
    private void configureSettings(WebSettings s) {
        s.setJavaScriptEnabled(true);          // the app is JavaScript
        s.setDomStorageEnabled(true);          // localStorage (theme, session)
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            // The web app ships its own light/dark themes; do not darken it a second time.
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(s, false);
        }
    }

    /* ---------------- Back button ---------------- */

    private void handleBack(OnBackPressedCallback self) {
        if (webView == null) {
            exitApp(self);
            return;
        }
        // 1) let the page close an open dialog, 2) otherwise web history, 3) otherwise leave.
        webView.evaluateJavascript(BACK_JS, value -> {
            if ("true".equals(value)) {
                return;
            }
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
            } else {
                exitApp(self);
            }
        });
    }

    private void exitApp(OnBackPressedCallback self) {
        self.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
    }

    /* ---------------- Backup export (blob download) ---------------- */

    private void handleDownload(String url) {
        if (url == null || !url.startsWith("blob:") || webView == null) {
            toast(R.string.download_unsupported);
            return;
        }
        // The page stored the file text in a variable right before triggering the download.
        webView.evaluateJavascript(READ_EXPORT_JS, this::onExportPayload);
    }

    private void onExportPayload(String value) {
        try {
            if (value == null) {
                throw new JSONException("empty");
            }
            Object first = new JSONTokener(value).nextValue(); // evaluateJavascript returns a JSON string
            if (!(first instanceof String)) {
                throw new JSONException("unexpected value");
            }
            JSONObject payload = new JSONObject((String) first);
            String text = payload.getString("text");
            String name = safeFileName(payload.optString("filename", "simplechat-backup.json"));
            pendingExportText = text;
            exportLauncher.launch(name); // system "Save as" screen: no storage permission needed
        } catch (JSONException | ActivityNotFoundException e) {
            pendingExportText = null;
            toast(R.string.export_failed);
        }
    }

    private static String safeFileName(String raw) {
        String cleaned = raw == null ? "" : raw.replaceAll("[^A-Za-z0-9._-]", "_");
        if (cleaned.length() > 80) {
            cleaned = cleaned.substring(0, 80);
        }
        if (cleaned.isEmpty()) {
            cleaned = "simplechat-backup.json";
        }
        if (!cleaned.endsWith(".json")) {
            cleaned = cleaned + ".json";
        }
        return cleaned;
    }

    private void writeExport(Uri uri, String text) {
        try (OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
            if (out == null) {
                throw new IOException("no output stream");
            }
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.flush();
            toast(R.string.export_saved);
        } catch (IOException | RuntimeException e) {
            toast(R.string.export_failed);
        }
    }

    /* ---------------- WebView clients ---------------- */

    private static boolean isTrusted(Uri url) {
        return "https".equals(url.getScheme()) && HOST.equals(url.getHost());
    }

    private static WebResourceResponse emptyResponse(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason,
                new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }

    private void showErrorPage(WebView view) {
        String html = "<!DOCTYPE html><html lang=\"bn\"><head><meta charset=\"UTF-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"></head>"
                + "<body style=\"font-family:sans-serif;padding:24px;text-align:center\">"
                + "<h2>অ্যাপ লোড করা যায়নি</h2>"
                + "<p><a href=\"" + HOME_URL + "\">আবার চেষ্টা করুন</a></p></body></html>";
        view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    private final class AppWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            String scheme = url.getScheme();
            if ("blob".equals(scheme) || "data".equals(scheme)) {
                return null; // created by the page itself
            }
            if (isTrusted(url)) {
                WebResourceResponse response = assetLoader.shouldInterceptRequest(url);
                return response != null ? response : emptyResponse(404, "Not Found");
            }
            return emptyResponse(403, "Blocked"); // nothing outside the local origin is ever loaded
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (isTrusted(request.getUrl())) {
                return false;
            }
            toast(R.string.external_blocked);
            return true;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                showErrorPage(view);
            }
        }

        @RequiresApi(api = Build.VERSION_CODES.O)
        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            if (webView != null) {
                ViewGroup parent = (ViewGroup) webView.getParent();
                if (parent != null) {
                    parent.removeView(webView);
                }
                webView.destroy();
                webView = null;
            }
            toast(R.string.renderer_crashed);
            recreate();
            return true;
        }
    }

    private final class AppChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (pendingFileCallback != null) {
                pendingFileCallback.onReceiveValue(null);
            }
            pendingFileCallback = callback;
            try {
                fileChooserLauncher.launch(params.createIntent()); // system picker, no permission
                return true;
            } catch (ActivityNotFoundException e) {
                pendingFileCallback = null;
                callback.onReceiveValue(null);
                toast(R.string.file_chooser_unavailable);
                return true;
            }
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            request.deny();
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin,
                                                       GeolocationPermissions.Callback callback) {
            callback.invoke(origin, false, false);
        }
    }

    /* ---------------- Lifecycle ---------------- */

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (pendingFileCallback != null) {
            pendingFileCallback.onReceiveValue(null);
            pendingFileCallback = null;
        }
        pendingExportText = null;
        if (webView != null) {
            ViewGroup parent = (ViewGroup) webView.getParent();
            if (parent != null) {
                parent.removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    private void toast(@StringRes int message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}
