# Eksperimen APK mandiri Inspectra

Ini adalah jalur build debug untuk membuktikan bahwa backend Python dan SQLite
dapat berjalan di dalam APK melalui WebView lokal. Belum menjadi paket Android
yang diterima pengguna. Build manual GitHub Actions memilih `x86_64` untuk MuMu
atau `arm64-v8a` untuk HP fisik, memakai python-for-android `v2026.05.09` pada
commit `58d21141f17c889bf8585f5665921d72028f8831`.
`android/requirements.txt` memuat dependensi runtime transitif secara eksplisit
karena python-for-android memasang modul Python dengan `--no-deps`.

`tools/prepare_android.py` menyalin hanya backend aplikasi, migrasi, frontend
terbangun, dan template DOCX bersih ke payload privat di `.artifacts/`. Data
SQLite dan foto saat runtime ditaruh di `ANDROID_PRIVATE/inspectra-data`, bukan
di laptop QC. Pintu lokal WebView memakai `127.0.0.1:5000` di perangkat.
Patch khusus di `android/patches/webview.patch` memberi WebView pemilih berkas
dan jalur simpan DOCX melalui dialog dokumen Android. Kamera memakai aplikasi
kamera perangkat dan FileProvider yang hanya membagikan subfolder cache capture.

APK dari runner memakai debug key sementara. Sebelum menguji pembaruan lokal,
jalankan `tools/sign_android_debug.ps1 -InputApk <apk>` agar semua kandidat lokal
memakai debug key Inspectra yang sama di profil pengguna. Kunci ini tetap privat
di luar repo, bukan kunci rilis produksi. Pembaruan berikutnya memakai `adb install -r`
agar SQLite dan foto tetap ada; jangan uninstall paket yang sedang diuji pengguna.

Hal yang masih harus dibuktikan lewat APK di MuMu: app launch, SQLite setelah
restart, unggah foto dari pemilih/kamera, pembuatan DOCX, simpan DOCX, dan
preview halaman tanpa Microsoft Word. Endpoint preview Windows memberi error
yang jelas di Android sampai renderer khusus perangkat tersedia.
