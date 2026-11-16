import sqlite3
import tempfile
import unittest
from unittest import mock

import fitz
import ingest_drive_archive as ingest


class ArchiveIngestTests(unittest.TestCase):
    def test_inventory_follows_cursor_and_retains_completed_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = ingest.init_db(tmp + "/state.sqlite3")
            auth = mock.Mock()
            auth.get.return_value = "token"
            pages = [
                {"files": [{"id": "a", "name": "1.pdf", "mimeType": "application/pdf", "md5Checksum": "one"}], "nextPageToken": "page-two"},
                {"files": [{"id": "b", "name": "2.pdf", "mimeType": "application/pdf", "md5Checksum": "two"}]},
            ]
            with mock.patch.object(ingest, "list_files", side_effect=pages) as listing:
                self.assertEqual(ingest.inventory(db, auth, "folder"), 2)
                self.assertEqual(listing.call_args_list[1].args, ("token", "folder", "page-two"))
            db.execute("UPDATE files SET status='text_ready' WHERE id='a'")
            db.commit()
            with mock.patch.object(ingest, "list_files", side_effect=pages):
                ingest.inventory(db, auth, "folder")
            self.assertEqual(db.execute("SELECT status FROM files WHERE id='a'").fetchone()[0], "text_ready")
            db.close()

    def test_pdf_pages_and_worker_batch_offsets(self):
        pdf = fitz.open()
        page = pdf.new_page()
        page.insert_text((60, 60), "Comunicado de prueba")
        raw = pdf.tobytes()
        pdf.close()
        calls = []
        def post(url, token, **kwargs):
            body = kwargs["data"]
            calls.append(body)
            return {"ok": True, "passages_upserted": len(body["passages"])}
        with mock.patch.object(ingest, "download_pdf", return_value=raw), mock.patch.object(ingest, "request_json", side_effect=post):
            result = ingest.ingest_one(None, mock.Mock(get=lambda: "token"), "id", "1.pdf", "application/pdf", "md5", "https://worker.test", "x" * 32)
        self.assertEqual(result, (1, 1, "text_ready"))
        self.assertEqual(calls[0]["ordinal_start"], 0)
        self.assertEqual(calls[0]["document"]["stable_key"], "drive-file:id")
        self.assertEqual(calls[0]["passages"][0]["page_number"], 1)
        self.assertEqual([len(x) for x in ingest.batches([{"passage_text": "a"}] * 205)], [100, 100, 5])

    def test_large_document_uses_continuous_ordinals_and_retries_are_idempotent(self):
        posts = []
        passages = [{"page_number": 1, "passage_text": "a"}] * 205
        def post(url, token, **kwargs):
            posts.append(kwargs["data"])
            return {"ok": True, "passages_upserted": len(kwargs["data"]["passages"])}
        with mock.patch.object(ingest, "download_pdf", return_value=b"pdf"), \
             mock.patch.object(ingest, "extract_passages", return_value=(1, passages)), \
             mock.patch.object(ingest, "request_json", side_effect=post):
            result = ingest.ingest_one(None, mock.Mock(get=lambda: "token"), "id", "1.pdf", "application/pdf", "md5", "https://worker.test", "x" * 32)
        self.assertEqual(result, (1, 205, "text_ready"))
        self.assertEqual([p["ordinal_start"] for p in posts], [0, 100, 200])


if __name__ == "__main__":
    unittest.main()
