const GamePhases = {
  LOBBY: 'LOBBY',
  ROUND1: 'ROUND1',
  RESULTS: 'RESULTS',
};

let gameState = {
  gameId: null,
  phase: GamePhases.LOBBY,
  hostId: null,
  spotlightId: null,
  players: [],
  match: null,
};

let localPlayerId = null;
let isHost = false;
let stateChar = null;
let actionChar = null;

const SERVICE_UUID = '0000aaaa-0000-1000-8000-00805f9b34fb';
const STATE_CHAR_UUID = '0000aaab-0000-1000-8000-00805f9b34fb';
const ACTION_CHAR_UUID = '0000aaac-0000-1000-8000-00805f9b34fb';

function render() {
  const root = document.getElementById('app');
  root.innerHTML = '';

  if (!localPlayerId) {
    const div = document.createElement('div');
    div.className = 'center';
    div.innerHTML = `
      <h1>Balloon Game</h1>
      <button id="host-btn">Host Game</button>
      <button id="join-btn">Join Game</button>
    `;
    root.appendChild(div);
    document.getElementById('host-btn').onclick = startHostFlow;
    document.getElementById('join-btn').onclick = startJoinFlow;
    return;
  }

  if (gameState.phase === GamePhases.LOBBY) {
    renderLobby(root);
  } else if (gameState.phase === GamePhases.ROUND1) {
    renderRound1(root);
  } else if (gameState.phase === GamePhases.RESULTS) {
    renderResults(root);
  }
}

function renderLobby(root) {
  const me = gameState.players.find(p => p.id === localPlayerId);
  const div = document.createElement('div');
  div.className = 'center';

  const list = gameState.players.map(p => {
    const role = p.id === gameState.spotlightId ? ' (Spotlight)' : (p.role || '');
    return `<li>${p.name}${role}</li>`;
  }).join('');

  div.innerHTML = `
    <h2>Lobby</h2>
    <p>You are: ${me.name}</p>
    <ul>${list}</ul>
  `;

  if (isHost) {
    const setSpotBtn = document.createElement('button');
    setSpotBtn.textContent = 'Set Me as Spotlight';
    setSpotBtn.onclick = () => {
      gameState.spotlightId = localPlayerId;
      broadcastState();
      render();
    };
    div.appendChild(setSpotBtn);

    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start Round 1';
    startBtn.onclick = () => {
      gameState.phase = GamePhases.ROUND1;
      broadcastState();
      render();
    };
    div.appendChild(startBtn);
  }

  root.appendChild(div);
}

function renderRound1(root) {
  const me = gameState.players.find(p => p.id === localPlayerId);
  const spotlight = gameState.players.find(p => p.id === gameState.spotlightId);

  const div = document.createElement('div');
  div.className = 'center';

  if (localPlayerId === gameState.spotlightId) {
    const balloons = gameState.players.filter(p => p.id !== gameState.spotlightId);
    const list = balloons.map(p => {
      return `<li>${p.name} - ${p.balloonStatus || 'intact'}</li>`;
    }).join('');
    div.innerHTML = `
      <h2>Round 1 (You are Spotlight)</h2>
      <ul>${list}</ul>
    `;
    if (isHost) {
      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Finish Round 1';
      nextBtn.onclick = () => {
        gameState.phase = GamePhases.RESULTS;
        broadcastState();
        render();
      };
      div.appendChild(nextBtn);
    }
  } else {
    const status = me.balloonStatus || 'intact';
    div.innerHTML = `
      <h2>Round 1</h2>
      <p>Spotlight: ${spotlight ? spotlight.name : 'TBD'}</p>
      <p>Your balloon: ${status}</p>
    `;
    if (status === 'intact') {
      const keepBtn = document.createElement('button');
      keepBtn.textContent = 'Keep Balloon';
      keepBtn.onclick = () => {
        sendAction({ type: 'KEEP', playerId: localPlayerId });
      };
      const popBtn = document.createElement('button');
      popBtn.textContent = 'Pop Balloon';
      popBtn.onclick = () => {
        sendAction({ type: 'POP', playerId: localPlayerId, reason: 'looks' });
      };
      div.appendChild(keepBtn);
      div.appendChild(popBtn);
    }
  }

  root.appendChild(div);
}

function renderResults(root) {
  const div = document.createElement('div');
  div.className = 'center';
  const list = gameState.players
    .filter(p => p.id !== gameState.spotlightId)
    .map(p => `<li>${p.name} - ${p.balloonStatus || 'intact'}</li>`)
    .join('');
  div.innerHTML = `
    <h2>Results</h2>
    <ul>${list}</ul>
  `;
  root.appendChild(div);
}

function startHostFlow() {
  isHost = true;
  localPlayerId = crypto.randomUUID();
  gameState.gameId = crypto.randomUUID();
  gameState.hostId = localPlayerId;
  gameState.players.push({
    id: localPlayerId,
    name: 'Host',
    role: 'host',
    balloonStatus: 'intact',
  });
  setupHostBLE().then(() => {
    broadcastState();
    render();
  });
}

function startJoinFlow() {
  isHost = false;
  localPlayerId = crypto.randomUUID();
  joinHostBLE().then(() => {
    const name = prompt('Enter your name') || 'Player';
    sendAction({ type: 'JOIN', playerId: localPlayerId, name });
  });
}

async function setupHostBLE() {
  // This is conceptual; you’ll fill in with real Web Bluetooth GATT server logic.
  // For now, we just pretend it’s ready.
  console.log('Host BLE setup (placeholder)');
}

async function joinHostBLE() {
  if (!navigator.bluetooth) {
    alert('Bluetooth not supported');
    return;
  }
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }]
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  stateChar = await service.getCharacteristic(STATE_CHAR_UUID);
  actionChar = await service.getCharacteristic(ACTION_CHAR_UUID);

  await stateChar.startNotifications();
  stateChar.addEventListener('characteristicvaluechanged', (event) => {
    const value = new TextDecoder().decode(event.target.value);
    gameState = JSON.parse(value);
    render();
  });

  const initial = await stateChar.readValue();
  gameState = JSON.parse(new TextDecoder().decode(initial));
  render();
}

function broadcastState() {
  if (!isHost || !stateChar) return;
  const json = JSON.stringify(gameState);
  const data = new TextEncoder().encode(json);
  stateChar.writeValue(data).catch(console.error);
}

function sendAction(action) {
  if (!actionChar) return;
  const json = JSON.stringify(action);
  const data = new TextEncoder().encode(json);
  actionChar.writeValue(data).catch(console.error);
}

function applyAction(action) {
  switch (action.type) {
    case 'JOIN':
      if (!gameState.players.find(p => p.id === action.playerId)) {
        gameState.players.push({
          id: action.playerId,
          name: action.name,
          role: 'balloon',
          balloonStatus: 'intact',
        });
      }
      break;
    case 'POP': {
      const p = gameState.players.find(p => p.id === action.playerId);
      if (p) {
        p.balloonStatus = 'popped';
        p.popReason = action.reason;
      }
      break;
    }
    case 'KEEP': {
      const p = gameState.players.find(p => p.id === action.playerId);
      if (p && !p.balloonStatus) {
        p.balloonStatus = 'intact';
      }
      break;
    }
  }
}

render();
