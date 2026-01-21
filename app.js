// app.js
// Full Balloon Dating Game engine – JSON + BLE bridge
// Wrapped in an IIFE so nothing leaks globally.

(() => {
  // ---------- GAME MODEL (JSON) ----------

  const GamePhases = {
    MODE_SELECT: 'MODE_SELECT',
    NAME_ENTRY: 'NAME_ENTRY',
    LOBBY: 'LOBBY',
    ROUND1: 'ROUND1',      // Looks only
    ROUND2: 'ROUND2',      // Questions + answers
    ROUND3: 'ROUND3',      // Spotlight chooses
    RESULTS: 'RESULTS',    // Everyone sees outcome
  };

  let gameState = {
    gameId: null,
    phase: GamePhases.MODE_SELECT,
    hostId: null,
    spotlightId: null,
    players: [],   // { id, name, role, balloonStatus, popReason }
    questions: [], // { id, fromPlayerId, text, orderIndex }
    answers: [],   // { id, questionId, fromPlayerId, text }
    match: null,   // { spotlightId, balloonId } | null
  };

  let localPlayerId = null;
  let isHost = false;

  // ---------- BLE BRIDGE HOOKS ----------

  function bleBroadcastState(jsonString) {
    if (!window.BLEBridge || !window.BLEBridge.broadcastState) return;
    window.BLEBridge.broadcastState(jsonString);
  }

  function bleSendAction(jsonString) {
    if (!window.BLEBridge || !window.BLEBridge.sendAction) return;
    window.BLEBridge.sendAction(jsonString);
  }

  // Expose callbacks for native BLE layer
  window.onBleStateReceived = function (jsonString) {
    try {
      const remote = JSON.parse(jsonString);
      gameState = remote;
      render();
    } catch (e) {
      console.error('Failed to parse state from BLE', e);
    }
  };

  window.onBleActionReceived = function (jsonString) {
    try {
      const action = JSON.parse(jsonString);
      applyAction(action);
      broadcastState();
      render();
    } catch (e) {
      console.error('Failed to parse action from BLE', e);
    }
  };

  // ---------- RENDERING ----------

  function render() {
    const root = document.getElementById('app');
    if (!root) return;
    root.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'card';

    switch (gameState.phase) {
      case GamePhases.MODE_SELECT:
        renderModeSelect(card);
        break;
      case GamePhases.NAME_ENTRY:
        renderNameEntry(card);
        break;
      case GamePhases.LOBBY:
        renderLobby(card);
        break;
      case GamePhases.ROUND1:
        renderRound1(card);
        break;
      case GamePhases.ROUND2:
        renderRound2(card);
        break;
      case GamePhases.ROUND3:
        renderRound3(card);
        break;
      case GamePhases.RESULTS:
        renderResults(card);
        break;
      default:
        card.innerHTML = '<p>Unknown phase.</p>';
    }

    root.appendChild(card);
  }

  function renderModeSelect(container) {
    container.innerHTML = `
      <h1>Balloon Dating Game</h1>
      <p class="center-text small">Offline · JSON · Over-the-air</p>
    `;

    const hostBtn = document.createElement('button');
    hostBtn.textContent = 'Host Game';
    hostBtn.onclick = () => {
      isHost = true;
      localPlayerId = crypto.randomUUID();
      gameState.gameId = crypto.randomUUID();
      gameState.hostId = localPlayerId;
      gameState.players = [{
        id: localPlayerId,
        name: 'Host',
        role: 'host',
        balloonStatus: 'intact',
        popReason: null,
      }];
      gameState.questions = [];
      gameState.answers = [];
      gameState.match = null;
      gameState.spotlightId = null;
      gameState.phase = GamePhases.NAME_ENTRY;
      if (window.BLEBridge && window.BLEBridge.startHost) {
        window.BLEBridge.startHost();
      }
      render();
    };

    const joinBtn = document.createElement('button');
    joinBtn.textContent = 'Join Game';
    joinBtn.className = 'secondary';
    joinBtn.onclick = () => {
      isHost = false;
      localPlayerId = crypto.randomUUID();
      gameState.phase = GamePhases.NAME_ENTRY;
      if (window.BLEBridge && window.BLEBridge.startClient) {
        window.BLEBridge.startClient();
      }
      render();
    };

    container.appendChild(hostBtn);
    container.appendChild(joinBtn);
  }

  function renderNameEntry(container) {
    container.innerHTML = `
      <h2>${isHost ? 'Host Setup' : 'Join Game'}</h2>
      <p class="small center-text">Enter your display name.</p>
    `;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.placeholder = 'Your name';
    input.id = 'name-input';

    const btn = document.createElement('button');
    btn.textContent = isHost ? 'Start Hosting' : 'Connect to Host';

    btn.onclick = () => {
      const name = input.value.trim() || (isHost ? 'Host' : 'Player');
      if (isHost) {
        gameState.players[0].name = name;
        gameState.phase = GamePhases.LOBBY;
        broadcastState();
        render();
      } else {
        const action = {
          type: 'JOIN',
          playerId: localPlayerId,
          name,
        };
        bleSendAction(JSON.stringify(action));
      }
    };

    container.appendChild(input);
    container.appendChild(btn);
  }

  function renderLobby(container) {
    const me = gameState.players.find(p => p.id === localPlayerId);
    container.innerHTML = `
      <h2>Lobby</h2>
      <p class="center-text small">Waiting for everyone to join.</p>
      <p><strong>You:</strong> ${me ? me.name : 'Unknown'}</p>
    `;

    const list = document.createElement('ul');
    gameState.players.forEach(p => {
      const li = document.createElement('li');
      const roleLabel =
        p.id === gameState.hostId ? 'Host' :
        p.id === gameState.spotlightId ? 'Spotlight' :
        'Balloon';

      li.innerHTML = `
        <span>${p.name}</span>
        <span class="badge">${roleLabel}</span>
      `;
      list.appendChild(li);
    });
    container.appendChild(list);

    if (isHost) {
      const setSpotBtn = document.createElement('button');
      setSpotBtn.textContent = 'Set Spotlight (Tap a Player)';
      setSpotBtn.className = 'secondary';
      setSpotBtn.onclick = () => {
        promptSetSpotlight();
      };
      container.appendChild(setSpotBtn);

      const startBtn = document.createElement('button');
      startBtn.textContent = 'Start Round 1';
      startBtn.onclick = () => {
        if (!gameState.spotlightId) {
          alert('Set a spotlight player first.');
          return;
        }
        gameState.questions = [];
        gameState.answers = [];
        gameState.match = null;
        gameState.players.forEach(p => {
          if (p.id !== gameState.spotlightId) {
            p.balloonStatus = 'intact';
            p.popReason = null;
          }
        });
        gameState.phase = GamePhases.ROUND1;
        broadcastState();
        render();
      };
      container.appendChild(startBtn);
    }
  }

  function renderRound1(container) {
    const me = gameState.players.find(p => p.id === localPlayerId);
    const spotlight = gameState.players.find(p => p.id === gameState.spotlightId);

    if (!me || !spotlight) {
      container.innerHTML = '<p>Error: missing player or spotlight.</p>';
      return;
    }

    if (me.id === spotlight.id) {
      container.innerHTML = `
        <h2>Round 1: Looks</h2>
        <p class="center-text small">You are the Spotlight.</p>
      `;

      const list = document.createElement('ul');
      gameState.players
        .filter(p => p.id !== spotlight.id)
        .forEach(p => {
          const li = document.createElement('li');
          const statusClass = p.balloonStatus === 'popped'
            ? 'balloon-popped'
            : 'balloon-intact';
          const statusText = p.balloonStatus === 'popped' ? 'Popped' : 'Intact';
          li.innerHTML = `
            <span>${p.name}</span>
            <span class="${statusClass}">${statusText}</span>
          `;
          list.appendChild(li);
        });
      container.appendChild(list);

      if (isHost) {
        const allDecided = gameState.players
          .filter(p => p.id !== spotlight.id)
          .every(p => p.balloonStatus === 'popped' || p.balloonStatus === 'intact');

        const finishBtn = document.createElement('button');
        finishBtn.textContent = 'Continue to Questions';
        finishBtn.disabled = !allDecided;
        finishBtn.onclick = () => {
          gameState.phase = GamePhases.ROUND2;
          broadcastState();
          render();
        };
        container.appendChild(finishBtn);
      }
    } else {
      const status = me.balloonStatus || 'intact';
      container.innerHTML = `
        <h2>Round 1: Looks</h2>
        <p class="center-text small">Spotlight: ${spotlight.name}</p>
        <p class="center-text">Your balloon is: 
          <span class="${status === 'popped' ? 'balloon-popped' : 'balloon-intact'}">
            ${status === 'popped' ? 'Popped' : 'Intact'}
          </span>
        </p>
      `;

      if (status !== 'popped') {
        const keepBtn = document.createElement('button');
        keepBtn.textContent = 'Keep Balloon';
        keepBtn.onclick = () => {
          const action = {
            type: 'KEEP',
            playerId: localPlayerId,
          };
          bleSendAction(JSON.stringify(action));
        };

        const popBtn = document.createElement('button');
        popBtn.textContent = 'Pop Balloon';
        popBtn.onclick = () => {
          const action = {
            type: 'POP',
            playerId: localPlayerId,
            reason: 'looks',
          };
          bleSendAction(JSON.stringify(action));
        };

        container.appendChild(keepBtn);
        container.appendChild(popBtn);
      }
    }
  }

  function renderRound2(container) {
    const me = gameState.players.find(p => p.id === localPlayerId);
    const spotlight = gameState.players.find(p => p.id === gameState.spotlightId);
    if (!me || !spotlight) {
      container.innerHTML = '<p>Error: missing player or spotlight.</p>';
      return;
    }

    const remainingBalloons = gameState.players.filter(
      p => p.id !== spotlight.id && p.balloonStatus !== 'popped'
    );

    if (remainingBalloons.length === 0) {
      if (isHost) {
        gameState.phase = GamePhases.RESULTS;
        broadcastState();
        render();
      } else {
        container.innerHTML = '<p>No balloons left. Waiting for host.</p>';
      }
      return;
    }

    if (me.id === spotlight.id) {
      container.innerHTML = `
        <h2>Round 2: Questions</h2>
        <p class="center-text small">Answer one question from each remaining balloon.</p>
      `;

      const questionsByBalloon = remainingBalloons.map(b => {
        const q = gameState.questions.find(q => q.fromPlayerId === b.id);
        return { balloon: b, question: q };
      });

      const allQuestionsSubmitted = questionsByBalloon.every(qb => qb.question);

      if (!allQuestionsSubmitted) {
        const p = document.createElement('p');
        p.className = 'center-text small';
        p.textContent = 'Waiting for all balloons to submit their questions…';
        container.appendChild(p);
        return;
      }

      questionsByBalloon
        .sort((a, b) => a.question.orderIndex - b.question.orderIndex)
        .forEach(qb => {
          const block = document.createElement('div');
          block.style.marginBottom = '16px';
          const existingAnswer = gameState.answers.find(
            ans => ans.questionId === qb.question.id
          );
          block.innerHTML = `
            <p><strong>${qb.balloon.name} asks:</strong> ${qb.question.text}</p>
          `;
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'input';
          input.placeholder = 'Your answer';
          input.value = existingAnswer ? existingAnswer.text : '';

          const saveBtn = document.createElement('button');
          saveBtn.textContent = existingAnswer ? 'Update Answer' : 'Save Answer';
          saveBtn.onclick = () => {
            const text = input.value.trim();
            if (!text) return;
            const action = {
              type: 'ANSWER',
              questionId: qb.question.id,
              fromPlayerId: me.id,
              text,
            };
            if (isHost) {
              applyAction(action);
              broadcastState();
              render();
            } else {
              bleSendAction(JSON.stringify(action));
            }
          };

          block.appendChild(input);
          block.appendChild(saveBtn);
          container.appendChild(block);
        });

      if (isHost) {
        const allAnswered = questionsByBalloon.every(qb =>
          gameState.answers.find(ans => ans.questionId === qb.question.id)
        );
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Continue to Final Choice';
        nextBtn.disabled = !allAnswered;
        nextBtn.onclick = () => {
          gameState.phase = GamePhases.ROUND3;
          broadcastState();
          render();
        };
        container.appendChild(nextBtn);
      }
    } else {
      const myQuestion = gameState.questions.find(q => q.fromPlayerId === me.id);
      const myAnswer = myQuestion
        ? gameState.answers.find(ans => ans.questionId === myQuestion.id)
        : null;

      container.innerHTML = `
        <h2>Round 2: Questions</h2>
        <p class="center-text small">Spotlight: ${spotlight.name}</p>
      `;

      if (me.balloonStatus === 'popped') {
        const p = document.createElement('p');
        p.className = 'center-text small';
        p.textContent = 'You popped. You can still watch, but you are out of the running.';
        container.appendChild(p);
      } else {
        if (!myQuestion) {
          const p = document.createElement('p');
          p.className = 'small';
          p.textContent = 'Submit one question for the Spotlight.';
          container.appendChild(p);

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'input';
          input.placeholder = 'Your question';
          const btn = document.createElement('button');
          btn.textContent = 'Submit Question';
          btn.onclick = () => {
            const text = input.value.trim();
            if (!text) return;
            const action = {
              type: 'QUESTION',
              id: crypto.randomUUID(),
              fromPlayerId: me.id,
              text,
            };
            bleSendAction(JSON.stringify(action));
          };
          container.appendChild(input);
          container.appendChild(btn);
        } else {
          const p = document.createElement('p');
          p.className = 'small';
          p.innerHTML = `<strong>Your question:</strong> ${myQuestion.text}`;
          container.appendChild(p);
        }

        if (myAnswer) {
          const ans = document.createElement('p');
          ans.className = 'small';
          ans.innerHTML = `<strong>Answer:</strong> ${myAnswer.text}`;
          container.appendChild(ans);
        } else {
          const wait = document.createElement('p');
          wait.className = 'small';
          wait.textContent = 'Waiting for Spotlight to answer…';
          container.appendChild(wait);
        }

        if (me.balloonStatus !== 'popped') {
          const popBtn = document.createElement('button');
          popBtn.textContent = 'Pop Balloon (After Hearing Answers)';
          popBtn.onclick = () => {
            const action = {
              type: 'POP',
              playerId: localPlayerId,
              reason: 'answer',
            };
            bleSendAction(JSON.stringify(action));
          };
          container.appendChild(popBtn);
        }
      }
    }
  }

  function renderRound3(container) {
    const me = gameState.players.find(p => p.id === localPlayerId);
    const spotlight = gameState.players.find(p => p.id === gameState.spotlightId);
    if (!me || !spotlight) {
      container.innerHTML = '<p>Error: missing player or spotlight.</p>';
      return;
    }

    const remainingBalloons = gameState.players.filter(
      p => p.id !== spotlight.id && p.balloonStatus !== 'popped'
    );

    if (remainingBalloons.length === 0) {
      if (isHost) {
        gameState.phase = GamePhases.RESULTS;
        broadcastState();
        render();
      } else {
        container.innerHTML = '<p>No balloons left. Waiting for host.</p>';
      }
      return;
    }

    if (me.id === spotlight.id) {
      container.innerHTML = `
        <h2>Round 3: Final Choice</h2>
        <p class="center-text small">Tap one balloon to match with.</p>
      `;

      const list = document.createElement('ul');
      remainingBalloons.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span>${p.name}</span>
          <span class="badge">Balloon</span>
        `;
        li.style.cursor = 'pointer';
        li.onclick = () => {
          const action = {
            type: 'FINAL_CHOICE',
            spotlightId: me.id,
            balloonId: p.id,
          };
          if (isHost) {
            applyAction(action);
            broadcastState();
            render();
          } else {
            bleSendAction(JSON.stringify(action));
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
  }

  function renderResults(container) {
    const spotlight = gameState.players.find(p => p.id === gameState.spotlightId);
    const matchBalloon = gameState.match
      ? gameState.players.find(p => p.id === gameState.match.balloonId)
      : null;

    container.innerHTML = `
      <h2>Results</h2>
      <p class="center-text small">Spotlight: ${spotlight ? spotlight.name : 'Unknown'}</p>
    `;

    const list = document.createElement('ul');
    gameState.players
      .filter(p => p.id !== gameState.spotlightId)
      .forEach(p => {
        const statusClass = p.balloonStatus === 'popped'
          ? 'balloon-popped'
          : 'balloon-intact';
        const statusText = p.balloonStatus === 'popped' ? 'Popped' : 'Intact';
        const reason = p.popReason ? ` (${p.popReason})` : '';
        const li = document.createElement('li');
        li.innerHTML = `
          <span>${p.name}</span>
          <span class="${statusClass}">${statusText}${reason}</span>
        `;
        list.appendChild(li);
      });
    container.appendChild(list);

    if (gameState.match && spotlight && matchBalloon) {
      const matchBlock = document.createElement('div');
      matchBlock.style.marginTop = '16px';
      matchBlock.innerHTML = `
        <p class="center-text"><strong>Match:</strong> ${spotlight.name} ❤️ ${matchBalloon.name}</p>
      `;
      container.appendChild(matchBlock);

      if (localPlayerId === spotlight.id || localPlayerId === matchBalloon.id) {
        const contactBlock = document.createElement('div');
        contactBlock.style.marginTop = '16px';
        contactBlock.innerHTML = `
          <p class="small center-text">You two can exchange contact info now.</p>
        `;

        const phoneInput = document.createElement('input');
        phoneInput.type = 'text';
        phoneInput.className = 'input';
        phoneInput.placeholder = 'Your phone number';

        const igInput = document.createElement('input');
        igInput.type = 'text';
        igInput.className = 'input';
        igInput.placeholder = 'Instagram handle';

        const ttInput = document.createElement('input');
        ttInput.type = 'text';
        ttInput.className = 'input';
        ttInput.placeholder = 'TikTok handle';

        const fbInput = document.createElement('input');
        fbInput.type = 'text';
        fbInput.className = 'input';
        fbInput.placeholder = 'Facebook name';

        const doneBtn = document.createElement('button');
        doneBtn.textContent = 'Done';
        doneBtn.onclick = () => {
          alert('Share these directly with each other.');
        };

        contactBlock.appendChild(phoneInput);
        contactBlock.appendChild(igInput);
        contactBlock.appendChild(ttInput);
        contactBlock.appendChild(fbInput);
        contactBlock.appendChild(doneBtn);

        container.appendChild(contactBlock);
      }
    } else {
      const noMatch = document.createElement('p');
      noMatch.className = 'center-text small';
      noMatch.textContent = 'No final match was selected.';
      container.appendChild(noMatch);
    }

    const restartBtn = document.createElement('button');
    restartBtn.textContent = 'Back to Lobby';
    restartBtn.onclick = () => {
      if (isHost) {
        gameState.phase = GamePhases.LOBBY;
        gameState.questions = [];
        gameState.answers = [];
        gameState.match = null;
        broadcastState();
      }
      render();
    };
    container.appendChild(restartBtn);
  }

  function promptSetSpotlight() {
    const names = gameState.players.map(p => `${p.name} (${p.id.slice(0, 4)})`).join('\n');
    const input = prompt(`Enter ID fragment of spotlight:\n${names}`);
    if (!input) return;
    const match = gameState.players.find(p => p.id.startsWith(input));
    if (!match) {
      alert('No player with that ID fragment.');
      return;
    }
    gameState.spotlightId = match.id;
    broadcastState();
    render();
  }

  // ---------- STATE + ACTIONS ----------

  function broadcastState() {
    if (!isHost) return;
    const json = JSON.stringify(gameState);
    bleBroadcastState(json);
  }

  function applyAction(action) {
    switch (action.type) {
      case 'JOIN': {
        if (!gameState.players.find(p => p.id === action.playerId)) {
          gameState.players.push({
            id: action.playerId,
            name: action.name,
            role: 'balloon',
            balloonStatus: 'intact',
            popReason: null,
          });
        }
        break;
      }
      case 'POP': {
        const p = gameState.players.find(p => p.id === action.playerId);
        if (p) {
          p.balloonStatus = 'popped';
          p.popReason = action.reason || null;
        }
        break;
      }
      case 'KEEP': {
        const p = gameState.players.find(p => p.id === action.playerId);
        if (p && p.balloonStatus !== 'popped') {
          p.balloonStatus = 'intact';
        }
        break;
      }
      case 'QUESTION': {
        const from = gameState.players.find(p => p.id === action.fromPlayerId);
        if (!from || from.balloonStatus === 'popped') break;
        if (!gameState.questions.find(q => q.fromPlayerId === from.id)) {
          const orderIndex = gameState.questions.length;
          gameState.questions.push({
            id: action.id,
            fromPlayerId: from.id,
            text: action.text,
            orderIndex,
          });
        }
        break;
      }
      case 'ANSWER': {
        const q = gameState.questions.find(q => q.id === action.questionId);
        if (!q) break;
        const existing = gameState.answers.find(a => a.questionId === q.id);
        if (existing) {
          existing.text = action.text;
        } else {
          gameState.answers.push({
            id: crypto.randomUUID(),
            questionId: q.id,
            fromPlayerId: action.fromPlayerId,
            text: action.text,
          });
        }
        break;
      }
      case 'FINAL_CHOICE': {
        const spotlight = gameState.players.find(p => p.id === action.spotlightId);
        const balloon = gameState.players.find(p => p.id === action.balloonId);
        if (!spotlight || !balloon) break;
        gameState.match = {
          spotlightId: spotlight.id,
          balloonId: balloon.id,
        };
        gameState.phase = GamePhases.RESULTS;
        break;
      }
    }
  }

  // ---------- INITIAL RENDER ----------

  document.addEventListener('DOMContentLoaded', render);
})();
