package com.wolfpalomar.gymmanagement;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppInstaller")
public class AppInstallerPlugin extends Plugin {

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ret.put("value", getContext().getPackageManager().canRequestPackageInstalls());
        } else {
            ret.put("value", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String fileName = call.getString("fileName");
        if (fileName == null) {
            call.reject("Missing fileName parameter.");
            return;
        }

        File downloadDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        File apkFile = new File(downloadDir, fileName);

        if (!apkFile.exists()) {
            call.reject("APK file does not exist at expected path.");
            return;
        }

        launchInstaller(apkFile, call);
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String urlString = call.getString("url");
        String fileName = call.getString("fileName", "app-update.apk");

        if (urlString == null) {
            call.reject("Download URL is missing.");
            return;
        }

        new Thread(() -> {
            try {
                URL url = new URL(urlString);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Android; PalomarGYM)");
                connection.connect();

                int responseCode = connection.getResponseCode();
                // Handle manual HTTP redirects (301, 302, 307, 308)
                if (responseCode == HttpURLConnection.HTTP_MOVED_PERM ||
                    responseCode == HttpURLConnection.HTTP_MOVED_TEMP ||
                    responseCode == 307 || responseCode == 308) {
                    String redirectUrl = connection.getHeaderField("Location");
                    connection = (HttpURLConnection) new URL(redirectUrl).openConnection();
                    connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Android; PalomarGYM)");
                    connection.connect();
                }

                int fileLength = connection.getContentLength();
                File downloadDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (downloadDir != null && !downloadDir.exists()) {
                    downloadDir.mkdirs();
                }

                File outputFile = new File(downloadDir, fileName);
                if (outputFile.exists()) {
                    outputFile.delete();
                }

                InputStream input = connection.getInputStream();
                FileOutputStream output = new FileOutputStream(outputFile);

                byte[] buffer = new byte[8192];
                long total = 0;
                int bytesRead;
                long lastProgressTime = 0;

                while ((bytesRead = input.read(buffer)) != -1) {
                    total += bytesRead;
                    output.write(buffer, 0, bytesRead);

                    long now = System.currentTimeMillis();
                    // Throttle progress events to UI every 80ms
                    if (fileLength > 0 && (now - lastProgressTime > 80 || total == fileLength)) {
                        lastProgressTime = now;
                        int percent = (int) ((total * 100) / fileLength);
                        JSObject progress = new JSObject();
                        progress.put("percent", percent);
                        progress.put("loadedBytes", total);
                        progress.put("totalBytes", fileLength);
                        notifyListeners("downloadProgress", progress);
                    }
                }

                output.flush();
                output.close();
                input.close();

                launchInstaller(outputFile, call);

            } catch (Exception e) {
                call.reject("Download failed: " + e.getMessage(), e);
            }
        }).start();
    }

    private void launchInstaller(File apkFile, PluginCall call) {
        // 1. Validate 'Install Unknown Apps' permission on Android 8.0+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                settingsIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(settingsIntent);

                JSObject res = new JSObject();
                res.put("success", false);
                res.put("permissionRequired", true);
                res.put("message", "Please enable 'Allow from this source' and tap Download again to install.");
                call.resolve(res);
                return;
            }
        }

        // 2. Launch system package installer on top of app
        Uri apkUri = null;
        String packageName = getContext().getPackageName();
        try {
            apkUri = FileProvider.getUriForFile(
                getContext(),
                packageName + ".fileprovider",
                apkFile
            );
        } catch (Exception e1) {
            try {
                apkUri = FileProvider.getUriForFile(
                    getContext(),
                    packageName + ".appinstaller.fileprovider",
                    apkFile
                );
            } catch (Exception e2) {
                call.reject("FileProvider authority resolution failed: " + e2.getMessage(), e2);
                return;
            }
        }

        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(installIntent);

        JSObject res = new JSObject();
        res.put("success", true);
        res.put("permissionRequired", false);
        res.put("message", "Package installer started.");
        call.resolve(res);
    }
}