# APK mandiri Inspectra 0.1.2 (beta)

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
Patch di `android/patches/webview.patch` menghubungkan bootstrap dengan
`android/java/InspectraBridge.java`. WebView hanya meneruskan operasi native dari
origin aplikasi `http://127.0.0.1:5000`. Kamera memakai aplikasi kamera perangkat
dan FileProvider dengan akses terbatas ke cache capture/reports. Pemilih mendukung
beberapa foto; pembatalan kamera/pemilih mengembalikan callback kosong.

Simpan DOCX memakai dialog dokumen Android, mempertahankan nama laporan dari
server dan membandingkan SHA-256 berkas yang dibaca kembali dari tujuan simpan.
Frontend menunggu hasil native sebelum menampilkan berhasil, batal, atau gagal;
navigasi dikunci selama proses. Konfirmasi hapus berjalan sebagai dialog native.
Tombol Back kembali ke daftar dan menahan perubahan yang belum tersimpan. Insets
Android 15 menjaga kontrol dari status bar, navigation bar, cutout, dan keyboard.
Service worker PWA tidak diaktifkan di APK: app shell sudah dibundel di perangkat.

Tombol **Buka DOCX di Word/WPS** membuka berkas laporan aktual lewat aplikasi
dokumen yang tersedia di HP. Ini bukan renderer halaman Word internal. Jika
aplikasi pembuka belum terpasang, tampilkan pesan yang bisa ditindaklanjuti;
Simpan DOCX tetap tersedia.

APK final dari runner masih unsigned: setelah build, `tools/finalize_android.py`
menghapus ekstensi MarkupSafe host yang opsional dan memeriksa ABI seluruh
library native, termasuk Python bundle. MarkupSafe memakai fallback Python
resminya. ARM64 juga harus memiliki alignment ELF 16 KiB; ZIP di-align sebelum
signing. Paket mentah tidak boleh langsung dirilis. Sebelum menguji pembaruan lokal,
jalankan `tools/sign_android_debug.ps1 -InputApk <apk>` agar semua kandidat lokal
memakai debug key Inspectra yang sama di profil pengguna. Kunci ini tetap privat
di luar repo, bukan kunci rilis produksi. Pembaruan berikutnya memakai `adb install -r`
agar SQLite dan foto tetap ada; jangan uninstall paket yang sedang diuji pengguna.

Paket x86_64 sudah dibangun lokal dan diperbarui di MuMu Android 15 tanpa
uninstall. API di dalam APK telah membuktikan database lama bertahan, inspeksi
baru, upload foto, validasi, serta DOCX berisi gambar dan CAUSE/REPAIR/CAP.
Bukti privat disimpan di `.artifacts/android-perfect-20261011/`.
Uji sentuh kamera, pembatalan, simpan ke provider dokumen, dan aplikasi pembuka
masih perlu diselesaikan; alat uiautomator MuMu mengalami crash saat audit.
Build ARM64 dan pengujian HP fisik merupakan bukti terpisah dari hasil x86_64.
