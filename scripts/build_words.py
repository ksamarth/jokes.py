#!/usr/bin/env python3
"""Build the El Poop word data file (dictionary + daily target pool).

Reads a Scrabble-style word list (ENABLE1) and a word-frequency list,
filters both to four-letter words, builds a one-letter-change word-ladder
graph, finds every word reachable from POOP, and picks a curated set of
common words as the pool of daily targets (each tagged with its "par" --
the shortest possible number of steps from POOP).

Output: web/data/words.json, consumed directly by the frontend.
"""
import json
import random
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "scripts" / "sources"
ENABLE_PATH = SOURCES / "enable1_4letter.txt"
FREQ_PATH = SOURCES / "freq_4letter.txt"
OUT_PATH = ROOT / "web" / "data" / "words.json"

START = "poop"
EPOCH = "2026-07-02"  # puzzle #1
MIN_PAR = 3
MAX_PAR = 9
TARGET_POOL_SIZE = 500
SHUFFLE_SEED = 20260702

# Common informal/modern words that ENABLE1 lacks but players expect to work.
ADDITIONS = {
    "boop", "blog", "bork", "burb", "derp", "doot", "faff", "glam", "grok",
    "guac", "jank", "meep", "meme", "mosh", "naff", "nerf", "newb", "noob",
    "nano", "mega", "giga", "poot", "sesh", "spam", "vape", "vlog", "welp",
    "wiki", "yeet", "yolo",
}

# Words that shouldn't appear as guesses or, especially, as daily targets.
BLOCKLIST = {
    "anal", "anus", "arse", "clit", "cock", "crap", "cunt", "dago", "dick",
    "dike", "dyke", "fart", "fuck", "gash", "gook", "gypo", "homo", "hore",
    "jerk", "jizz", "kike", "kunt", "muff", "nazi", "piss", "poof", "porn",
    "puss", "shag", "shit", "slut", "smeg", "spic", "suck", "twat", "wank",
    "whore", "wog", "coon", "fag", "fags", "negro", "raped", "rape",
}


def load_words(path, min_len=None, max_len=None):
    words = []
    with path.open() as f:
        for line in f:
            w = line.strip().lower()
            if not w or not w.isalpha():
                continue
            if min_len and len(w) < min_len:
                continue
            if max_len and len(w) > max_len:
                continue
            words.append(w)
    return words


def build_graph(words):
    buckets = {}
    for w in words:
        for i in range(len(w)):
            key = w[:i] + "_" + w[i + 1:]
            buckets.setdefault(key, []).append(w)
    graph = {w: set() for w in words}
    for bucket in buckets.values():
        if len(bucket) < 2:
            continue
        for a in bucket:
            for b in bucket:
                if a != b:
                    graph[a].add(b)
    return graph


def bfs_distances(graph, start):
    dist = {start: 0}
    q = deque([start])
    while q:
        cur = q.popleft()
        for nxt in graph[cur]:
            if nxt not in dist:
                dist[nxt] = dist[cur] + 1
                q.append(nxt)
    return dist


def main():
    enable_4 = ({w for w in load_words(ENABLE_PATH, 4, 4)} | ADDITIONS) - BLOCKLIST
    enable_4.add(START)
    assert START in enable_4

    freq_words = load_words(FREQ_PATH)
    freq_4 = [w for w in freq_words if len(w) == 4]
    freq_rank = {w: i for i, w in enumerate(freq_4)}

    graph = build_graph(enable_4)
    dist = bfs_distances(graph, START)
    print(f"dictionary size: {len(enable_4)}")
    print(f"reachable from '{START}': {len(dist)}")

    candidates = [
        w for w in dist
        if w != START
        and w in freq_rank
        and MIN_PAR <= dist[w] <= MAX_PAR
    ]
    candidates.sort(key=lambda w: freq_rank[w])
    candidates = candidates[:TARGET_POOL_SIZE]
    print(f"target pool: {len(candidates)}")

    rng = random.Random(SHUFFLE_SEED)
    rng.shuffle(candidates)

    targets = [{"word": w, "par": dist[w]} for w in candidates]

    data = {
        "epoch": EPOCH,
        "start": START,
        "dictionary": sorted(enable_4),
        "targets": targets,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
