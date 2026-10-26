#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Moodboard Studio - servidor local.

Serve a interface web (pasta ./public) e oferece:
  * GET  /api/info                 -> capacidades do servidor (ffmpeg, encoder)
  * GET  /api/proxy?url=...        -> baixa imagens/GIFs/vídeos de links externos
                                      (evita o bloqueio de CORS no navegador)
  * POST /api/video/start          -> inicia uma codificação MP4/GIF com ffmpeg
  * POST /api/video/frame/<id>     -> envia um quadro JPEG
  * POST /api/video/finish/<id>    -> finaliza e devolve o arquivo
  * POST /api/video/cancel/<id>    -> cancela

Usa somente a biblioteca padrão do Python 3.8+.
Uso:  python server.py [--port 8765] [--no-browser]
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
MAX_DOWNLOAD = 100 * 1024 * 1024  # 100 MB por mídia
MAX_FRAME = 64 * 1024 * 1024  # 64 MB por quadro JPEG
JOB_TTL = 30 * 60  # descarta codificações abandonadas após 30 min
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)
CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


# --------------------------------------------------------------------------- #
# ffmpeg
# --------------------------------------------------------------------------- #
def find_ffmpeg() -> str | None:
    found = shutil.which("ffmpeg")
    if found:
        return found
    candidates = [
        r"C:\FFMPEG\bin\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        "/usr/local/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ]
    return next((c for c in candidates if os.path.isfile(c)), None)


FFMPEG = find_ffmpeg()

# Encoders H.264 em ordem de preferência (mpeg4 como último recurso).
ENCODER_ARGS = {
    "libx264": ["-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p"],
    "libopenh264": ["-c:v", "libopenh264", "-b:v", "25M", "-pix_fmt", "yuv420p"],
    "h264_mf": ["-c:v", "h264_mf", "-b:v", "25M", "-pix_fmt", "yuv420p"],
    "mpeg4": ["-c:v", "mpeg4", "-q:v", "2", "-pix_fmt", "yuv420p"],
}


def detect_encoder() -> str | None:
    if not FFMPEG:
        return None
    try:
        out = subprocess.run(
            [FFMPEG, "-hide_banner", "-encoders"],
            capture_output=True, text=True, timeout=20, creationflags=CREATE_NO_WINDOW,
        ).stdout
    except Exception:
        return None
    for name in ENCODER_ARGS:
        if re.search(rf"^\s*V\S*\s+{re.escape(name)}\s", out, re.M):
            return name
    return None


ENCODER = detect_encoder()


# --------------------------------------------------------------------------- #
# Download de mídia (proxy)
# --------------------------------------------------------------------------- #
class FetchError(Exception):
    pass


_INSECURE_CTX = ssl._create_unverified_context()  # usado só como fallback


def looks_like_media(data: bytes) -> bool:
    head = data[:16]
    return (
        head.startswith(b"\xff\xd8\xff")  # JPEG
        or head.startswith(b"\x89PNG")  # PNG / APNG
        or head.startswith(b"GIF8")  # GIF
        or (head[:4] == b"RIFF" and data[8:12] == b"WEBP")  # WEBP
        or data[4:8] == b"ftyp"  # MP4 / MOV / AVIF / HEIC
        or head.startswith(b"\x1aE\xdf\xa3")  # WEBM / MKV
        or head.startswith(b"BM")  # BMP
    )


def is_media(ctype: str, data: bytes) -> bool:
    c = ctype.split(";")[0].strip().lower()
    return looks_like_media(data) or c.startswith(("image/", "video/"))


def http_get(url: str) -> tuple[bytes, str, str]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise FetchError("Apenas links http(s) são suportados.")
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "image/avif,image/webp,image/apng,image/*,video/*,text/html;q=0.8,*/*;q=0.5",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        # Muitos CDNs bloqueiam hotlink sem Referer do próprio domínio.
        "Referer": f"{parsed.scheme}://{parsed.netloc}/",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        try:
            resp = urllib.request.urlopen(req, timeout=25)
        except urllib.error.URLError as e:
            if isinstance(getattr(e, "reason", None), ssl.SSLError):
                resp = urllib.request.urlopen(req, timeout=25, context=_INSECURE_CTX)
            else:
                raise
    except urllib.error.HTTPError as e:
        raise FetchError(f"O site de origem respondeu {e.code} ({e.reason}).") from e
    except urllib.error.URLError as e:
        raise FetchError(f"Não foi possível conectar ao site: {e.reason}") from e
    except TimeoutError as e:
        raise FetchError("Tempo esgotado ao baixar o link.") from e

    with resp:
        ctype = resp.headers.get("Content-Type", "application/octet-stream")
        length = resp.headers.get("Content-Length")
        if length and length.isdigit() and int(length) > MAX_DOWNLOAD:
            raise FetchError("Arquivo muito grande (limite de 100 MB).")
        data = resp.read(MAX_DOWNLOAD + 1)
        if len(data) > MAX_DOWNLOAD:
            raise FetchError("Arquivo muito grande (limite de 100 MB).")
        return data, ctype, resp.geturl()


_META_RE = re.compile(r"<meta\b[^>]*>", re.I)
_LINK_RE = re.compile(r"<link\b[^>]*>", re.I)
_ATTR_RE = re.compile(r"([a-zA-Z_:.-]+)\s*=\s*(\"([^\"]*)\"|'([^']*)')")


def _attrs(tag: str) -> dict[str, str]:
    return {
        m.group(1).lower(): (m.group(3) if m.group(3) is not None else m.group(4))
        for m in _ATTR_RE.finditer(tag)
    }


def extract_media_urls(page: str, base: str) -> list[str]:
    """Extrai a mídia principal de uma página (og:image, og:video, twitter:image...)."""
    found: dict[str, str] = {}
    for tag in _META_RE.findall(page):
        a = _attrs(tag)
        key = (a.get("property") or a.get("name") or "").lower()
        content = a.get("content")
        if key and content and key not in found:
            found[key] = html.unescape(content)
    for tag in _LINK_RE.findall(page):
        a = _attrs(tag)
        if a.get("rel", "").lower() == "image_src" and a.get("href"):
            found.setdefault("image_src", html.unescape(a["href"]))

    img = (found.get("og:image:secure_url") or found.get("og:image") or found.get("og:image:url")
           or found.get("twitter:image") or found.get("twitter:image:src") or found.get("image_src"))
    vid = found.get("og:video:secure_url") or found.get("og:video:url") or found.get("og:video")

    ordered: list[str] = []
    if img and re.search(r"\.(gif|webp)(\?|$)", img, re.I):
        ordered.append(img)  # GIF animado tem prioridade
    if vid and re.search(r"\.(mp4|webm)(\?|$)", vid, re.I):
        ordered.append(vid)
    if img:
        ordered.append(img)
    return [urllib.parse.urljoin(base, u) for u in dict.fromkeys(ordered)]


def normalize_url(url: str) -> str:
    url = url.strip()
    # imgur .gifv é uma página; o arquivo real é .mp4
    m = re.match(r"^(https?://i\.imgur\.com/\w+)\.gifv(\?.*)?$", url, re.I)
    if m:
        return m.group(1) + ".mp4"
    return url


def fetch_media(url: str) -> tuple[bytes, str, str]:
    data, ctype, final = http_get(normalize_url(url))
    if is_media(ctype, data):
        return data, ctype, final
    head = data[:512].lstrip().lower()
    if "html" in ctype.lower() or head.startswith((b"<!doctype", b"<html")):
        page = data.decode("utf-8", errors="replace")
        for candidate in extract_media_urls(page, final):
            try:
                d2, c2, f2 = http_get(candidate)
            except FetchError:
                continue
            if is_media(c2, d2):
                return d2, c2, f2
        raise FetchError(
            "O link é uma página sem imagem detectável. Use o endereço direto da imagem "
            "(botão direito na imagem > Copiar endereço da imagem)."
        )
    raise FetchError(f"O link não retornou uma imagem (tipo recebido: {ctype}).")


# --------------------------------------------------------------------------- #
# Codificação de vídeo
# --------------------------------------------------------------------------- #
class VideoJob:
    def __init__(self, fmt: str, fps: float):
        self.id = uuid.uuid4().hex
        self.fmt = fmt
        self.dir = tempfile.mkdtemp(prefix="moodboard_")
        self.out = os.path.join(self.dir, f"moodboard.{fmt}")
        self.log = open(os.path.join(self.dir, "ffmpeg.log"), "w+b")
        self.lock = threading.Lock()
        self.frames = 0
        self.touched = time.time()

        cmd = [
            FFMPEG, "-y", "-hide_banner", "-loglevel", "error",
            "-f", "image2pipe", "-framerate", f"{fps:g}", "-c:v", "mjpeg", "-i", "-",
        ]
        if fmt == "mp4":
            cmd += ["-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2"]
            cmd += ENCODER_ARGS[ENCODER]
            cmd += ["-r", f"{fps:g}", "-movflags", "+faststart", self.out]
        else:  # gif com paleta otimizada
            cmd += [
                "-vf", "split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a",
                "-loop", "0", self.out,
            ]
        self.proc = subprocess.Popen(
            cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=self.log,
            creationflags=CREATE_NO_WINDOW,
        )

    def error_text(self) -> str:
        try:
            self.log.flush()
            self.log.seek(0)
            return self.log.read().decode("utf-8", "replace").strip()[-1500:]
        except Exception:
            return ""

    def write(self, data: bytes) -> int:
        with self.lock:
            self.touched = time.time()
            if self.proc.poll() is not None:
                raise RuntimeError(self.error_text() or "O ffmpeg encerrou inesperadamente.")
            try:
                self.proc.stdin.write(data)
                self.proc.stdin.flush()
            except OSError as e:
                raise RuntimeError(self.error_text() or f"Falha ao enviar quadro ao ffmpeg: {e}") from e
            self.frames += 1
            return self.frames

    def finish(self) -> bytes:
        with self.lock:
            try:
                self.proc.stdin.close()
            except OSError:
                pass
            code = self.proc.wait(timeout=1800)
            if code != 0 or not os.path.exists(self.out) or os.path.getsize(self.out) == 0:
                raise RuntimeError(self.error_text() or f"O ffmpeg falhou (código {code}).")
            with open(self.out, "rb") as f:
                return f.read()

    def cleanup(self) -> None:
        try:
            if self.proc.poll() is None:
                self.proc.kill()
                self.proc.wait(timeout=10)
        except Exception:
            pass
        try:
            self.log.close()
        except Exception:
            pass
        shutil.rmtree(self.dir, ignore_errors=True)


JOBS: dict[str, VideoJob] = {}
JOBS_LOCK = threading.Lock()


def purge_stale_jobs() -> None:
    now = time.time()
    with JOBS_LOCK:
        stale = [jid for jid, job in JOBS.items() if now - job.touched > JOB_TTL]
        for jid in stale:
            JOBS.pop(jid).cleanup()


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
class Handler(SimpleHTTPRequestHandler):
    server_version = "MoodboardStudio/1.0"
    # No Windows o registro pode mapear .js para text/plain, o que quebra módulos ES.
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".webp": "image/webp",
        ".png": "image/png",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    # ---- utilidades ------------------------------------------------------- #
    def log_request(self, code="-", size="-"):
        path = self.path.split("?")[0]
        is_api = path.startswith("/api/") and "/frame/" not in path
        try:
            failed = int(code) >= 400
        except (TypeError, ValueError):
            failed = False
        if is_api or failed:
            sys.stdout.write(f"[{time.strftime('%H:%M:%S')}] {self.command} {path} -> {code}\n")
            sys.stdout.flush()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_bytes(self, status: int, data: bytes, ctype: str, extra: dict | None = None):
        try:
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def send_json(self, status: int, obj) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_bytes(status, body, "application/json; charset=utf-8")

    def read_body(self, limit: int) -> bytes:
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            raise ValueError("Corpo da requisição muito grande.")
        return self.rfile.read(length) if length else b""

    # ---- rotas ------------------------------------------------------------ #
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/info":
            return self.send_json(200, {
                "ok": True,
                "ffmpeg": bool(FFMPEG),
                "encoder": ENCODER,
                "formats": ["mp4", "gif"] if FFMPEG else [],
            })
        if parsed.path == "/api/proxy":
            return self.handle_proxy(urllib.parse.parse_qs(parsed.query))
        return super().do_GET()

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/video/start":
            return self.handle_video_start()
        m = re.fullmatch(r"/api/video/(frame|finish|cancel)/([0-9a-f]{32})", path)
        if not m:
            return self.send_json(404, {"error": "Rota não encontrada."})
        action, job_id = m.groups()
        with JOBS_LOCK:
            job = JOBS.get(job_id)
        if not job:
            return self.send_json(404, {"error": "Codificação não encontrada ou expirada."})
        if action == "frame":
            return self.handle_video_frame(job)
        if action == "finish":
            return self.handle_video_finish(job)
        with JOBS_LOCK:
            JOBS.pop(job_id, None)
        job.cleanup()
        return self.send_json(200, {"ok": True})

    def handle_proxy(self, query):
        url = (query.get("url") or [""])[0].strip()
        if not url:
            return self.send_json(400, {"error": "Parâmetro 'url' ausente."})
        try:
            data, ctype, final = fetch_media(url)
        except FetchError as e:
            return self.send_json(502, {"error": str(e)})
        except Exception as e:  # noqa: BLE001
            return self.send_json(502, {"error": f"Falha ao baixar: {e}"})
        safe_final = urllib.parse.quote(final, safe=":/?&=%#+@,;~!$*()'[]")
        self.send_bytes(200, data, ctype.split(";")[0].strip() or "application/octet-stream",
                        {"X-Final-Url": safe_final})

    def handle_video_start(self):
        purge_stale_jobs()
        try:
            payload = json.loads(self.read_body(64 * 1024) or b"{}")
        except (ValueError, json.JSONDecodeError):
            return self.send_json(400, {"error": "JSON inválido."})
        fmt = str(payload.get("format", "mp4")).lower()
        if fmt not in ("mp4", "gif"):
            return self.send_json(400, {"error": "Formato de vídeo inválido."})
        try:
            fps = float(payload.get("fps", 30))
        except (TypeError, ValueError):
            fps = 30.0
        fps = max(1.0, min(120.0, fps))
        if not FFMPEG:
            return self.send_json(503, {"error": "ffmpeg não encontrado. Instale-o ou adicione ao PATH."})
        if fmt == "mp4" and not ENCODER:
            return self.send_json(503, {"error": "O ffmpeg instalado não possui encoder de vídeo compatível."})
        try:
            job = VideoJob(fmt, fps)
        except Exception as e:  # noqa: BLE001
            return self.send_json(500, {"error": f"Não foi possível iniciar o ffmpeg: {e}"})
        with JOBS_LOCK:
            JOBS[job.id] = job
        self.send_json(200, {"id": job.id, "encoder": ENCODER if fmt == "mp4" else "gif"})

    def handle_video_frame(self, job: VideoJob):
        try:
            data = self.read_body(MAX_FRAME)
            if not data:
                return self.send_json(400, {"error": "Quadro vazio."})
            n = job.write(data)
        except Exception as e:  # noqa: BLE001
            return self.send_json(500, {"error": str(e)})
        self.send_json(200, {"ok": True, "frames": n})

    def handle_video_finish(self, job: VideoJob):
        with JOBS_LOCK:
            JOBS.pop(job.id, None)
        try:
            data = job.finish()
        except Exception as e:  # noqa: BLE001
            job.cleanup()
            return self.send_json(500, {"error": str(e)})
        job.cleanup()
        ctype = "video/mp4" if job.fmt == "mp4" else "image/gif"
        self.send_bytes(200, data, ctype)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    # No Windows, SO_REUSEADDR permite "roubar" uma porta já em uso; desligamos.
    allow_reuse_address = os.name != "nt"


def main() -> None:
    parser = argparse.ArgumentParser(description="Moodboard Studio - servidor local")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="não abrir o navegador")
    args = parser.parse_args()

    if not PUBLIC_DIR.is_dir():
        sys.exit(f"Pasta da interface não encontrada: {PUBLIC_DIR}")

    httpd, port = None, args.port
    for port in range(args.port, args.port + 20):
        try:
            httpd = Server(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if httpd is None:
        sys.exit("Nenhuma porta livre encontrada.")

    url = f"http://127.0.0.1:{port}/"
    print()
    print("  Moodboard Studio")
    print("  ----------------")
    print(f"  Abra no navegador:  {url}")
    if FFMPEG:
        print(f"  ffmpeg:             {FFMPEG} (encoder: {ENCODER or 'nenhum'})")
    else:
        print("  ffmpeg:             NAO encontrado (exportacao MP4/GIF desativada)")
    print("  Pressione Ctrl+C para encerrar.")
    print()

    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        with JOBS_LOCK:
            for job in JOBS.values():
                job.cleanup()
        httpd.server_close()


if __name__ == "__main__":
    main()
