"""Run the QC app on Windows with private, persistent user data."""
from __future__ import annotations

import os
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path


def configure_paths() -> None:
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")
    if getattr(sys, "frozen", False):
        os.environ["QC_RESOURCE_ROOT"] = str(Path(sys._MEIPASS))
        local_app_data = Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local")))
        # Keep the existing v0.1 data directory when the visible app name changes.
        os.environ.setdefault("QC_DATA_DIR", str(local_app_data / "QC Report Assistant" / "data"))
    else:
        root = Path(__file__).resolve().parents[1]
        os.environ.setdefault("QC_RESOURCE_ROOT", str(root))
        backend_dir = root / "backend"
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))


def wait_for_server(url: str, max_tries: int = 80) -> bool:
    for _ in range(max_tries):
        try:
            with urllib.request.urlopen(url + "api/health", timeout=1) as response:
                if response.status == 200:
                    return True
        except OSError:
            time.sleep(0.25)
    return False


def log_msg(msg: str) -> None:
    try:
        log_path = Path(os.environ.get("TEMP", ".")) / "qc_launcher.log"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def main() -> None:
    try:
        configure_paths()
        log_msg("Starting desktop launcher...")
        log_msg("Paths configured.")
        import uvicorn
        from app.main import create_app

        host = "127.0.0.1"
        port = 8765
        url = f"http://{host}:{port}/"
        use_browser = "--browser" in sys.argv

        log_msg(f"Initializing uvicorn server on {url}...")
        config = uvicorn.Config(create_app(), host=host, port=port, log_config=None, log_level="warning")
        server = uvicorn.Server(config)
        server_thread = threading.Thread(target=server.run, daemon=True)
        server_thread.start()
        log_msg("Server thread started.")

        if not use_browser:
            try:
                log_msg("Attempting to import webview...")
                import webview
                log_msg("webview imported successfully. Waiting for server...")
                # WebView2 blocks downloads unless pywebview opts in. DOCX uses
                # a local blob URL and presents the normal Windows save dialog.
                webview.settings["ALLOW_DOWNLOADS"] = True

                if wait_for_server(url):
                    log_msg("Server ready. Creating webview window...")
                    webview.create_window(
                        title="Inspectra",
                        url=url,
                        width=1280,
                        height=820,
                        min_size=(1024, 680),
                        text_select=True,
                    )
                    log_msg("Starting webview event loop...")
                    webview.start()
                    log_msg("Webview closed by user. Shutting down server...")
                    server.should_exit = True
                    sys.exit(0)
                else:
                    log_msg("Server did not become ready in time.")
            except Exception as e:
                import traceback
                log_msg(f"Webview error: {e}\n{traceback.format_exc()}")

        log_msg("Falling back to browser...")
        if wait_for_server(url):
            webbrowser.open(url)
            log_msg("Browser opened.")

        server_thread.join()
    except Exception as e:
        import traceback
        log_msg(f"Fatal launcher error: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
