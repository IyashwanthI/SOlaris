"""
search_by_id.py

Given a ticket_id, find the top-N most similar resolved tickets in tickets.db
using hybrid retrieval: BM25 keyword scoring + Gemini embedding cosine
similarity, fused with weighted Reciprocal Rank Fusion (RRF).

Usage:
    python search_by_id.py T-1001
    python search_by_id.py            # prompts for a ticket_id interactively

Environment:
    GEMINI_API_KEY must be set (directly or via a .env file).
"""

import json
import os
import re
import sqlite3
import sys
from pathlib import Path

import numpy as np
from rank_bm25 import BM25Okapi

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from google import genai
from google.genai import types

# --- Configuration ------------------------------------------------------------

DB_PATH = Path(__file__).resolve().parent / "tickets.db"
JSON_PATH = Path(__file__).resolve().parent / "tickets.json"
# The starter kit ships tickets.json under starter_kit/data/; fall back to it.
JSON_FALLBACK = Path(__file__).resolve().parent / "starter_kit" / "data" / "tickets.json"
# New/incoming tickets (open, unresolved) used as queries.
NEW_TICKETS_PATH = Path(__file__).resolve().parent / "new_tickets_example.json"
NEW_TICKETS_FALLBACK = (
    Path(__file__).resolve().parent / "starter_kit" / "data" / "new_tickets_example.json"
)

EMBED_MODEL = "gemini-embedding-001"
EMBED_DIM = 768

RRF_K = 60
BM25_WEIGHT = 0.4
SEMANTIC_WEIGHT = 0.6

COSINE_FLOOR = 0.55
HIGH_TIER = 0.75


# --- Text formatting ----------------------------------------------------------

def format_ticket_text(ticket):
    """Structured symptom string matching the ingest-time embedding format."""
    tags = ticket.get("tags", []) or []
    return (
        f"Category: {ticket.get('category', '')} "
        f"| Tags: {', '.join(tags)} "
        f"| Subject: {ticket.get('subject', '')} "
        f"| Description: {ticket.get('description', '')}"
    )


def bm25_document_tokens(ticket):
    """Tokenize a ticket for BM25, repeating subject 3x to boost keyword match."""
    tags = ticket.get("tags", []) or []
    subject = ticket.get("subject", "")
    text = " ".join(
        [
            ticket.get("category", ""),
            " ".join(tags),
            subject,
            subject,
            subject,
            ticket.get("description", ""),
        ]
    )
    # Strip punctuation so tokens match cleanly (e.g. "re-sync" -> "re", "sync").
    return re.findall(r"\b\w+\b", text.lower())


# --- Data loading -------------------------------------------------------------

def load_indexed_tickets():
    """Load all resolved tickets from tickets.db, returning rows + embedding matrix."""
    if not DB_PATH.exists():
        raise SystemExit(f"Database not found: {DB_PATH}. Run ingest_tickets.py first.")

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.execute(
            """
            SELECT ticket_id, category, subject, description,
                   resolution_notes, tags, created_at, embedding
            FROM resolved_tickets
            """
        )
        rows = cursor.fetchall()
    finally:
        conn.close()

    tickets = []
    vectors = []
    for row in rows:
        (
            ticket_id,
            category,
            subject,
            description,
            resolution_notes,
            tags_json,
            created_at,
            embedding_blob,
        ) = row

        vec = np.frombuffer(embedding_blob, dtype=np.float32)
        if vec.shape != (EMBED_DIM,):
            raise ValueError(
                f"Ticket {ticket_id} has embedding shape {vec.shape}, "
                f"expected ({EMBED_DIM},)"
            )

        tickets.append(
            {
                "ticket_id": ticket_id,
                "category": category,
                "subject": subject,
                "description": description,
                "resolution_notes": resolution_notes,
                "tags": json.loads(tags_json) if tags_json else [],
                "created_at": created_at,
            }
        )
        vectors.append(vec)

    doc_matrix = (
        np.vstack(vectors).astype(np.float32)
        if vectors
        else np.zeros((0, EMBED_DIM), dtype=np.float32)
    )
    return tickets, doc_matrix


def _load_json_array(primary, fallback):
    """Load a tickets array from the first existing path (primary then fallback)."""
    for path in (primary, fallback):
        if path.exists():
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            return data.get("tickets", data.get("new_tickets", []))
    return []


def load_json_tickets():
    """Load resolved tickets.json (root path, then starter-kit path)."""
    return _load_json_array(JSON_PATH, JSON_FALLBACK)


def load_new_tickets():
    """Load incoming new_tickets_example.json (root path, then starter-kit path)."""
    return _load_json_array(NEW_TICKETS_PATH, NEW_TICKETS_FALLBACK)


def find_query_ticket(ticket_id, indexed_tickets):
    """Look up the query ticket across new tickets, tickets.json, then the DB.

    New/incoming tickets (e.g. NT-*) only carry ticket_id/subject/description;
    the embedding formatter tolerates the missing category/tags fields.
    """
    for ticket in load_new_tickets():
        if ticket.get("ticket_id") == ticket_id:
            return ticket
    for ticket in load_json_tickets():
        if ticket.get("ticket_id") == ticket_id:
            return ticket
    for ticket in indexed_tickets:
        if ticket["ticket_id"] == ticket_id:
            return ticket
    return None


# --- Embeddings ---------------------------------------------------------------

def l2_normalize(vec):
    vec = np.asarray(vec, dtype=np.float32)
    norm = np.linalg.norm(vec)
    return vec if norm == 0.0 else vec / norm


def embed_query(client, text):
    """Embed the query ticket text as a RETRIEVAL_QUERY and L2-normalize it."""
    response = client.models.embed_content(
        model=EMBED_MODEL,
        contents=text,
        config=types.EmbedContentConfig(
            task_type="RETRIEVAL_QUERY",
            output_dimensionality=EMBED_DIM,
        ),
    )
    return l2_normalize(response.embeddings[0].values)


# --- Hybrid retrieval ---------------------------------------------------------

def confidence_tier(cosine_sim):
    return "HIGH" if cosine_sim >= HIGH_TIER else "MEDIUM"


def get_top_similar_tickets(ticket_id: str, top_k: int = 4) -> list[dict]:
    """Return the top_k most similar resolved tickets for the given ticket_id.

    Each result dict contains: rank, ticket_id, category, subject,
    confidence_pct, confidence_tier, rrf_score, cosine_sim, resolution_notes.

    Raises KeyError if the ticket_id cannot be found in tickets.json or tickets.db.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("GEMINI_API_KEY is not set. Export it or add it to a .env file.")

    indexed_tickets, doc_matrix = load_indexed_tickets()

    query_ticket = find_query_ticket(ticket_id, indexed_tickets)
    if query_ticket is None:
        raise KeyError(
            f"Ticket '{ticket_id}' not found in new_tickets_example.json, "
            f"tickets.json, or tickets.db."
        )

    # Candidate set: every indexed ticket except the query itself.
    candidate_indices = [
        i for i, t in enumerate(indexed_tickets) if t["ticket_id"] != ticket_id
    ]
    if not candidate_indices:
        return []

    client = genai.Client(api_key=api_key)
    query_vec = embed_query(client, format_ticket_text(query_ticket))

    # Semantic (cosine) scores. Vectors are already L2-normalized, so the dot
    # product is cosine similarity.
    cosine_all = doc_matrix @ query_vec

    # BM25 scores over all documents.
    bm25 = BM25Okapi([bm25_document_tokens(t) for t in indexed_tickets])
    bm25_all = bm25.get_scores(bm25_document_tokens(query_ticket))

    # Rank the candidates (higher score = better = rank 0) for each signal.
    semantic_order = sorted(candidate_indices, key=lambda i: cosine_all[i], reverse=True)
    bm25_order = sorted(candidate_indices, key=lambda i: bm25_all[i], reverse=True)

    semantic_rank = {idx: rank for rank, idx in enumerate(semantic_order)}
    bm25_rank = {idx: rank for rank, idx in enumerate(bm25_order)}

    # Weighted Reciprocal Rank Fusion + cosine confidence floor.
    scored = []
    for idx in candidate_indices:
        cosine_sim = float(cosine_all[idx])
        if cosine_sim < COSINE_FLOOR:
            continue
        rrf_score = (
            BM25_WEIGHT / (RRF_K + bm25_rank[idx])
            + SEMANTIC_WEIGHT / (RRF_K + semantic_rank[idx])
        )
        scored.append((idx, rrf_score, cosine_sim))

    scored.sort(key=lambda x: x[1], reverse=True)

    results = []
    for rank, (idx, rrf_score, cosine_sim) in enumerate(scored[:top_k], start=1):
        ticket = indexed_tickets[idx]
        results.append(
            {
                "rank": rank,
                "ticket_id": ticket["ticket_id"],
                "category": ticket["category"],
                "subject": ticket["subject"],
                "confidence_pct": round(cosine_sim * 100, 1),
                "confidence_tier": confidence_tier(cosine_sim),
                "rrf_score": round(rrf_score, 6),
                "cosine_sim": round(cosine_sim, 4),
                "resolution_notes": ticket["resolution_notes"],
            }
        )
    return results


# --- CLI / pretty printing ----------------------------------------------------

def print_results(ticket_id, results):
    print(f"\nTop matches for ticket {ticket_id}:\n" + "=" * 60)
    if not results:
        print("No similar resolved tickets found above confidence threshold")
        return

    for r in results:
        print(
            f"\n#{r['rank']}  [{r['confidence_tier']}]  {r['ticket_id']}  "
            f"({r['category']})"
        )
        print(f"    Subject         : {r['subject']}")
        print(f"    Confidence      : {r['confidence_pct']}%")
        print(f"    RRF score       : {r['rrf_score']}")
        print(f"    Resolution notes: {r['resolution_notes']}")


def main():
    if len(sys.argv) > 1:
        ticket_id = sys.argv[1].strip()
    else:
        ticket_id = input("Enter ticket_id: ").strip()

    if not ticket_id:
        print("No ticket_id provided.")
        sys.exit(1)

    try:
        results = get_top_similar_tickets(ticket_id, top_k=4)
    except KeyError as exc:
        print(str(exc))
        sys.exit(1)

    print_results(ticket_id, results)


if __name__ == "__main__":
    main()
