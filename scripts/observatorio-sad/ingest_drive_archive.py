#!/usr/bin/env python3
"""On-demand, resumable ABC/SAD Drive archive ingest. Never writes PDF bytes to disk.

Requires PyMuPDF (`pip install pymupdf`). Set GOOGLE_DRIVE_ACCESS_TOKEN or
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN. For uploads,
set OBSERVATORIO_SAD_URL and OBSERVATORIO_SAD_PRIVATE_TOKEN. Keep credentials
out of the repository and command-line arguments.
"""

import argparse
import hashlib
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

FOLDER_ID = "1z8OWN92P-F5hi_YsxMaLWCw_kidqpXSJ"
SOURCE = {"source_key": "abc-sad-drive-archive", "source_type": "drive_archive",
          "name": "Archivo histórico ABC/SAD en Google Drive",
          "canonical_url": f"https://drive.google.com/drive/folders/{FOLDER_ID}",
          "officiality": "manual", "metadata": {"folder_id": FOLDER_ID}}


def request_json(url, token, *, method="GET", data=None, retries=6):
    payload = None if data is None else json.dumps(data).encode("utf-8")
    for attempt in range(retries):
        request = urllib.request.Request(url, data=payload, method=method,
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                raw = response.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            body = error.read(1024).decode("utf-8", "replace")
            if error.code not in (429, 500, 502, 503, 504) or attempt == retries - 1:
                raise RuntimeError(f"HTTP {error.code} on {url.split('?')[0]}: {body}") from error
            delay = min(60, 2 ** attempt)
            time.sleep(delay)
    raise AssertionError("unreachable")


class GoogleToken:
    def __init__(self):
        self.access = os.environ.get("GOOGLE_DRIVE_ACCESS_TOKEN")
        self.client_id = os.environ.get("GOOGLE_CLIENT_ID")
        self.client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        self.refresh = os.environ.get("GOOGLE_REFRESH_TOKEN")
        self.expires = 0
        if not self.access and not all((self.client_id, self.client_secret, self.refresh)):
            raise RuntimeError("Falta token de Drive u OAuth refresh configurado en el entorno")

    def get(self):
        if self.access and (not self.refresh or time.time() < self.expires - 120):
            return self.access
        body = urllib.parse.urlencode({"client_id": self.client_id,
            "client_secret": self.client_secret, "refresh_token": self.refresh,
            "grant_type": "refresh_token"}).encode()
        with urllib.request.urlopen(urllib.request.Request(
                "https://oauth2.googleapis.com/token", data=body, method="POST"), timeout=30) as response:
            result = json.load(response)
        self.access = result["access_token"]
        self.expires = time.time() + int(result.get("expires_in", 3600))
        return self.access


def list_files(token, folder_id, page_token=None):
    params = {"q": f"'{folder_id}' in parents and trashed = false",
              "pageSize": "1000", "fields": "nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime,webViewLink)",
              "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"}
    if page_token:
        params["pageToken"] = page_token
    return request_json("https://www.googleapis.com/drive/v3/files?" + urllib.parse.urlencode(params), token)


def download_pdf(token, file_id):
    url = "https://www.googleapis.com/drive/v3/files/" + urllib.parse.quote(file_id, safe="") + "?alt=media"
    for attempt in range(6):
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                length = int(response.headers.get("Content-Length", "0"))
                if length > 50 * 1024 * 1024:
                    raise ValueError("PDF supera 50 MiB; requiere procesamiento separado")
                data = response.read(50 * 1024 * 1024 + 1)
                if len(data) > 50 * 1024 * 1024:
                    raise ValueError("PDF supera 50 MiB; requiere procesamiento separado")
                return data
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 5:
                raise
            time.sleep(min(60, 2 ** attempt))
    raise AssertionError("unreachable")


def passage_chunks(text, max_chars=7000):
    """Split on line boundaries where possible, preserving every character."""
    while text:
        end = min(len(text), max_chars)
        if end < len(text):
            split = text.rfind("\n", end // 2, end)
            if split > 0:
                end = split + 1
        chunk, text = text[:end], text[end:]
        if chunk.strip():
            yield chunk


def extract_passages(pdf_bytes):
    import fitz
    result = []
    with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
        for number, page in enumerate(document, 1):
            for chunk in passage_chunks(page.get_text("text")):
                result.append({"page_number": number, "passage_text": chunk})
        return len(document), result


def batches(passages, max_count=100, max_bytes=600000):
    batch, size = [], 0
    for passage in passages:
        n = len(passage["passage_text"].encode("utf-8"))
        if batch and (len(batch) == max_count or size + n > max_bytes):
            yield batch
            batch, size = [], 0
        batch.append(passage)
        size += n
    if batch:
        yield batch


def init_db(path):
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, name TEXT, mime TEXT, md5 TEXT, size INTEGER, status TEXT NOT NULL DEFAULT 'pending', error TEXT, seen INTEGER NOT NULL DEFAULT 0)")
    if "seen" not in [row[1] for row in db.execute("PRAGMA table_info(files)")]:
        db.execute("ALTER TABLE files ADD COLUMN seen INTEGER NOT NULL DEFAULT 0")
    db.commit()
    return db


def inventory(db, auth, folder_id):
    page_token, count = None, 0
    db.execute("UPDATE files SET seen=0")
    db.commit()
    while True:
        page = list_files(auth.get(), folder_id, page_token)
        for item in page.get("files", []):
            db.execute("INSERT INTO files(id,name,mime,md5,size,seen) VALUES(?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,mime=excluded.mime,md5=excluded.md5,size=excluded.size,seen=1,status=CASE WHEN files.md5 IS excluded.md5 THEN files.status ELSE 'pending' END,error=CASE WHEN files.md5 IS excluded.md5 THEN files.error ELSE NULL END",
                       (item["id"], item["name"], item["mimeType"], item.get("md5Checksum"), int(item.get("size", 0))))
        db.commit()
        count += len(page.get("files", []))
        print(f"Inventario: {count} archivos revisados", file=sys.stderr)
        next_token = page.get("nextPageToken")
        if not next_token:
            break
        if next_token == page_token:
            raise RuntimeError("Drive repitió el cursor de página")
        page_token = next_token
    return count


def ingest_one(db, auth, file_id, name, mime, md5, worker_url, worker_token):
    if mime != "application/pdf":
        raise ValueError(f"Formato pendiente de extractor: {mime}")
    pdf = download_pdf(auth.get(), file_id)
    digest = hashlib.sha256(pdf).hexdigest()
    pages, passages = extract_passages(pdf)
    document = {"stable_key": f"drive-file:{file_id}", "version_hash": digest,
                "title": name, "document_type": "comunicado", "mime_type": mime,
                "source_url": f"https://drive.google.com/file/d/{file_id}/view",
                "drive_file_id": file_id, "page_count": pages,
                "extraction_status": "text_ready" if passages else "ocr_required",
                "metadata": {"title_unverified": True, "drive_md5": md5}}
    pieces = list(batches(passages)) or [[]]
    for ordinal_start, batch in ((sum(map(len, pieces[:i])), p) for i, p in enumerate(pieces)):
        body = {"source": SOURCE, "document": document, "ordinal_start": ordinal_start, "passages": batch}
        if len(json.dumps(body).encode()) > 1024 * 1024:
            raise ValueError("Lote supera 1 MiB del Worker")
        response = request_json(worker_url.rstrip("/") + "/api/observatorio-sad/ingest", worker_token,
                                method="POST", data=body)
        if response.get("ok") and response.get("skipped_existing"):
            return pages, 0, "text_ready"
        if not response.get("ok") or response.get("passages_upserted") != len(batch):
            raise RuntimeError("El Worker no confirmó el lote completo")
    return pages, len(passages), document["extraction_status"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", default="observatorio-sad-ingest.sqlite3")
    parser.add_argument("--inventory-only", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="máximo de documentos por ejecución; 0 = todos")
    args = parser.parse_args()
    auth, db = GoogleToken(), init_db(args.state)
    try:
        inventory(db, auth, FOLDER_ID)
        if args.inventory_only:
            return
        worker_url = os.environ.get("OBSERVATORIO_SAD_URL", "")
        worker_token = os.environ.get("OBSERVATORIO_SAD_PRIVATE_TOKEN", "")
        if not worker_url.startswith("https://") or len(worker_token) < 32:
            raise RuntimeError("Faltan URL HTTPS y token privado del Worker")
        rows = db.execute("SELECT id,name,mime,md5 FROM files WHERE seen=1 AND status IN ('pending','error') ORDER BY id").fetchall()
        for i, (file_id, name, mime, md5) in enumerate(rows):
            if args.limit and i >= args.limit:
                break
            try:
                pages, passages, status = ingest_one(db, auth, file_id, name, mime, md5, worker_url, worker_token)
                db.execute("UPDATE files SET status=?,error=NULL WHERE id=?", (status, file_id))
                print(f"OK {file_id}: {pages} páginas, {passages} pasajes, {status}", file=sys.stderr)
            except Exception as error:
                db.execute("UPDATE files SET status='error',error=? WHERE id=?", (str(error)[:500], file_id))
                print(f"ERROR {file_id}: {error}", file=sys.stderr)
            db.commit()
        print(dict(db.execute("SELECT status,count(*) FROM files WHERE seen=1 GROUP BY status").fetchall()))
    finally:
        db.close()


if __name__ == "__main__":
    main()
