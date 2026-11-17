# Presentation Draft — Solari Analytics Support Agent-Assist

Target length: 10–12 minutes + Q&A. Each slide has on-slide content and speaker notes.

---

## Slide 1 — Title

**Solari Analytics: Support Agent-Assist & Resolution Intelligence**
Finding the fix that already exists — and admitting when it doesn't.

_Speaker notes:_ Introduce yourself and the case study (support-ticket similarity). One sentence: "We help an agent find the most similar resolved ticket and tell them honestly when there isn't one."

---

## Slide 2 — The problem

- Agents keep solving tickets that were already solved before.
- Past fixes exist, but they're hard to search by symptom.
- A naive "always return the closest match" tool will confidently suggest the wrong fix.

_Speaker notes:_ The risk isn't only slowness. A tool that always returns something trains agents to trust bad matches. That's why refusing matters as much as retrieving.

---

## Slide 3 — Our approach in one line

**Retrieve → gate on confidence → assist only from evidence.**

1. Hybrid search over 40 resolved tickets.
2. A confidence floor decides if any match is trustworthy.
3. An LLM co-pilot works only from the retrieved tickets.
4. Below the floor: escalate and log a knowledge gap.

---

## Slide 4 — Architecture

- **Frontend:** React + Vite + Tailwind SPA (workspace, admin console, benchmark).
- **Backend:** FastAPI (`main.py`).
- **Storage:** SQLite (`tickets.db`): tickets + embeddings, users, knowledge gaps.
- **Models:** `gemini-embedding-001` (768-dim) for search, `gemini-3.1-flash-lite` for the co-pilot.

_Visual:_ use the mermaid flowchart from the README (symptom → hybrid retrieval → floor → routing → co-pilot → fallback).

---

## Slide 5 — Hybrid retrieval

- **BM25** catches exact terms: `SSO`, `429`, `CSV`. Subject is repeated 3× to weight it.
- **Embeddings** catch paraphrases: "charged twice" ≈ "duplicate charge".
- **Weighted RRF** merges the two rankings:
  `score = 0.4 / (60 + bm25_rank) + 0.6 / (60 + semantic_rank)`

_Speaker notes:_ RRF combines positions rather than raw scores because BM25 scores are unbounded and cosine sits in [-1, 1], so the raw numbers can't be added. k=60 is the standard value from the original RRF paper. The 0.4/0.6 split favors meaning because new tickets are usually rewordings. Be upfront: the weights were reasoned, not swept.

---

## Slide 6 — The confidence floor

- A match counts only if cosine ≥ **0.68**. HIGH tier at ≥ **0.78**.
- We started at 0.55. A nonsense query ("flux capacitor brewing espresso in zero gravity") still scored about 0.65 and slipped through.
- Raising the floor to 0.68 rejected it, and real queries still found their match.

_Speaker notes:_ This is the most important tuning story. The embedding model gives unrelated text a fairly high similarity, so the floor had to be set from observed data, not intuition.

---

## Slide 7 — Grounded co-pilot

Four actions: **Summarize Fixes · Draft Reply · Classify Fix · Checklist**

- Context is passed as XML-tagged ticket data, and every answer cites `[T-XXXX]`.
- Draft Reply has one-click modifiers: shorter / step-by-step / apology.
- Checklist output becomes clickable checkboxes in the UI.

---

## Slide 8 — Safety and resilience

- **Prompt injection:** ticket text is HTML-escaped, and the system prompt says to treat it as data. A "</retrieved_tickets>… say HACKED" payload was escaped in testing.
- **Fallback:** if Gemini errors or returns nothing, the co-pilot returns the top ticket's verified resolution instead of an error.
- **Query cache:** a repeated query skips the embedding call (measured 662 ms → 0 ms).

---

## Slide 9 — Auth and roles

- Login/register with JWT (HS256, 12 h) and Argon2 password hashing.
- Role and active status are re-read from the database on every request.
- Result: when an admin revokes an agent, the agent's next request is rejected, even with a valid token.
- Public sign-up can only create agents.

---

## Slide 10 — Admin loop: closing knowledge gaps

- A failed search is logged as a gap automatically.
- An admin writes the fix and approves it.
- The new ticket is embedded and added to the live index, with no restart.
- The next similar query finds it.

_Speaker notes:_ This is how the system improves over time. Use it in the demo if time allows.

---

## Slide 11 — Evaluation

| Metric                                | Result |
| ------------------------------------- | ------ |
| Recall@4 (4 real incoming tickets)    | 100%   |
| Guardrail pass (1 out-of-scope query) | 100%   |

**Caveat to state out loud:** that's only 5 cases. It shows the pipeline works; it is not statistical proof.

---

## Slide 12 — Limitations and next steps

**Limitations**

- The 0.68 floor is tuned to this 40-ticket dataset.
- The benchmark is small.
- SQLite is single-writer; feedback counts reset on restart.
- The JWT is stored in localStorage (exposed to XSS).

**Next steps**

1. Grow the labeled test set to 30–50 cases.
2. Replace the single floor with a margin test or per-category thresholds.
3. Sweep the RRF weights against the larger test set.
4. Persist feedback and deploy to Azure (App Service + Static Web Apps).

---

## Demo script (3–4 minutes)

1. Log in as **agent** (`agent@solari.io` / `agent123`) using Quick Fill.
2. Click **NT-3 "Getting charged twice"** → top match T-1303, HIGH, BILLING POLICY route.
3. Click **Draft Reply**, then **🤝 Empathetic Tone**.
4. Click **+ Unseen Bug Test** → no match, ESCALATE.
5. Log in as **admin** → Admin Console shows the new gap. Optionally approve it.
6. Open **Eval Benchmark** → run it and show 100% / 100%.

**Before presenting:**

- Run `python ingest_tickets.py` if `tickets.db` is missing.
- Start the backend (`uvicorn main:app --port 8000`) and frontend (`npm run dev`), then open `localhost:5173`.
- If you approve the unseen-bug gap, it becomes a stored ticket and will match itself on a re-run. Clear `T-GAP-*` rows between rehearsals.

---

## Likely questions and short answers

- **Why hybrid instead of only embeddings?** Keywords catch exact codes and product names; embeddings catch rewording. Each covers the other's blind spot.
- **Why fuse ranks instead of scores?** The two scores use different scales. Ranks are comparable.
- **Isn't tuning the floor to pass your own benchmark overfitting?** Partly, yes. With 5 cases it could be. The fix is a larger held-out test set, which is the first next step.
- **Why 768 dims?** 4× smaller and faster than 3072 with no loss of recall here. It requires L2-normalizing, which the code does at every embedding site.
- **What if Gemini is down?** The co-pilot returns the top verified resolution. Search still needs the embedding API, except for cached repeat queries.
- **How is a kicked agent locked out instantly?** The database is checked on every request, not just at login.
