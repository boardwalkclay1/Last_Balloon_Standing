const GamePhases = {
  MODE_SELECT: 'MODE_SELECT',
  NAME_ENTRY: 'NAME_ENTRY',
  LOBBY: 'LOBBY',
  ROUND1: 'ROUND1',
  RESULTS: 'RESULTS',
};

let gameState = {
  gameId: null,
  phase: GamePhases.MODE_SELECT,
  hostId: null,
  spotlightId: null,
  players: [],
  match: null,
};

let localPlayerId = null;
let isHost = false;

// ---------- BLE BRIDGE HOOKS ----------
// These call into ble-bridge.js (native BLE via Capacitor)

function bleBroadcastState(jsonString) {
  window.BLEBridge.broadcastState(jsonString);
}

function bleSendAction(jsonString) {
  window.BLEBridge.sendAction(jsonString);
}

// Called by native BLE when host broadcasts state
window.onBleStateReceived = function (jsonString) {
  try {
    const remote = JSON.parse(jsonString);
    gameState = remote;
    render();
  } catch (e) {
    console.error('Failed to parse state from BLE', e);
  }
};

// Called by native BLE when host receives an action
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
    gameState.phase = GamePhases.NAME_ENTRY;
    window.BLEBridge.startHost(); // start advertising / accepting connections
    render();
  };

  const joinBtn = document.createElement('button');
  joinBtn.textContent = 'Join Game';
  joinBtn.className = 'secondary';
  joinBtn.onclick = () => {
    isHost = false;
    localPlayerId = crypto.randomUUID();
    gameState.phase = GamePhases.NAME_ENTRY;
    window.BLEBridge.startClient(); // start scanning / connecting
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
      const finishBtn = document.createElement('button');
      finishBtn.textContent = 'Finish Round 1';
      finishBtn.onclick = () => {
        gameState.phase = GamePhases.RESULTS;
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

function renderResults(container) {
  const spotlight = gameState.players.find(p => p.id === gameState.spotlightId);
  container.innerHTML = `
    <h2>Results</h2>
    <p class="center-text small">Round 1 finished.</p>
    <p class="center-text">Spotlight: ${spotlight ? spotlight.name : 'Unknown'}</p>
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

  const restartBtn = document.createElement('button');
  restartBtn.textContent = 'Back to Lobby';
  restartBtn.onclick = () => {
    if (isHost) {
      gameState.phase = GamePhases.LOBBY;
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
  }
}

// ---------- INITIAL RENDER ----------

render();
