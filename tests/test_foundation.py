"""Check meaningful foundation boundaries, without claiming domain acceptance."""
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings, load_settings
from app.main import create_app


def test_health_connects_real_sqlite_and_reports_capabilities(tmp_path: Path) -> None:
    application = create_app(Settings(data_dir=tmp_path))
    with TestClient(application) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json()["database"] == "connected"
        assert response.json()["capabilities"] == {"inspections": True, "docx": True, "offline_pwa": False}
        with application.state.engine.connect() as connection:
            assert connection.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
            assert connection.execute(text("PRAGMA journal_mode")).scalar_one() == "wal"
    assert (tmp_path / "qc.sqlite3").is_file()


def test_file_persists_between_application_restarts(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path)
    # Private test table is not a domain model or production migration.
    first = create_app(settings)
    with TestClient(first):
        with first.state.engine.begin() as connection:
            connection.execute(text("CREATE TABLE persistence_probe (value TEXT NOT NULL)"))
            connection.execute(text("INSERT INTO persistence_probe VALUES ('retained')"))
    second = create_app(settings)
    with TestClient(second) as client:
        assert client.get("/api/health").status_code == 200
        with second.state.engine.connect() as connection:
            assert connection.execute(text("SELECT value FROM persistence_probe")).scalar_one() == "retained"


def test_health_returns_unavailable_for_database_error(tmp_path: Path) -> None:
    application = create_app(Settings(data_dir=tmp_path))
    class UnavailableEngine:
        def connect(self):
            from sqlalchemy.exc import OperationalError
            raise OperationalError("SELECT 1", {}, Exception("unavailable"))
    with TestClient(application) as client:
        application.state.engine = UnavailableEngine()
        response = client.get("/api/health")
        assert response.status_code == 503
        assert response.json() == {"detail": "Local database unavailable"}


def test_cors_excludes_unapproved_origin(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        allowed = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
        blocked = client.get("/api/health", headers={"Origin": "https://unapproved.example"})
        assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert "access-control-allow-origin" not in blocked.headers


def test_config_rejects_wildcard_origins(monkeypatch) -> None:
    import pytest
    monkeypatch.setenv("QC_ALLOWED_ORIGINS", "*")
    with pytest.raises(ValueError, match="explicit origins"):
        load_settings()


def test_trusted_host_blocks_unapproved_hosts(tmp_path: Path) -> None:
    with TestClient(create_app(Settings(data_dir=tmp_path))) as client:
        allowed_ip = client.get("/api/health", headers={"Host": "127.0.0.1"})
        assert allowed_ip.status_code == 200
        allowed_local = client.get("/api/health", headers={"Host": "localhost"})
        assert allowed_local.status_code == 200
        blocked = client.get("/api/health", headers={"Host": "evil.com"})
        assert blocked.status_code == 400


def test_config_rejects_wildcard_hosts(monkeypatch) -> None:
    import pytest
    monkeypatch.setenv("QC_ALLOWED_HOSTS", "*")
    with pytest.raises(ValueError, match="explicit hosts"):
        load_settings()
