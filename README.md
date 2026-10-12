# Inspectra

Aplikasi lokal untuk mencatat inspeksi furnitur dan membuat laporan Word.
v0.1.3 menambahkan dua foto per ukuran dimension pada rilis Windows. APK Android
publik saat ini masih v0.1.2. Alur inspeksi tetap lokal, tanpa layanan AI atau
cloud saat dipakai di laptop QC.

## Unduh versi beta

| Perangkat | Berkas | Cara pakai |
| --- | --- | --- |
| Windows x64 | [`Inspectra.exe` v0.1.3](https://github.com/Luciansvon/App-pembuat-laporan-qc/releases/tag/v0.1.3-desktop-beta.1) | Unduh lalu jalankan; portable tanpa installer |
| HP Android ARM64, Android 7+ | [`Inspectra-0.1.2-arm64.apk`](https://github.com/Luciansvon/App-pembuat-laporan-qc/releases/tag/v0.1.2-beta.1) | Pasang APK; timpa instalasi lama untuk mempertahankan data |
| Verifikasi unduhan Windows | [`SHA256SUMS.txt` dan manifest v0.1.3](https://github.com/Luciansvon/App-pembuat-laporan-qc/releases/tag/v0.1.3-desktop-beta.1) | Cocokkan hash EXE |
| Verifikasi unduhan Android | [`SHA256SUMS.txt` dan manifest v0.1.2](https://github.com/Luciansvon/App-pembuat-laporan-qc/releases/tag/v0.1.2-beta.1) | Cocokkan hash APK |

EXE belum ditandatangani digital. APK memakai signing debug Inspectra yang
stabil untuk beta, bukan signing produksi. Jangan uninstall APK saat memperbarui
jika ingin mempertahankan database dan foto di HP.

## Foto adaptif

**Rilis Windows v0.1.3** menambahkan dua foto per ukuran dimension: Length, Width,
Depth, Height, dan label lain masing-masing mempunyai pasangan sendiri.
Tambahkan ukuran di Photos atau Measurement, lalu isi kedua slot fotonya.
Foto dimension lama tetap ada dan perlu dipilih ukurannya; DOCX/preview ditahan
jika pasangan belum lengkap. APK publik belum menyertakan perubahan ini.

Foto menyesuaikan jumlah dan ruang sel tabel, tetap proporsional tanpa crop.
Susunan 1–6 foto: **1**, **2**, **2+1**, **2+2**, **2+2+1**, **2+2+2**.
Foto terakhir pada jumlah ganjil berada di sel penuh terpusat. Batas tinggi
mengikuti jumlah baris agar caption dan CAUSE/REPAIR/CAP tetap mendapat ruang;
gambar tidak menutup garis ISSUE. Standar, toleransi dan hasil ukur tetap
terpisah; tanpa toleransi lengkap, hasil adalah INFO, bukan otomatis FAIL.

## Preview dan penyimpanan

| Fitur | Windows EXE | Android APK beta |
| --- | --- | --- |
| Generate DOCX | Generator lokal | Generator di dalam APK |
| Preview halaman dalam Inspectra | Memerlukan Microsoft Word terpasang | Belum tersedia |
| Lihat laporan di aplikasi dokumen | Buka DOCX hasil simpan | **Buka DOCX di Word/WPS**; perlu aplikasi pembuka di HP |
| Simpan laporan | Dialog simpan Windows | Dialog dokumen Android; hasil dibaca kembali dan dicocokkan SHA-256 |
| Lokasi data | `%LOCALAPPDATA%/QC Report Assistant/data` | Penyimpanan privat aplikasi di HP |

APK membundel backend Python, SQLite, foto dan generator di perangkat.
Pengujian emulator membuktikan startup, API lokal, upload foto, DOCX, dan data
lama setelah pembaruan. HP fisik, kamera lengkap, provider dokumen, aplikasi
pembuka, offline tanpa koneksi dan restart HP masih perlu pengujian.
Word/WPS Android menampilkan DOCX lewat aplikasi eksternal, bukan renderer
halaman internal Inspectra. PWA hanya menyimpan shell; offline edit/replay
belum tersedia. Backup harus mencakup SQLite dan foto bersama.

Referensi yang dipakai: POLIFORM LAGOON (22 halaman, 121 gambar) dan RH MARB
(18 halaman, 97 gambar). Keduanya dibuka read-only dan dirender melalui Microsoft Word;
file asli tidak diubah. Dokumen `Issue_Baru_Tambahan_Temuan_QC_2026-10-07.docx`
telah digantikan oleh RH sebagai referensi laporan.

## Hasil

- [Schema report aktual](docs/report-schema.md): header, section, measurement, issue, temuan pagination.
- [Arsitektur](docs/architecture.md): SQLite, foto lokal, API, report, DEV-INFRA, batas PWA Android.
- [Evidence pemeriksaan](docs/verification.md): tes, build, Word visual, browser, dan batas bukti.
- [Perbaikan dan evidence v0.1.1](docs/release-0.1.1.md): autosave, nomor inspeksi, validasi angka dan release desktop beta.
- [Catatan v0.1.2](docs/release-0.1.2.md): foto adaptif, paket Windows/Android dan batas penerimaan.
- `frontend/`: React + TypeScript + Vite, alur QC responsif, kamera/file picker, autosave dan PWA shell.
- `backend/`: FastAPI + SQLite/SQLModel + Alembic, CRUD, foto, review, DOCX.
- `assets/`: ikon Windows dan Android yang diberikan pemilik proyek.
- `templates/catalog.json`: mapping customer ke tiga template DOCX bersih dan siap.

Angka pada inspeksi dibuat dari input QC. Data `QA_TEST` dan contoh Word di `.artifacts/`
adalah fixture uji, bukan data inspeksi asli. Foto sumber lama tidak otomatis masuk
laporan baru.

## Jalankan di Windows

Gunakan Python 3.13 dan Node 22.12+ atau 24. Instalasi dependency pertama perlu
internet; workflow inspeksi lokal tidak memanggil cloud.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock
cd frontend
npm ci
```

Terminal backend, dari root project:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Terminal frontend:

```powershell
cd frontend
npm run dev
```

Buka `http://127.0.0.1:5173` saat pengembangan. API docs: `http://127.0.0.1:8000/docs`.
Untuk PWA produksi di laptop, jalankan `npm run build` di `frontend/`, lalu buka
`http://127.0.0.1:8000/` setelah backend aktif. Service worker berlaku pada origin
produksi tersebut dan menyimpan shell; penyuntingan tanpa server belum tersedia.
Pengaturan opsional: `QC_DATA_DIR` dan `QC_ALLOWED_ORIGINS` (daftar dipisahkan koma).
Migrasi database berjalan saat backend mulai. Data utama ada di `data/qc.sqlite3`;
foto disimpan di `data/inspections/`. Backup perlu database dan foto bersama.

Pada tab Review & Report, tombol **Preview tiap halaman** merender DOCX yang sama
melalui Microsoft Word dan menampilkan JPEG tiap halaman. Fitur preview persis
ini memerlukan Windows dengan Microsoft Word terpasang. Hasil preview disimpan
di folder output lokal, bukan SQLite; perubahan inspeksi menghasilkan preview
baru. DOCX tetap dapat dibuat tanpa Word.

Paket Windows dibuat dengan `powershell -File tools/build_desktop.ps1` dan keluar
sebagai `.artifacts/desktop/Inspectra.exe`. Data pengguna paket Windows tetap
di `%LOCALAPPDATA%/QC Report Assistant/data` agar inspeksi dari nama lama tidak
hilang. APK Android membundel backend lokal dan generator sendiri; build memakai
workflow manual yang sudah ada. Lihat [panduan Android](android/README.md).
Preview halaman internal APK dan penerimaan HP fisik belum selesai.

## Verifikasi

```powershell
.\.venv\Scripts\python.exe -m pytest tests -v --junitxml=.artifacts/backend-tests.xml
cd frontend
npm test
npm run build
```

Untuk inspeksi ulang referensi dengan Python yang memiliki python-docx:

```powershell
python tools/inspect_docx.py templates/references/poliform.docx docs/evidence/poliform
python tools/inspect_docx.py templates/references/rh.docx docs/evidence/rh
```

Evidence lokal dan reference binary sengaja di-ignore. Template bersih yang ada di
repo cukup untuk membuat laporan baru; salin referensi privat hanya jika ingin
mengulangi audit dengan SHA-256 pada schema.

PWA pernah terpasang di emulator Android, tetapi capture foto selesai belum
terbukti. LAN HTTPS tepercaya dan offline write/replay masih memerlukan uji
perangkat serta implementasi tambahan. Jangan memakai HTTP IP
LAN untuk uji install PWA. Lihat batas bukti di `docs/verification.md`.

