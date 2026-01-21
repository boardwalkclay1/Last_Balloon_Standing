// app.js — collision‑proof version

(function () {
  if (window.BalloonGame) {
    console.warn("BalloonGame already loaded — skipping duplicate load.");
    return;
  }

  window.BalloonGame = {};

  const BG = window.BalloonGame;

  // ---------- GAME MODEL ----------

  BG.GamePhases = {
    MODE_SELECT: 'MODE_SELECT',
    NAME_ENTRY: 'NAME_ENTRY',
    LOBBY: 'LOBBY',
    ROUND1: 'ROUND1',
    ROUND2: 'ROUND2',
    ROUND3: 'ROUND3',
    RESULTS: 'RESULTS',
  };

  BG.state = {
    gameId: null,
    phase: BG.GamePhases.MODE_SELECT,
    hostId: null,
    spotlightId: null,
    players: [],
    questions: [],
    answers: [],
    match: null,
  };

  BG.localPlayerId = null;
  BG.isHost = false;

  // ---------- BLE BRIDGE ----------

  BG.broadcast = function (json) {
    if (window.BLEBridge && window.BLEBridge.broadcastState) {
      window.BLEBridge.broadcastState(json);
    }
  };

  BG.sendAction = function (json) {
    if (window.BLEBridge && window.BLEBridge.sendAction) {
      window.BLEBridge.sendAction(json);
    }
  };

  window.onBleStateReceived = function (jsonString) {
    try {
      BG.state = JSON.parse(jsonString);
      BG.render();
    } catch (e) {
      console.error("State parse error", e);
    }
  };

  window.onBleActionReceived = function (jsonString) {
    try {
      const action = JSON.parse(jsonString);
      BG.applyAction(action);
      BG.broadcast(JSON.stringify(BG.state));
      BG.render();
    } catch (e) {
      console.error("Action parse error", e);
    }
  };

  // ---------- RENDERING ----------

  BG.render = function () {
    const root = document.getElementById("app");
    if (!root) return;
    root.innerHTML = "";

    const card = document.createElement("div");
    card.className = "card";

    switch (BG.state.phase) {
      case BG.GamePhases.MODE_SELECT:
        BG.renderModeSelect(card);
        break;
      case BG.GamePhases.NAME_ENTRY:
        BG.renderNameEntry(card);
        break;
      case BG.GamePhases.LOBBY:
        BG.renderLobby(card);
        break;
      case BG.GamePhases.ROUND1:
        BG.renderRound1(card);
        break;
      case BG.GamePhases.ROUND2:
        BG.renderRound2(card);
        break;
      case BG.GamePhases.ROUND3:
        BG.renderRound3(card);
        break;
      case BG.GamePhases.RESULTS:
        BG.renderResults(card);
        break;
    }

    root.appendChild(card);
  };

  // ---------- MODE SELECT ----------

  BG.renderModeSelect = function (container) {
    container.innerHTML = `
      <h1>Balloon Dating Game</h1>
      <p class="center-text small">Offline · JSON · BLE</p>
    `;

    const hostBtn = document.createElement("button");
    hostBtn.textContent = "Host Game";
    hostBtn.onclick = () => {
      BG.isHost = true;
      BG.localPlayerId = crypto.randomUUID();
      BG.state.gameId = crypto.randomUUID();
      BG.state.hostId = BG.localPlayerId;
      BG.state.players = [{
        id: BG.localPlayerId,
        name: "Host",
        role: "host",
        balloonStatus: "intact",
        popReason: null,
      }];
      BG.state.phase = BG.GamePhases.NAME_ENTRY;
      if (window.BLEBridge?.startHost) window.BLEBridge.startHost();
      BG.render();
    };

    const joinBtn = document.createElement("button");
    joinBtn.textContent = "Join Game";
    joinBtn.className = "secondary";
    joinBtn.onclick = () => {
      BG.isHost = false;
      BG.localPlayerId = crypto.randomUUID();
      BG.state.phase = BG.GamePhases.NAME_ENTRY;
      if (window.BLEBridge?.startClient) window.BLEBridge.startClient();
      BG.render();
    };

    container.appendChild(hostBtn);
    container.appendChild(joinBtn);
  };

  // ---------- NAME ENTRY ----------

  BG.renderNameEntry = function (container) {
    container.innerHTML = `
      <h2>${BG.isHost ? "Host Setup" : "Join Game"}</h2>
      <p class="small center-text">Enter your display name.</p>
    `;

    const input = document.createElement("input");
    input.className = "input";
    input.placeholder = "Your name";

    const btn = document.createElement("button");
    btn.textContent = BG.isHost ? "Start Hosting" : "Connect";

    btn.onclick = () => {
      const name = input.value.trim() || (BG.isHost ? "Host" : "Player");

      if (BG.isHost) {
        BG.state.players[0].name = name;
        BG.state.phase = BG.GamePhases.LOBBY;
        BG.broadcast(JSON.stringify(BG.state));
        BG.render();
      } else {
        BG.sendAction(JSON.stringify({
          type: "JOIN",
          playerId: BG.localPlayerId,
          name,
        }));
      }
    };

    container.appendChild(input);
    container.appendChild(btn);
  };

  // ---------- LOBBY ----------

  BG.renderLobby = function (container) {
    const me = BG.state.players.find(p => p.id === BG.localPlayerId);

    container.innerHTML = `
      <h2>Lobby</h2>
      <p class="small center-text">Waiting for players…</p>
      <p><strong>You:</strong> ${me?.name}</p>
    `;

    const list = document.createElement("ul");
    BG.state.players.forEach(p => {
      const li = document.createElement("li");
      const role =
        p.id === BG.state.hostId ? "Host" :
        p.id === BG.state.spotlightId ? "Spotlight" :
        "Balloon";

      li.innerHTML = `
        <span>${p.name}</span>
        <span class="badge">${role}</span>
      `;
      list.appendChild(li);
    });
    container.appendChild(list);

    if (BG.isHost) {
      const setSpot = document.createElement("button");
      setSpot.textContent = "Set Spotlight";
      setSpot.onclick = () => {
        const idFrag = prompt("Enter ID fragment:");
        const match = BG.state.players.find(p => p.id.startsWith(idFrag));
        if (match) {
          BG.state.spotlightId = match.id;
          BG.broadcast(JSON.stringify(BG.state));
          BG.render();
        }
      };

      const startBtn = document.createElement("button");
      startBtn.textContent = "Start Round 1";
      startBtn.onclick = () => {
        if (!BG.state.spotlightId) return alert("Pick spotlight first");
        BG.state.phase = BG.GamePhases.ROUND1;
        BG.broadcast(JSON.stringify(BG.state));
        BG.render();
      };

      container.appendChild(setSpot);
      container.appendChild(startBtn);
    }
  };

  // ---------- ROUND 1 ----------

  BG.renderRound1 = function (container) {
    const me = BG.state.players.find(p => p.id === BG.localPlayerId);
    const spotlight = BG.state.players.find(p => p.id === BG.state.spotlightId);

    if (me.id === spotlight.id) {
      container.innerHTML = `
        <h2>Round 1: Looks</h2>
        <p class="small center-text">You are the Spotlight.</p>
      `;

      const list = document.createElement("ul");
      BG.state.players
        .filter(p => p.id !== spotlight.id)
        .forEach(p => {
          const li = document.createElement("li");
          li.innerHTML = `
            <span>${p.name}</span>
            <span class="${p.balloonStatus === "popped" ? "balloon-popped" : "balloon-intact"}">
              ${p.balloonStatus}
            </span>
          `;
          list.appendChild(li);
        });
      container.appendChild(list);

      if (BG.isHost) {
        const btn = document.createElement("button");
        btn.textContent = "Continue to Questions";
        btn.onclick = () => {
          BG.state.phase = BG.GamePhases.ROUND2;
          BG.broadcast(JSON.stringify(BG.state));
          BG.render();
        };
        container.appendChild(btn);
      }
    } else {
      container.innerHTML = `
        <h2>Round 1: Looks</h2>
        <p class="small center-text">Spotlight: ${spotlight.name}</p>
      `;

      if (me.balloonStatus !== "popped") {
        const keep = document.createElement("button");
        keep.textContent = "Keep Balloon";
        keep.onclick = () => {
          BG.sendAction(JSON.stringify({
            type: "KEEP",
            playerId: BG.localPlayerId,
          }));
        };

        const pop = document.createElement("button");
        pop.textContent = "Pop Balloon";
        pop.onclick = () => {
          BG.sendAction(JSON.stringify({
            type: "POP",
            playerId: BG.localPlayerId,
            reason: "looks",
          }));
        };

        container.appendChild(keep);
        container.appendChild(pop);
      }
    }
  };

  // ---------- ROUND 2 ----------

  BG.renderRound2 = function (container) {
    const me = BG.state.players.find(p => p.id === BG.localPlayerId);
    const spotlight = BG.state.players.find(p => p.id === BG.state.spotlightId);

    const remaining = BG.state.players.filter(
      p => p.id !== spotlight.id && p.balloonStatus !== "popped"
    );

    if (me.id === spotlight.id) {
      container.innerHTML = `
        <h2>Round 2: Questions</h2>
        <p class="small center-text">Answer each balloon's question.</p>
      `;

      const blocks = remaining.map(b => {
        const q = BG.state.questions.find(q => q.fromPlayerId === b.id);
        return { balloon: b, question: q };
      });

      const allSubmitted = blocks.every(b => b.question);

      if (!allSubmitted) {
        container.innerHTML += `<p class="small center-text">Waiting for all questions…</p>`;
        return;
      }

      blocks.forEach(b => {
        const wrap = document.createElement("div");
        wrap.style.marginBottom = "16px";

        const existing = BG.state.answers.find(a => a.questionId === b.question.id);

        wrap.innerHTML = `
          <p><strong>${b.balloon.name} asks:</strong> ${b.question.text}</p>
        `;

        const input = document.createElement("input");
        input.className = "input";
        input.value = existing?.text || "";

        const save = document.createElement("button");
        save.textContent = existing ? "Update Answer" : "Save Answer";
        save.onclick = () => {
          const text = input.value.trim();
          if (!text) return;
          const action = {
            type: "ANSWER",
            questionId: b.question.id,
            fromPlayerId: me.id,
            text,
          };
          if (BG.isHost) {
            BG.applyAction(action);
            BG.broadcast(JSON.stringify(BG.state));
            BG.render();
          } else {
            BG.sendAction(JSON.stringify(action));
          }
        };

        wrap.appendChild(input);
        wrap.appendChild(save);
        container.appendChild(wrap);
      });

      if (BG.isHost) {
        const allAnswered = blocks.every(b =>
          BG.state.answers.find(a => a.questionId === b.question.id)
        );

        const next = document.createElement("button");
        next.textContent = "Continue to Final Choice";
        next.disabled = !allAnswered;
        next.onclick = () => {
          BG.state.phase = BG.GamePhases.ROUND3;
          BG.broadcast(JSON.stringify(BG.state));
          BG.render();
        };
        container.appendChild(next);
      }
    } else {
      container.innerHTML = `
        <h2>Round 2: Questions</h2>
        <p class="small center-text">Spotlight: ${spotlight.name}</p>
      `;

      const myQ = BG.state.questions.find(q => q.fromPlayerId === me.id);
      const myA = myQ ? BG.state.answers.find(a => a.questionId === myQ.id) : null;

      if (!myQ && me.balloonStatus !== "popped") {
        const input = document.createElement("input");
        input.className = "input";
        input.placeholder = "Your question";

        const btn = document.createElement("button");
        btn.textContent = "Submit Question";
        btn.onclick = () => {
          const text = input.value.trim();
          if (!text) return;
          BG.sendAction(JSON.stringify({
            type: "QUESTION",
            id: crypto.randomUUID(),
            fromPlayerId: me.id,
            text,
          }));
        };

        container.appendChild(input);
        container.appendChild(btn);
      }

      if (myQ) {
        container.innerHTML += `<p class="small"><strong>Your question:</strong> ${myQ.text}</p>`;
      }

      if (myA) {
        container.innerHTML += `<p class="small"><strong>Answer:</strong> ${myA.text}</p>`;
      } else {
        container.innerHTML += `<p class="small">Waiting for answer…</p>`;
      }

      if (me.balloonStatus !== "popped") {
        const pop = document.createElement("button");
        pop.textContent = "Pop Balloon";
        pop.onclick = () => {
          BG.sendAction(JSON.stringify({
            type: "POP",
            playerId: BG.localPlayerId,
            reason: "answer",
          }));
        };
        container.appendChild(pop);
      }
    }
  };

  // ---------- ROUND 3 ----------

  BG.renderRound3 = function (container) {
    const me = BG.state.players.find(p => p.id === BG.localPlayerId);
    const spotlight = BG.state.players.find(p => p.id === BG.state.spotlightId);

    const remaining = BG.state.players.filter(
      p => p.id !== spotlight.id && p.balloonStatus !== "popped"
    );

    if (me.id === spotlight.id) {
      container.innerHTML = `
        <h2>Round 3: Final Choice</h2>
        <p class="small center-text">Tap one balloon to match with.</p>
      `;

      const list = document.createElement("ul");
      remaining.forEach(p => {
        const li = document.createElement("li");
        li.innerHTML = `
          <span>${p.name}</span>
          <span class="badge">Balloon</span>
        `;
        li.style.cursor = "pointer";
        li.onclick = () => {
          const action = {
            type: "FINAL_CHOICE",
            spotlightId: me.id,
            balloonId: p.id,
          };
          if (BG.isHost) {
            BG.applyAction(action);
            BG.broadcast(JSON.stringify(BG.state));
            BG.render();
          } else {
            BG.sendAction(JSON.stringify(action));
          }
        };
        list.appendChild(li);
      });
      container.appendChild(list);
    } else {
      container.innerHTML = `
        <h2>Round 3: Final Choice</h2>
        <p class="small center-text">Waiting for Spotlight…</p>
      `;
    }
  };

  // ---------- RESULTS ----------

  BG.renderResults = function (container) {
    const spotlight = BG.state.players.find(p => p.id === BG.state.spotlightId);
    const match = BG.state.match
      ? BG.state.players.find(p => p.id === BG.state.match.balloonId)
      : null;

    container.innerHTML = `
      <h2>Results</h2>
      <p class="small center-text">Spotlight: ${spotlight?.name}</p>
    `;

    const list = document.createElement("ul");
    BG.state.players
      .filter(p => p.id !== BG.state.spotlightId)
      .forEach(p => {
        const li = document.createElement("li");
        li.innerHTML = `
          <span>${p.name}</span>
          <span class="${p.balloonStatus === "popped" ? "balloon-popped" : "balloon-intact"}">
            ${p.balloonStatus}
          </span>
        `;
        list.appendChild(li);
      });
    container.appendChild(list);

    if (match) {
      container.innerHTML += `
        <p class="center-text"><strong>Match:</strong> ${spotlight.name} ❤️ ${match.name}</p>
      `;
    }

    const restart = document.createElement("button");
    restart.textContent = "Back to Lobby";
    restart.onclick = () => {
      if (BG.isHost) {
        BG.state.phase = BG.GamePhases.LOBBY;
        BG.state.questions = [];
        BG.state.answers = [];
        BG.state.match = null;
        BG.broadcast(JSON.stringify(BG.state));
      }
      BG.render();
    };
    container.appendChild(restart);
  };

  // ---------- ACTIONS ----------

  BG.applyAction = function (action) {
    switch (action.type) {
      case "JOIN":
        if (!BG.state.players.find(p => p.id === action.playerId)) {
          BG.state.players.push({
            id: action.playerId,
            name: action.name,
            role: "balloon",
            balloonStatus: "intact",
            popReason: null,
          });
        }
        break;

      case "POP":
        const p1 = BG.state.players.find(p => p.id === action.playerId);
        if (p1) {
          p1.balloonStatus = "popped";
          p1.popReason = action.reason || null;
        }
        break;

      case "KEEP":
        const p2 = BG
