"""
ingest_tickets.py

Read resolved support tickets from tickets.json, compute Gemini embeddings for
their symptom text, and store them in a local SQLite database (tickets.db).

Usage:
    python ingest_tickets.py

Environment:
    GEMINI_API_KEY must be set (directly or via a .env file).
"""

import json
import os
import sqlite3
import time

import numpy as np

try:
    # Optional: load GEMINI_API_KEY from a .env file if python-dotenv is present.
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from google import genai
from google.genai import types

# --- Configuration ------------------------------------------------------------

TICKETS_JSON = os.path.join("starter_kit", "data", "tickets.json")
DB_PATH = "tickets.db"

EMBED_MODEL = "gemini-embedding-001"
EMBED_TASK_TYPE = "RETRIEVAL_DOCUMENT"
EMBED_DIM = 768
BATCH_SIZE = 20

MAX_RETRIES = 5
BASE_BACKOFF_SECONDS = 2.0


# --- Data loading & formatting ------------------------------------------------

def load_resolved_tickets(path):
    """Load tickets.json and return only resolved tickets with resolution notes."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    tickets = data.get("tickets", [])
    resolved = [
        t
        for t in tickets
        if t.get("status") == "resolved" and (t.get("resolution_notes") or "").strip()
    ]
    return resolved


def format_symptom_text(ticket):
    """Build the structured symptom string used for embedding.

    Deliberately excludes resolution_notes so incoming symptom queries match
    historical symptoms cleanly rather than their solutions.
    """
    tags = ticket.get("tags", []) or []
    return (
        f"Category: {ticket.get('category', '')} "
        f"| Tags: {', '.join(tags)} "
        f"| Subject: {ticket.get('subject', '')} "
        f"| Description: {ticket.get('description', '')}"
    )


# --- Embeddings ---------------------------------------------------------------

def l2_normalize(vec):
    """L2-normalize a 1-D vector; required when truncating below 3072 dims."""
    vec = np.asarray(vec, dtype=np.float32)
    norm = np.linalg.norm(vec)
    if norm == 0.0:
        return vec
    return vec / norm


def embed_batch(client, texts):
    """Embed a batch of texts with retry/backoff; return a list of np.float32 vectors."""
    config = types.EmbedContentConfig(
        task_type=EMBED_TASK_TYPE,
        output_dimensionality=EMBED_DIM,
    )

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = client.models.embed_content(
                model=EMBED_MODEL,
                contents=texts,
                config=config,
            )
            vectors = []
            for embedding in response.embeddings:
                vec = l2_normalize(embedding.values)
                if vec.shape != (EMBED_DIM,):
                    raise ValueError(
                        f"Unexpected embedding shape {vec.shape}, expected ({EMBED_DIM},)"
                    )
                vectors.append(vec)
            return vectors
        except Exception as exc:  # noqa: BLE001 - surface API/rate-limit errors uniformly
            last_error = exc
            backoff = BASE_BACKOFF_SECONDS * (2 ** (attempt - 1))
            print(
                f"  [retry {attempt}/{MAX_RETRIES}] embedding batch failed: {exc} "
                f"-> waiting {backoff:.1f}s"
            )
            time.sleep(backoff)

    raise RuntimeError(f"Failed to embed batch after {MAX_RETRIES} attempts") from last_error


# --- Database -----------------------------------------------------------------

def init_db(conn):
    """Create the resolved_tickets table if it does not already exist."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS resolved_tickets (
            ticket_id        TEXT PRIMARY KEY,
            category         TEXT,
            subject          TEXT,
            description      TEXT,
            resolution_notes TEXT,
            tags             TEXT,
            created_at       TEXT,
            embedding        BLOB
        )
        """
    )
    conn.commit()


def upsert_ticket(conn, ticket, embedding):
    """Insert or replace a single ticket row with its embedding."""
    conn.execute(
        """
        INSERT OR REPLACE INTO resolved_tickets
            (ticket_id, category, subject, description,
             resolution_notes, tags, created_at, embedding)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ticket.get("ticket_id"),
            ticket.get("category"),
            ticket.get("subject"),
            ticket.get("description"),
            ticket.get("resolution_notes"),
            json.dumps(ticket.get("tags", []) or []),
            ticket.get("created_at"),
            embedding.astype(np.float32).tobytes(),
        ),
    )


# --- Verification -------------------------------------------------------------

def sanity_check(conn):
    """Read back one row and verify its embedding deserializes to shape (768,)."""
    row = conn.execute(
        "SELECT ticket_id, embedding FROM resolved_tickets LIMIT 1"
    ).fetchone()
    if row is None:
        print("Sanity check: no rows found in resolved_tickets.")
        return

    ticket_id, blob = row
    vec = np.frombuffer(blob, dtype=np.float32)
    print(
        f"Sanity check: ticket {ticket_id} embedding shape = {vec.shape} "
        f"(expected ({EMBED_DIM},)), L2 norm = {np.linalg.norm(vec):.4f}"
    )
    assert vec.shape == (EMBED_DIM,), f"Embedding shape mismatch: {vec.shape}"


# --- Main ---------------------------------------------------------------------

def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit(
            "GEMINI_API_KEY is not set. Export it or add it to a .env file."
        )

    client = genai.Client(api_key=api_key)

    print(f"Loading tickets from {TICKETS_JSON} ...")
    resolved = load_resolved_tickets(TICKETS_JSON)
    print(f"Found {len(resolved)} resolved tickets with resolution notes.")

    conn = sqlite3.connect(DB_PATH)
    try:
        init_db(conn)

        indexed = 0
        for start in range(0, len(resolved), BATCH_SIZE):
            batch = resolved[start : start + BATCH_SIZE]
            texts = [format_symptom_text(t) for t in batch]

            batch_num = start // BATCH_SIZE + 1
            print(f"Embedding batch {batch_num} ({len(batch)} tickets) ...")
            vectors = embed_batch(client, texts)

            for ticket, vec in zip(batch, vectors):
                upsert_ticket(conn, ticket, vec)
                indexed += 1

            conn.commit()

        print(f"\nIndexed {indexed} tickets into {DB_PATH}.")
        sanity_check(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
