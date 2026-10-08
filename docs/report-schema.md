# Kontrak laporan Inspectra

Dokumen referensi QC asli dan audit detailnya disimpan privat di luar Git.
File template bersih di `templates/` berisi placeholder tanpa foto atau nilai
historis. `templates/catalog.json` memilih template; generator tidak mempunyai
cabang bisnis khusus per customer.

## Header setiap halaman

| Data | Aturan |
| --- | --- |
| DESC, CUSTOMER | Snapshot nama saat inspeksi, agar perubahan master tidak mengubah laporan lama |
| INSPECT, DATE/DATE-LOC, QC | Input inspeksi; format tanggal dan label mengikuti konfigurasi template |
| PO | Teks utuh, termasuk koma jika ada beberapa nomor |
| QTY, AQL | Nilai dan label asal; AQL belum diberi interpretasi statistik otomatis |
| DIM(mm), BOX(mm) | Standar header, terpisah dari hasil ukur aktual; axis mengikuti template |

Header Word mempunyai border dan merged cells. Lebarnya dinormalisasi ke area
isi 18 cm agar rata dengan tabel body. Font judul, label, dan nilai dibuat
seimbang tanpa memotong nilai panjang. Header berulang pada seluruh halaman.

## Section dan foto

Section yang didukung antara lain Product View, Detail, Drawing, Dimension,
MC, Gloss, Swatch, dan Other. Foto diurutkan menurut `sort_order` lalu ID,
disimpan di filesystem lokal dan dipertahankan rasio aspeknya. Satu foto
mengisi row penuh secara terpusat; pasangan foto memakai dua kolom.
Caption yang diisi QC tampil pada baris terpusat setelah foto atau pasangan
foto. Dua caption berbeda tetap tampil dengan pemisah `|`.

Konfigurasi `combined_blocks` dapat menempatkan satu Drawing dan hingga dua
foto Dimension dalam satu bingkai. Section lain mengikuti alur halaman Word,
tanpa page break paksa per section. Halaman Word yang sudah dirender menjadi
preview per halaman sehingga QC dapat melihat pemisahan yang sebenarnya.

## Pengukuran dan test

Standar produk, pembacaan aktual, toleransi, dan hasil tetap field terpisah.
Reading individual membentuk range min–max; range impor yang tidak memiliki
reading tidak boleh menciptakan reading buatan. Tanpa toleransi lengkap,
result adalah INFO, bukan otomatis FAIL. Catatan kondisi pengukuran dan unit
harus berasal dari input QC.

## Issue

Setiap issue disusun sebagai satu tabel: row `ISSUE | jenis [quantity]`, row
foto merged, lalu row `CAUSE`, `REPAIR`, dan `CAP`. Quantity kosong tetap
kosong; status repair tidak disimpulkan dari teks rencana perbaikan. Saat ini
setiap issue dimulai pada halaman baru agar tiga row terakhir tetap bersama
foto. Caption di tengah setelah setiap pasangan foto mendukung teks ukuran
atau penjelasan lokal seperti pada layout rujukan pengguna.

## Conclusion dan preview

Conclusion menggunakan teks inspeksi yang telah dikonfirmasi QC. Generator
tidak menambahkan PASS, telah repaired, atau persetujuan pabrik tanpa input.
DOCX deterministik untuk input yang sama. Preview desktop dibuat dari DOCX
aktual melalui Microsoft Word read-only dan PDFium, bukan mock layout. Preview
persis ini membutuhkan Windows dengan Word; renderer setara untuk APK mandiri
masih terbuka.
