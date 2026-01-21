// app.js — full Balloon Dating Game, collision‑proof, single load safe

(function () {
  // Prevent double‑loading from ever breaking anything
  if (window.BalloonGame) {
    console.warn("BalloonGame already loaded — skipping duplicate load.");
    return;
  }

  const BG = (window.BalloonGame = {});

  // ---------- GAME MODEL ----------

  BG.GamePhases = {
    MODE_SELECT: "MODE_SELECT",
    NAME_ENTRY: "NAME_ENTRY",
    LOBBY: "LOBBY",
    ROUND1: "ROUND1",
    ROUND2: "ROUND2",
    ROUND3: "ROUND3",
    RESULTS: "RESULTS",
  };

  BG.state = {
    gameId: null,
    phase: BG.GamePhases.MODE_SELECT,
    hostId: null,
    spotlightId: null,
    players: [],   // { id, name, role, balloonStatus, popReason }
    questions: [], // { id, fromPlayerId, text, orderIndex }
    answers: [],   // { id, questionId, fromPlayerId, text }
    match: null,   // { spotlightId, balloonId } | null
  };

  BG.localPlayerId = null;
  BG.isHost = false;

  // ---------- BLE BRIDGE ----------

  BG.broadcast = function (json) {
    if (window.BLEBridge && typeof window.BLEBridge.broadcastState === "function") {
      window.BLEBridge.broadcastState(json);
    }
  };

  BG.sendAction = function (json) {
    if (window.BLEBridge && typeof window.BLEBridge.sendAction === "function") {
      window.BLEBridge.sendAction(json);
    }
  };

  // Called on clients when host broadcasts state
  window.onBleStateReceived = function (jsonString) {
    try {
      BG.state = JSON.parse(jsonString);
      BG.render();
    } catch (e) {
      console.error("State parse error", e);
    }
  };

  // Called on host when a client sends an action
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

  // ---------- RENDER ROOT ----------

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
      default:
        card.innerHTML = "<p>Unknown phase.</p>";
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
      BG.state.players = [
        {
          id: BG.localPlayerId,
          name: "Host",
          role: "host",
          balloonStatus: "intact",
          popReason: null,
        },
      ];
      BG.state.questions = [];
      BG.state.answers = [];
      BG.state.match = null;
      BG.state.spotlightId = null;
      BG.state.phase = BG.GamePhases.NAME_ENTRY;
      if (window.BLEBridge && typeof window.BLEBridge.startHost === "function") {
        window.BLEBridge.startHost();
      }
      BG.render();
    };

    const joinBtn = document.createElement("button");
    joinBtn.textContent = "Join Game";
    joinBtn.className = "secondary";
    joinBtn.onclick = () => {
      BG.isHost = false;
      BG.localPlayerId = crypto.randomUUID();
      BG.state.phase = BG.GamePhases.NAME_ENTRY;
      if (window.BLEBridge && typeof window.BLEBridge.startClient === "function") {
        window.BLEBridge.startClient();
      }
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
    input.type = "text";
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
        BG.sendAction(
          JSON.stringify({
            type: "JOIN",
            playerId: BG.localPlayerId,
            name,
          })
        );
      }
    };

    container.appendChild(input);
    container.appendChild(btn);
  };

  // ---------- LOBBY ----------

  BG.renderLobby = function (container) {
    const me = BG.state.players.find((p) => p.id === BG.localPlayerId);

    container.innerHTML = `
      <h2>Lobby</h2>
      <p class="small center-text">Waiting for players…</p>
      <p><strong>You:</strong> ${me ? me.name : "Unknown"}</p>
    `;

    const list = document.createElement("ul");
    BG.state.players.forEach((p) => {
      const li = document.createElement("li");
      const role =
        p.id === BG.state.hostId
          ? "Host"
          : p.id === BG.state.spotlightId
          ? "Spotlight"
          : "Balloon";

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
      setSpot.className = "secondary";
      setSpot.onclick = () => {
        const names = BG.state.players
          .map((p) => `${p.name} (${p.id.slice(0, 4)})`)
          .join("\n");
        const frag = prompt(`Enter ID fragment of spotlight:\n${names}`);
        if (!frag) return;
        const match = BG.state.players.find((p) => p.id.startsWith(frag));
        if (!match) {
          alert("No player with that ID fragment.");
          return;
        }
        BG.state.spotlightId = match.id;
        BG.broadcast(JSON.stringify(BG.state));
        BG.render();
      };

      const startBtn = document.createElement("button");
      startBtn.textContent = "Start Round 1";
      startBtn.onclick = () => {
        if (!BG.state.spotlightId) {
          alert("Set a spotlight player first.");
          return;
        }
        BG.state.questions = [];
        BG.state.answers = [];
        BG.state.match = null;
        BG.state.players.forEach((p) => {
          if (p.id !== BG.state.spotlightId) {
            p.balloonStatus = "intact";
            p.popReason = null;
          }
        });
        BG.state.phase = BG.GamePhases.ROUND1;
        BG.broadcast(JSON.stringify(BG.state));
        BG.render();
      };

      container.appendChild(setSpot);
      container.appendChild(startBtn);
    }
  };

  // ---------- ROUND 1 (LOOKS) ----------

  BG.renderRound1 = function (container) {
    const me = BG.state.players.find((p) => p.id === BG.localPlayerId);
    const spotlight = BG.state.players.find((p) => p.id === BG.state.spotlightId);

    if (!me || !spotlight) {
      container.innerHTML = "<p>Error: missing player or spotlight.</p>";
      return;
    }

    if (me.id === spotlight.id) {
      container.innerHTML = `
        <h2>Round 1: Looks</h2>
        <p class="center-text small">You are the Spotlight.</p>
      `;

      const list = document.createElement("ul");
      BG.state.players
        .filter((p) => p.id !== spotlight.id)
        .forEach((p) => {
          const li = document.createElement("li");
          const statusClass =
            p.balloonStatus === "popped" ? "balloon-popped" : "balloon-intact";
          const statusText =
            p.balloonStatus === "popped" ? "Popped" : "Intact";
          li.innerHTML = `
            <span>${p.name}</span>
            <span class="${statusClass}">${statusText}</span>
          `;
          list.appendChild(li);
        });
      container.appendChild(list);

      if (BG.isHost) {
        const allDecided = BG.state.players
          .filter((p) => p.id !== spotlight.id)
          .every(
            (p) =>
              p.balloonStatus === "popped" || p.balloonStatus === "intact"
          );

        const finishBtn = document.createElement("button");
        finishBtn.textContent = "Continue to Questions";
        finishBtn.disabled = !allDecided;
        finishBtn.onclick = () => {
          BG.state.phase = BG.GamePhases.ROUND2;
          BG.broadcast(JSON.stringify(BG.state));
          BG.render();
        };
        container.appendChild(finishBtn);
      }
    } else {
      const status = me.balloonStatus || "intact";
      container.innerHTML = `
        <h2>Round 1: Looks</h2>
        <p class="center-text small">Spotlight: ${spotlight.name}</p>
        <p class="center-text">Your balloon is: 
          <span class="${
            status === "popped" ? "balloon-popped" : "balloon-intact"
          }">
            ${status === "popped" ? "Popped" : "Intact"}
          </span>
        </p>
      `;

      if (status !== "popped") {
        const keepBtn = document.createElement("button");
        keepBtn.textContent = "Keep Balloon";
        keepBtn.onclick = () => {
          BG.sendAction(
            JSON.stringify({
              type: "KEEP",
              playerId: BG.localPlayerId,
            })
          );
        };

        const popBtn = document.createElement("button");
        popBtn.textContent = "Pop Balloon";
        popBtn.onclick = () => {
          BG.sendAction(
            JSON.stringify({
              type: "POP",
              playerId: BG.localPlayerId,
              reason: "looks",
            })
          );
        };

        container.appendChild(keepBtn);
        container.appendChild(popBtn);
      }
    }
  };

  // ---------- ROUND 2 (QUESTIONS + ANSWERS) ----------

  BG.renderRound2 = function (container) {
    const me = BG.state.players.find((p) => p.id === BG.localPlayerId);
    const spotlight = BG.state.players.find((p) => p.id === BG.state.spotlightId);
    if (!me || !spotlight) {
      container.innerHTML = "<p>Error: missing player or spotlight.</p>";
      return;
    }

    const remaining = BG.state.players.filter(
      (p) => p.id !== spotlight.id && p.balloonStatus !== "popped"
    );

    if (remaining.length === 0) {
      if (BG.isHost) {
        BG.state.phase = BG.GamePhases.RESULTS;
        BG.broadcast(JSON.stringify(BG.state));
        BG.render();
      } else {
        container.innerHTML = "<p>No balloons left. Waiting for host.</p>";
      }
      return;
    }

    if (me.id === spotlight.id) {
      container.innerHTML = `
        <h2>Round 2: Questions</h2>
        <p class="center-text small">Answer one question from each remaining balloon.</p>
      `;

      const blocks = remaining.map((b) => {
        const q = BG.state.questions.find((q) => q.fromPlayerId === b.id);
        return { balloon: b, question: q };
      });

      const allSubmitted = blocks.every((b) => b.question);

      if (!allSubmitted) {
        const p = document.createElement("p");
        p.className = "center-text small";
        p.textContent = "Waiting for all balloons to submit their questions…";
        container.appendChild(p);
        return;
      }

      blocks
        .sort((a, b) => a.question.orderIndex - b.question.orderIndex)
        .forEach((b) => {
          const wrap = document.createElement("div");
          wrap.style.marginBottom = "16px";

          const existing = BG.state.answers.find(
            (a) => a.questionId === b.question.id
          );

          wrap.innerHTML = `
            <p><strong>${b.balloon.name} asks:</strong> ${b.question.text}</p>
          `;

          const input = document.createElement("input");
          input.type = "text";
          input.className = "input";
          input.placeholder = "Your answer";
          input.value = existing ? existing.text : "";

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
        const allAnswered = blocks.every((b) =>
          BG.state.answers.find((a) => a.questionId === b.question.id)
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
        <p class="center-text small">Spotlight: ${spotlight.name}</p>
      `;

      const myQ = BG.state.questions.find((q) => q.fromPlayerId === me.id);
      const myA = myQ
        ? BG.state.answers.find((a) => a.questionId === myQ.id)
        : null;

      if (me.balloonStatus === "popped") {
        const p = document.createElement("p");
        p.className = "center-text small";
        p.textContent =
          "You popped. You can still watch, but you are out of the running.";
        container.appendChild(p);
      } else {
        if (!myQ) {
          const p = document.createElement("p");
          p.className = "small";
          p.textContent = "Submit one question for the Spotlight.";
          container.appendChild(p);

          const input = document.createElement("input");
          input.type = "text";
          input.className = "input";
          input.placeholder = "Your question";

          const btn = document.createElement("button");
          btn.textContent = "Submit Question";
          btn.onclick = () => {
            const text = input.value.trim();
            if (!text) return;
            BG.sendAction(
              JSON.stringify({
                type: "QUESTION",
                id: crypto.randomUUID(),
                fromPlayerId: me.id,
                text,
              })
            );
          };

          container.appendChild(input);
          container.appendChild(btn);
        } else {
          const p = document.createElement("p");
          p.className = "small";
          p.innerHTML = `<strong>Your question:</strong> ${myQ.text}`;
          container.appendChild(p);
        }

        if (myA) {
          const ans = document.createElement("p");
          ans.className = "small";
          ans.innerHTML = `<strong>Answer:</strong> ${myA.text}`;
          container.appendChild(ans);
        } else {
          const wait = document.createElement("p");
          wait.className = "small";
          wait.textContent = "Waiting for Spotlight to answer…";
          container.appendChild(wait);
        }

        if (me.balloonStatus !== "popped") {
          const pop = document.createElement("button");
          pop.textContent = "Pop Balloon (After Hearing Answers)";
          pop.onclick = () => {
            BG.sendAction(
              JSON.stringify({
                type: "POP",
                playerId: BG.localPlayerId,
                reason: "answer",
              })
            );
          };
          container.appendChild(pop);
        }
      }
    }
  };

  // ---------- ROUND 3 (FINAL CHOICE) ----------

  BG.renderRound3 = function (container) {
    const me = BG.state.players.find((p) => p.id === BG.localPlayerId);
    const spotlight = BG.state.players.find((p) => p.id === BG.state.spotlightId);
    if (!me || !spotlight) {
      container.innerHTML = "<p>Error: missing player or spotlight.</p>";
      return;
    }

    const remaining = BG.state.players.filter(
      (p) => p.id !== spotlight.id && p.balloonStatus !== "popped"
    );

    if (remaining.length === 0) {
      if (BG.isHost) {
        BG.state.phase = BG.GamePhases.RESULTS;
        BG.broadcast(JSON.stringify(BG.state));
        BG.render();
      } else {
        container.innerHTML = "<p>No balloons left. Waiting for host.</p>";
      }
      return;
    }

    if (me.id === spotlight.id) {
      container.innerHTML = `
        <h2>Round 3: Final Choice</h2>
        <p class="center-text small">Tap one balloon to match with.</p>
      `;

      const list = document.createElement("ul");
      remaining.forEach((p) => {
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
        <p class="center-text small">Spotlight: ${spotlight.name}</p>
        <p class="center-text small">Waiting for Spotlight to choose…</p>
      `;
    }
  };

  // ---------- RESULTS ----------

  BG.renderResults = function (container) {
    const spotlight = BG.state.players.find((p) => p.id === BG.state.spotlightId);
    const matchBalloon = BG.state.match
      ? BG.state.players.find((p) => p.id === BG.state.match.balloonId)
      : null;

    container.innerHTML = `
      <h2>Results</h2>
      <p class="center-text small">Spotlight: ${
        spotlight ? spotlight.name : "Unknown"
      }</p>
    `;

    const list = document.createElement("ul");
    BG.state.players
      .filter((p) => p.id !== BG.state.spotlightId)
      .forEach((p) => {
        const statusClass =
          p.balloonStatus === "popped" ? "balloon-popped" : "balloon-intact";
        const statusText =
          p.balloonStatus === "popped" ? "Popped" : "Intact";
        const reason = p.popReason ? ` (${p.popReason})` : "";
        const li = document.createElement("li");
        li.innerHTML = `
          <span>${p.name}</span>
          <span class="${statusClass}">${statusText}${reason}</span>
        `;
        list.appendChild(li);
      });
    container.appendChild(list);

    if (BG.state.match && spotlight && matchBalloon) {
      const matchBlock = document.createElement("div");
      matchBlock.style.marginTop = "16px";
      matchBlock.innerHTML = `
        <p class="center-text"><strong>Match:</strong> ${spotlight.name} ❤️ ${matchBalloon.name}</p>
      `;
      container.appendChild(matchBlock);

      if (
        BG.localPlayerId === spotlight.id ||
        BG.localPlayerId === matchBalloon.id
      ) {
        const contactBlock = document.createElement("div");
        contactBlock.style.marginTop = "16px";
        contactBlock.innerHTML = `
          <p class="small center-text">You two can exchange contact info now.</p>
        `;

        const phoneInput = document.createElement("input");
        phoneInput.type = "text";
        phoneInput.className = "input";
        phoneInput.placeholder = "Your phone number";

        const igInput = document.createElement("input");
        igInput.type = "text";
        igInput.className = "input";
        igInput.placeholder = "Instagram handle";

        const ttInput = document.createElement("input");
        ttInput.type = "text";
        ttInput.className = "input";
        ttInput.placeholder = "TikTok handle";

        const fbInput = document.createElement("input");
        fbInput.type = "text";
        fbInput.className = "input";
        fbInput.placeholder = "Facebook name";

        const doneBtn = document.createElement("button");
        doneBtn.textContent = "Done";
        doneBtn.onclick = () => {
          alert("Share these directly with each other.");
        };

        contactBlock.appendChild(phoneInput);
        contactBlock.appendChild(igInput);
        contactBlock.appendChild(ttInput);
        contactBlock.appendChild(fbInput);
        contactBlock.appendChild(doneBtn);

        container.appendChild(contactBlock);
      }
    } else {
      const noMatch = document.createElement("p");
      noMatch.className = "center-text small";
      noMatch.textContent = "No final match was selected.";
      container.appendChild(noMatch);
    }

    const restartBtn = document.createElement("button");
    restartBtn.textContent = "Back to Lobby";
    restartBtn.onclick = () => {
      if (BG.isHost) {
        BG.state.phase = BG.GamePhases.LOBBY;
        BG.state.questions = [];
        BG.state.answers = [];
        BG.state.match = null;
        BG.broadcast(JSON.stringify(BG.state));
      }
      BG.render();
    };
    container.appendChild(restartBtn);
  };

  // ---------- ACTIONS ----------

  BG.applyAction = function (action) {
    switch (action.type) {
      case "JOIN": {
        if (!BG.state.players.find((p) => p.id === action.playerId)) {
          BG.state.players.push({
            id: action.playerId,
            name: action.name,
            role: "balloon",
            balloonStatus: "intact",
            popReason: null,
          });
        }
        break;
      }

      case "POP": {
        const p = BG.state.players.find((p) => p.id === action.playerId);
        if (p) {
          p.balloonStatus = "popped";
          p.popReason = action.reason || null;
        }
        break;
      }

      case "KEEP": {
        const p = BG.state.players.find((p) => p.id === action.playerId);
        if (p && p.balloonStatus !== "popped") {
          p.balloonStatus = "intact";
        }
        break;
      }

      case "QUESTION": {
        const from = BG.state.players.find(
          (p) => p.id === action.fromPlayerId
        );
        if (!from || from.balloonStatus === "popped") break;
        if (!BG.state.questions.find((q) => q.fromPlayerId === from.id)) {
          BG.state.questions.push({
            id: action.id,
            fromPlayerId: from.id,
            text: action.text,
            orderIndex: BG.state.questions.length,
          });
        }
        break;
      }

      case "ANSWER": {
        const q = BG.state.questions.find((q) => q.id === action.questionId);
        if (!q) break;
        const existing = BG.state.answers.find(
          (a) => a.questionId === q.id
        );
        if (existing) {
          existing.text = action.text;
        } else {
          BG.state.answers.push({
            id: crypto.randomUUID(),
            questionId: q.id,
            fromPlayerId: action.fromPlayerId,
            text: action.text,
          });
        }
        break;
      }

      case "FINAL_CHOICE": {
        const spotlight = BG.state.players.find(
          (p) => p.id === action.spotlightId
        );
        const balloon = BG.state.players.find(
          (p) => p.id === action.balloonId
        );
        if (!spotlight || !balloon) break;
        BG.state.match = {
          spotlightId: spotlight.id,
          balloonId: balloon.id,
        };
        BG.state.phase = BG.GamePhases.RESULTS;
        break;
      }
    }
  };

  // ---------- INITIALIZE ----------

  document.addEventListener("DOMContentLoaded", BG.render);
})();
