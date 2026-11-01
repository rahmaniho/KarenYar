package ir.karensoft.hesabyar.admin;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.HttpAuthHandler;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String ADMIN_URL = "https://staging.karen-soft.ir/admin/";
    private static final String ALLOWED_HOST = "staging.karen-soft.ir";
    private static final String ALLOWED_PATH_PREFIX = "/admin/";

    private WebView webView;
    private ProgressBar progressBar;
    private View errorView;
    private TextView errorMessage;

    private String authUser;
    private String authPass;
    private int authAttempts;
    private boolean authDialogShowing;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progress);
        errorView = findViewById(R.id.error_view);
        errorMessage = findViewById(R.id.error_message);
        Button retryButton = findViewById(R.id.retry_button);
        retryButton.setOnClickListener(v -> loadAdmin());

        configureWebView();

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            loadAdmin();
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setGeolocationEnabled(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUserAgentString(settings.getUserAgentString() + " KarenAdminAndroid/1.0.0");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                errorView.setVisibility(View.GONE);
                progressBar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                authAttempts = 0;
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                showError(getString(R.string.error_ssl));
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showError(getString(R.string.error_offline));
                }
            }

            @Override
            public void onReceivedHttpAuthRequest(WebView view, HttpAuthHandler handler, String host, String realm) {
                if (!ALLOWED_HOST.equals(host)) {
                    handler.cancel();
                    return;
                }
                if (authUser != null && authPass != null && authAttempts < 3) {
                    authAttempts++;
                    handler.proceed(authUser, authPass);
                    return;
                }
                showAuthDialog(handler, host);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }
        });
    }

    private boolean handleUrl(Uri uri) {
        if (uri == null) {
            return true;
        }
        String host = uri.getHost();
        String path = uri.getPath();
        boolean internal = "https".equals(uri.getScheme())
                && ALLOWED_HOST.equals(host)
                && path != null
                && (path.equals("/admin") || path.startsWith(ALLOWED_PATH_PREFIX));
        if (internal) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.open_external_failed, Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private void loadAdmin() {
        errorView.setVisibility(View.GONE);
        webView.loadUrl(ADMIN_URL);
    }

    private void showError(String message) {
        progressBar.setVisibility(View.GONE);
        errorMessage.setText(message);
        errorView.setVisibility(View.VISIBLE);
    }

    private void showAuthDialog(HttpAuthHandler handler, String host) {
        if (authDialogShowing) {
            handler.cancel();
            return;
        }
        authDialogShowing = true;

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        layout.setPadding(padding, padding / 2, padding, 0);

        EditText username = new EditText(this);
        username.setHint(R.string.username);
        username.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_NORMAL);
        username.setSingleLine(true);
        if (authUser != null) {
            username.setText(authUser);
        }

        EditText password = new EditText(this);
        password.setHint(R.string.password);
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        password.setSingleLine(true);

        layout.addView(username, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        layout.addView(password, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(R.string.auth_title)
                .setMessage(getString(R.string.auth_message, host))
                .setView(layout)
                .setCancelable(false)
                .setPositiveButton(R.string.login, null)
                .setNegativeButton(R.string.cancel, (d, which) -> {
                    authDialogShowing = false;
                    handler.cancel();
                    showError(getString(R.string.auth_required));
                })
                .create();

        dialog.setOnShowListener(d -> {
            Button login = dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            login.setOnClickListener(v -> {
                String user = username.getText().toString().trim();
                String pass = password.getText().toString();
                if (user.isEmpty() || pass.isEmpty()) {
                    Toast.makeText(this, R.string.auth_required, Toast.LENGTH_SHORT).show();
                    return;
                }
                authUser = user;
                authPass = pass;
                authAttempts = 0;
                authDialogShowing = false;
                dialog.dismiss();
                handler.proceed(authUser, authPass);
            });
        });

        dialog.show();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
