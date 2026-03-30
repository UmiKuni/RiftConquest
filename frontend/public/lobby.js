const socket = io();

const btnHost      = document.getElementById('btnHost');
const btnShowJoin  = document.getElementById('btnShowJoin');
const btnJoin      = document.getElementById('btnJoin');
const btnCancelJoin= document.getElementById('btnCancelJoin');
const mainActions  = document.getElementById('mainActions');
const joinActions  = document.getElementById('joinActions');
const roomDisplay  = document.getElementById('roomDisplay');
const roomCodeText = document.getElementById('roomCodeText');
const codeInput    = document.getElementById('codeInput');
const statusMsg    = document.getElementById('statusMsg');

// ─── Host ────────────────────────────────────────────────────────────────────
btnHost.addEventListener('click', () => {
  socket.emit('hostRoom');
  setStatus('Creating room…');
});

socket.on('roomCreated', ({ code }) => {
  mainActions.classList.add('hidden');
  joinActions.classList.add('hidden');
  roomDisplay.classList.remove('hidden');
  roomCodeText.textContent = code;
  setStatus('');
  // Store for redirect
  sessionStorage.setItem('roomCode', code);
  sessionStorage.setItem('playerIndex', '0');
  sessionStorage.setItem('myPlayerIndex', '0');
});

// ─── Join ────────────────────────────────────────────────────────────────────
btnShowJoin.addEventListener('click', () => {
  mainActions.classList.add('hidden');
  joinActions.classList.remove('hidden');
  codeInput.focus();
});

btnCancelJoin.addEventListener('click', () => {
  joinActions.classList.add('hidden');
  mainActions.classList.remove('hidden');
  setStatus('');
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

btnJoin.addEventListener('click', () => {
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 4) return setStatus('Please enter a 4-character code.', true);
  // Store index=1 BEFORE emitting so gameStarted callback can read it
  sessionStorage.setItem('roomCode', code);
  sessionStorage.setItem('playerIndex', '1');
  socket.emit('joinRoom', { code });
  setStatus('Joining room…');
});

// ─── Game Start ───────────────────────────────────────────────────────────────
socket.on('gameStarted', ({ code }) => {
  const myIdx = sessionStorage.getItem('playerIndex') || '0';
  window.location.href = `/game.html?room=${code}&player=${myIdx}`;
});

// ─── Errors ───────────────────────────────────────────────────────────────────
socket.on('joinError', (msg) => setStatus(msg, true));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.className = 'status-msg' + (isError ? ' error' : '');
}
