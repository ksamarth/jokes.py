(() => {
  "use strict";

  const STATE_KEY = "elpoop_state_v1";
  const STATS_KEY = "elpoop_stats_v1";
  const MS_PER_DAY = 86400000;

  const els = {
    puzzleNumber: document.getElementById("puzzle-number"),
    targetWord: document.getElementById("target-word"),
    board: document.getElementById("board"),
    toast: document.getElementById("toast"),
    undoBtn: document.getElementById("undo-btn"),
    parValue: document.getElementById("par-value"),
    keyboard: document.getElementById("keyboard"),
    winPanel: document.getElementById("win-panel"),
    winTitle: document.getElementById("win-title"),
    winSummary: document.getElementById("win-summary"),
    winGrid: document.getElementById("win-grid"),
    shareBtn: document.getElementById("share-btn"),
    countdown: document.getElementById("countdown"),
    helpBtn: document.getElementById("help-btn"),
    statsBtn: document.getElementById("stats-btn"),
    helpModal: document.getElementById("help-modal"),
    statsModal: document.getElementById("stats-modal"),
    statPlayed: document.getElementById("stat-played"),
    statWinpct: document.getElementById("stat-winpct"),
    statStreak: document.getElementById("stat-streak"),
    statMaxstreak: document.getElementById("stat-maxstreak"),
    statsHistory: document.getElementById("stats-history"),
  };

  const KEYBOARD_ROWS = [
    "qwertyuiop".split(""),
    "asdfghjkl".split(""),
    ["ENTER", ..."zxcvbnm".split(""), "BACK"],
  ];

  let game = null; // populated once word data loads

  function todayUTC() {
    const now = new Date();
    return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function puzzleInfoFor(data) {
    const epochMs = Date.parse(data.epoch + "T00:00:00Z");
    const dayIndex = Math.floor((todayUTC() - epochMs) / MS_PER_DAY);
    const idx = ((dayIndex % data.targets.length) + data.targets.length) % data.targets.length;
    const t = data.targets[idx];
    return {
      puzzleNumber: dayIndex + 1,
      dayIndex,
      target: t.word,
      par: t.par,
    };
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STATE_KEY));
    } catch {
      return null;
    }
  }

  function saveState(state) {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function loadStats() {
    try {
      const s = JSON.parse(localStorage.getItem(STATS_KEY));
      if (s) return s;
    } catch {
      /* ignore */
    }
    return { played: 0, won: 0, currentStreak: 0, maxStreak: 0, lastWonPuzzle: null, history: [] };
  }

  function saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add("visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => els.toast.classList.remove("visible"), 1800);
  }

  function diffPositions(a, b) {
    const positions = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) positions.push(i);
    }
    return positions;
  }

  function renderBoard() {
    const { ladder, target, status } = game;
    els.board.innerHTML = "";

    ladder.forEach((word, i) => {
      const prev = i > 0 ? ladder[i - 1] : null;
      const changedPositions = prev ? diffPositions(prev, word) : [];
      els.board.appendChild(buildRow(word, target, changedPositions, false));
    });

    if (status === "playing") {
      const activeRow = buildRow(
        game.draft.padEnd(4, " "),
        target,
        [],
        true
      );
      activeRow.classList.add("active");
      els.board.appendChild(activeRow);
    }

    els.board.scrollTop = els.board.scrollHeight;
    els.undoBtn.disabled = ladder.length <= 1 || status !== "playing";
  }

  function buildRow(word, target, changedPositions, isDraft) {
    const row = document.createElement("div");
    row.className = "row";
    for (let i = 0; i < 4; i++) {
      const ch = word[i];
      const tile = document.createElement("div");
      tile.className = "tile";
      if (ch && ch !== " ") {
        tile.textContent = ch;
        tile.classList.add("filled");
      }
      if (!isDraft && ch && ch.toLowerCase() === target[i]) {
        tile.classList.add("match");
      }
      if (changedPositions.includes(i)) {
        tile.classList.add("changed");
      }
      row.appendChild(tile);
    }
    return row;
  }

  function shakeActiveRow() {
    const rows = els.board.querySelectorAll(".row");
    const active = rows[rows.length - 1];
    if (!active) return;
    active.classList.remove("shake");
    void active.offsetWidth;
    active.classList.add("shake");
  }

  function submitDraft() {
    const guess = game.draft.toLowerCase();
    const prev = game.ladder[game.ladder.length - 1];

    if (guess.length !== 4) {
      showToast("Enter 4 letters");
      shakeActiveRow();
      return;
    }
    if (!game.dictionary.has(guess)) {
      showToast("Not in word list");
      shakeActiveRow();
      return;
    }
    const positions = diffPositions(prev, guess);
    if (positions.length === 0) {
      showToast("Change a letter first");
      shakeActiveRow();
      return;
    }
    if (positions.length > 1) {
      showToast("Change exactly one letter");
      shakeActiveRow();
      return;
    }
    if (game.ladder.includes(guess)) {
      showToast("Already used that word");
      shakeActiveRow();
      return;
    }

    game.ladder.push(guess);
    game.draft = "";
    saveState(currentStateSnapshot());

    if (guess === game.target) {
      finishGame();
    } else {
      renderBoard();
    }
  }

  function currentStateSnapshot() {
    return {
      puzzleNumber: game.puzzleNumber,
      ladder: game.ladder,
      status: game.status,
    };
  }

  function finishGame() {
    game.status = "won";
    saveState(currentStateSnapshot());
    recordWinStats();
    renderBoard();
    showWinPanel();
  }

  function recordWinStats() {
    const stats = loadStats();
    if (stats.lastWonPuzzle === game.puzzleNumber) return; // already recorded
    stats.played += 1;
    stats.won += 1;
    stats.currentStreak = stats.lastWonPuzzle === game.puzzleNumber - 1 ? stats.currentStreak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
    stats.lastWonPuzzle = game.puzzleNumber;
    stats.history.unshift({
      puzzleNumber: game.puzzleNumber,
      steps: game.ladder.length - 1,
      par: game.par,
    });
    stats.history = stats.history.slice(0, 20);
    saveStats(stats);
  }

  function buildShareText() {
    const steps = game.ladder.length - 1;
    const lines = [`Elpoop #${game.puzzleNumber} ${steps}/${game.par}`, ""];
    game.ladder.forEach((word) => {
      let row = "";
      for (let i = 0; i < 4; i++) {
        row += word[i] === game.target[i] ? "\u{1F7EB}" : "⬜";
      }
      lines.push(row);
    });
    return lines.join("\n");
  }

  function renderWinGrid() {
    els.winGrid.innerHTML = "";
    game.ladder.forEach((word) => {
      const div = document.createElement("div");
      let row = "";
      for (let i = 0; i < 4; i++) {
        row += word[i] === game.target[i] ? "\u{1F7EB}" : "⬜";
      }
      div.textContent = row;
      els.winGrid.appendChild(div);
    });
  }

  function showWinPanel() {
    const steps = game.ladder.length - 1;
    els.winTitle.textContent = `You reached ${game.target.toUpperCase()}!`;
    const relation =
      steps < game.par ? "Under par, nice!" : steps === game.par ? "Right on par." : "Over par, but you made it.";
    els.winSummary.textContent = `${steps} step${steps === 1 ? "" : "s"} (par ${game.par}). ${relation}`;
    renderWinGrid();
    startCountdown();
    els.winPanel.classList.remove("hidden");
  }

  function startCountdown() {
    clearInterval(startCountdown._i);
    const tick = () => {
      const now = new Date();
      const nextUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const diff = Math.max(0, nextUTC - Date.now());
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      els.countdown.textContent = `${h}:${m}:${s}`;
    };
    tick();
    startCountdown._i = setInterval(tick, 1000);
  }

  function handleKey(key) {
    if (!game || game.status !== "playing") return;
    if (key === "ENTER") {
      submitDraft();
    } else if (key === "BACK") {
      game.draft = game.draft.slice(0, -1);
      renderBoard();
    } else if (/^[a-z]$/.test(key)) {
      if (game.draft.length < 4) {
        game.draft += key;
        renderBoard();
      }
    }
  }

  function buildKeyboard() {
    els.keyboard.innerHTML = "";
    KEYBOARD_ROWS.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "key-row";
      row.forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "key" + (key.length > 1 ? " wide" : "");
        btn.textContent = key === "BACK" ? "⌫" : key === "ENTER" ? "Enter" : key;
        btn.addEventListener("click", () => {
          handleKey(key);
          btn.blur();
        });
        rowEl.appendChild(btn);
      });
      els.keyboard.appendChild(rowEl);
    });
  }

  function onPhysicalKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "Enter") {
      e.preventDefault();
      handleKey("ENTER");
    } else if (k === "Backspace") {
      e.preventDefault();
      handleKey("BACK");
    } else if (/^[a-zA-Z]$/.test(k)) handleKey(k.toLowerCase());
  }

  function undoStep() {
    if (!game || game.status !== "playing") return;
    if (game.ladder.length <= 1) return;
    game.ladder.pop();
    game.draft = "";
    saveState(currentStateSnapshot());
    renderBoard();
  }

  function renderStatsModal() {
    const stats = loadStats();
    const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
    els.statPlayed.textContent = stats.played;
    els.statWinpct.textContent = winPct;
    els.statStreak.textContent = stats.currentStreak;
    els.statMaxstreak.textContent = stats.maxStreak;
    els.statsHistory.innerHTML = "";
    if (stats.history.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No results yet";
      els.statsHistory.appendChild(li);
    }
    stats.history.forEach((h) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>Elpoop #${h.puzzleNumber}</span><span>${h.steps}/${h.par}</span>`;
      els.statsHistory.appendChild(li);
    });
  }

  function openModal(el) {
    el.classList.remove("hidden");
  }
  function closeModal(el) {
    el.classList.add("hidden");
  }

  function wireModals() {
    els.helpBtn.addEventListener("click", () => openModal(els.helpModal));
    els.statsBtn.addEventListener("click", () => {
      renderStatsModal();
      openModal(els.statsModal);
    });
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(document.getElementById(btn.dataset.close)));
    });
    [els.helpModal, els.statsModal].forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal(els.helpModal);
        closeModal(els.statsModal);
      }
    });
  }

  async function init() {
    const res = await fetch("data/words.json");
    const data = await res.json();
    const info = puzzleInfoFor(data);
    const dictionary = new Set(data.dictionary);

    const saved = loadState();
    let ladder, status;
    if (saved && saved.puzzleNumber === info.puzzleNumber) {
      ladder = saved.ladder;
      status = saved.status;
    } else {
      ladder = [data.start];
      status = "playing";
    }

    game = {
      puzzleNumber: info.puzzleNumber,
      target: info.target,
      par: info.par,
      dictionary,
      ladder,
      status,
      draft: "",
    };

    els.puzzleNumber.textContent = `Elpoop #${game.puzzleNumber}`;
    els.targetWord.textContent = game.target.toUpperCase();
    els.parValue.textContent = game.par;

    buildKeyboard();
    document.addEventListener("keydown", onPhysicalKey);
    els.undoBtn.addEventListener("click", () => {
      undoStep();
      els.undoBtn.blur();
    });
    els.shareBtn.addEventListener("click", async () => {
      const text = buildShareText();
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied results to clipboard");
      } catch {
        showToast("Copy failed — select text manually");
      }
    });
    wireModals();

    renderBoard();
    if (game.status === "won") {
      showWinPanel();
    }

    if (!localStorage.getItem("elpoop_seen_help")) {
      openModal(els.helpModal);
      localStorage.setItem("elpoop_seen_help", "1");
    }
  }

  init();
})();
