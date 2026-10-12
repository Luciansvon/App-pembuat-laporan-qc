# Perintah Uji untuk Agen Lain — SHA `663d8f1`

Tanggal: 12 Oktober 2026. Cabang: `fix-dimensi-rapih`.
Target uji: commit persis `663d8f1bf50b389a4e2c8110b67fe21d9f685b4d`
(feat layout foto per-section 1–8 kolom). Jangan uji commit lain.

## Aturan keras (dari Bima)

1. **Tanpa push, tag, rilis, atau build EXE sebelum Bima acc.** Build hanya lewat `/acc-build <SHA>` oleh Bima.
2. Jangan ubah kode di cabang ini. Kalau temukan bug, catat sebagai temuan + bukti, jangan commit perbaikan ke sini.
3. Database asli (`data/qc.sqlite3`) jangan disentuh. Uji hidup hanya dengan `QC_DATA_DIR` sementara.
4. Hasil tulis ke `.artifacts/qa-663d8f1/` (di-ignore Git) + ringkasan ke Bima. Foto privat, database, dan video QA tetap di luar Git.

## Langkah 1 — Uji otomatis (wajib hijau semua)

Dari root repo:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/ -q
```

```powershell
cd frontend; npx tsc --noEmit; cd ..
```

Fokus baru di `tests/test_photo_layout.py`: `row_spans`, render kolom 1/3/4/8,
merge baris sisa, validasi PATCH layout, alir layout ke DOCX + determinisme,
dimension 4 kolom. Migrasi baru `c4f1a2b8d3e5` harus lolos
`tests/test_packaged_migrations.py`.

## Langkah 2 — Uji hidup (server + DB sementara)

Server kemungkinan masih menyala: backend `http://127.0.0.1:8000`,
tampilan `http://127.0.0.1:5174`, DB temp `live-qa-1449450`. Kalau mati,
nyalakan ulang persis seperti ini:

```powershell
$env:QC_DATA_DIR = "C:\Users\shint\AppData\Local\Temp\opencode\live-qa-1449450"
Start-Process .\.venv\Scripts\python.exe -ArgumentList "-m","uvicorn","app.main:app","--app-dir","backend","--host","127.0.0.1","--port","8000"
```

```powershell
cd frontend; npm run dev -- --port 5174 --host 127.0.0.1
```

Daftar periksa (bukti screenshot + DOCX tiap poin):

1. Tab Photos → pemilih "Layout laporan 1–8 foto/baris" per section; ganti lalu reload — pilihan bertahan.
2. Product View 7 foto dengan layout 3 → 3+3+1, baris sisa di tengah; caption tiap baris terpusat pemisah `|`.
3. Dimension Length 2 foto dengan layout 4 → sebar 2+2; label ukuran tetap di atas.
4. Layout 0 / 9 / section asing via API → 422.
5. Validate bersih → DOCX: Product Dimension di halaman baru; baris DIM/BOX rapih segaris.
6. Sidebar tampil foto QC kursi (`/rail-qc.jpg` HTTP 200), bukan ilustrasi.
7. PATCH foto ke `section=DIMENSION` tanpa `measurement_id` → 422.
8. Upload ke section RADIUS/GAP_SLIDE/CORNER/TRIAL_BACKREST (customer POLIFORM) → 201.
9. Unduh DOCX dua kali → byte identik.

## Langkah 3 — Matikan dan lapor

```powershell
Stop-Process -Name python -Force; Stop-Process -Name node -Force
```

Lapor ke Bima: tabel LULUS/GAGAL per poin + bukti + SHA yang diuji.
Disusun oleh OpenCode — Muse Spark untuk diteruskan ke agen penguji.
