# Local data

Runtime membuat `qc.sqlite3` di sini atau di `QC_DATA_DIR`.
Domain tables dan folder inspection/foto/output menyusul setelah STEP 6.
Jangan commit database, foto, output, atau backup. SQLite adalah sumber fakta;
inspection.json hanya snapshot export. Backup database aktif memakai SQLite backup API.
