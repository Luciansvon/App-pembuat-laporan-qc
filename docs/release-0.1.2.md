# Inspectra 0.1.2 beta

Rilis Windows x64 dan kandidat Android ARM64. Tanggal: 11 Oktober 2026.

## Perubahan

- Foto 1–6 menyesuaikan lebar isi sel, padding, rasio gambar, dan jumlah baris.
  Jumlah ganjil menempatkan foto terakhir di sel penuh terpusat. Batas tinggi
  menyisakan ruang untuk caption dan CAUSE/REPAIR/CAP.
- Paragraf pemisah tabel foto nested dipertahankan agar gambar tidak menutup
  border ISSUE. Kasus laporan pengguna direproduksi dan diverifikasi melalui Word.
- Android menangani konfirmasi hapus native, Back saat perubahan pending,
  pemilihan beberapa foto, kamera FileProvider, dan pembatalan callback.
- Simpan DOCX Android mempertahankan nama laporan dan memverifikasi SHA-256
  hasil baca ulang tujuan simpan. UI menunggu hasil berhasil/batal/gagal.
- Buka DOCX aktual lewat aplikasi dokumen di HP; jika aplikasi pembuka belum
  ada, tampilkan pesan yang dapat ditindaklanjuti.
- Kontrol Android memakai insets status/navigation bar, cutout dan keyboard;
  service worker PWA tidak diaktifkan dalam APK.
- Build desktop dapat memakai output terpisah di `.artifacts` untuk QC tanpa
  mengganggu aplikasi pengguna. Versi backend/frontend dan APK adalah 0.1.2.
- Pengemasan APK menghapus ekstensi MarkupSafe host yang opsional, memakai
  fallback Python resmi, dan menolak library dengan ABI yang tidak sesuai.
  Library ARM64 di dalam Python bundle juga diperiksa alignment ELF 16 KiB.

## Validasi dan penerimaan

Perbaikan layout telah lulus 37 tes backend, termasuk 12 regresi layout untuk
jumlah 1–6 pada issue/section, batas sel, rasio aspek dan baris ganjil. EXE
sebelum pengemasan rilis telah membuat serta merender laporan 1–5 foto melalui
API paket dan Microsoft Word dengan database QA terisolasi. Frontend memiliki
7 tes pesan error/hasil native dan build TypeScript strict/Vite.

Paket rilis dibangun dari source commit yang sama. SHA-256 dan manifest DEV-INFRA
mengikat berkas final; hasil CI, pemeriksaan paket final, dan unduhan ulang
dicatat pada halaman rilis setelah pemeriksaan selesai. Bukti DOCX/foto/database
QA tetap privat, tidak diunggah sebagai release asset.

## Batas beta

EXE belum ditandatangani digital; preview persis membutuhkan Word pada Windows.
APK memakai signing debug Inspectra yang stabil. Preview halaman internal APK,
pengujian HP fisik, kamera lengkap, cloud document provider, aplikasi Word/WPS,
offline tanpa koneksi, restart HP, dan penerimaan device belum dinyatakan lolos.
Hasil build, health check atau pengujian emulator tidak menggantikan bukti itu.
