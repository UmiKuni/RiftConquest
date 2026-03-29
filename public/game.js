const socket = io();
const REGIONS = ['Noxus', 'Demacia', 'Ionia'];

// ─── State ─────────────────────────────────────────────────────────────────
let gameState    = null;
let myIndex      = null;
let selectedCard = null;
let deployFaceDown = false;

// ─── Room & Player from URL ────────────────────────────────────────────────
const params      = new URLSearchParams(location.search);
const roomCode    = params.get('room') || sessionStorage.getItem('roomCode');
const playerIndex = parseInt(params.get('player') ?? sessionStorage.getItem('playerIndex') ?? '0', 10);
if (!roomCode) location.href = '/';

// ─── Guide FAB ────────────────────────────────────────────────────────────
const guideOverlay = document.getElementById('guideOverlay');
document.getElementById('guideBtn').addEventListener('click', () => guideOverlay.classList.remove('hidden'));
document.getElementById('guideClose').addEventListener('click', () => guideOverlay.classList.add('hidden'));
guideOverlay.addEventListener('click', (e) => { if (e.target === guideOverlay) guideOverlay.classList.add('hidden'); });

// ─── Socket Events ────────────────────────────────────────────────────────
socket.on('connect', () => {
  console.log('Connected:', socket.id);
  socket.emit('rejoinRoom', { code: roomCode, playerIndex });
});

socket.on('gameState', (state) => {
  gameState = state;
  myIndex   = state.myIndex;
  render();
});

socket.on('actionError', (msg) => showToast('⚠️ ' + msg, true));

socket.on('opponentLeft', () => {
  showToast('Opponent disconnected.', true);
  setTimeout(() => location.href = '/', 3000);
});

// ─── Main Render ──────────────────────────────────────────────────────────
function render() {
  if (!gameState) return;
  const s = gameState;

  // Scores & Round
  document.getElementById('myVP').textContent  = s.scores[myIndex];
  document.getElementById('oppVP').textContent = s.scores[1 - myIndex];
  document.getElementById('myVPBar').style.width  = Math.min(s.scores[myIndex] / 12 * 100, 100) + '%';
  document.getElementById('oppVPBar').style.width = Math.min(s.scores[1 - myIndex] / 12 * 100, 100) + '%';
  document.getElementById('roundNum').textContent = s.round;

  // Status bar
  const sb = document.getElementById('statusBar');
  if (s.phase === 'gameOver') {
    sb.textContent = '';
    showWinScreen(s.winner === myIndex);
    return;
  }
  if (s.pendingAbility) {
    sb.className = 'status-bar pending';
    sb.textContent = '⚡ ' + s.pendingAbility.label;
    const isMyAbility = s.pendingAbility.playerIdx === myIndex;
    const isN5OppFlip = s.pendingAbility.type === 'N5_opp_flip' && !isMyAbility;
    const isN5Self    = s.pendingAbility.type === 'N5_self_flip' && isMyAbility;
    if (isMyAbility || isN5OppFlip || isN5Self) {
      openAbilityModal(s.pendingAbility);
    }
  } else if (s.currentTurn === myIndex) {
    sb.className = 'status-bar your-turn';
    sb.textContent = '⚔️ Your turn — select a champion, then click a region.';
  } else {
    sb.className = 'status-bar';
    sb.textContent = '⏳ Waiting for opponent…';
  }

  renderBoard(s);
  renderHand(s.myHand);
  renderLog(s.log);

  document.getElementById('oppHandCount').textContent = `Opp: ${s.opponentHandCount} cards`;

  const canAct = s.currentTurn === myIndex && s.phase === 'playing' && !s.pendingAbility;
  document.getElementById('btnWithdraw').disabled = !canAct;
  document.getElementById('btnFaceDown').classList.toggle('hidden', !selectedCard || !canAct);
}

// ─── Board ────────────────────────────────────────────────────────────────
function renderBoard(s) {
  const board = document.getElementById('board');
  board.innerHTML = '';

  for (const region of REGIONS) {
    const col = document.createElement('div');
    col.className = 'region-col';
    col.setAttribute('data-region', region);

    const myStr  = calcStrengthClient(s, region, myIndex);
    const oppStr = calcStrengthClient(s, region, 1 - myIndex);
    const myCards  = s.regions[region][myIndex]      || [];
    const oppCards = s.regions[region][1 - myIndex]  || [];

    let crown = '';
    if (myStr > oppStr) crown = '<span class="control-crown" title="You control this region">👑</span>';
    if (oppStr > myStr) crown = '<span class="control-crown" style="filter:grayscale(1)" title="Opponent controls this region">👑</span>';

    col.innerHTML = `
      <div class="region-header">
        <span class="region-name">${region}</span>
        <div class="region-strength-bar">
          <span class="str-value str-my">${myStr}</span>
          <span class="str-sep">:</span>
          <span class="str-value str-opp">${oppStr}</span>
          ${crown}
        </div>
      </div>
      <div class="region-body">
        <div class="side-section opp-side" data-region="${region}" data-player="${1 - myIndex}">
          <div class="side-label">Opponent</div>
        </div>
        <div class="side-section my-side" data-region="${region}" data-player="${myIndex}">
          <div class="side-label">You</div>
        </div>
      </div>
    `;
    board.appendChild(col);

    // Populate cards
    const oppSection = col.querySelector('.opp-side');
    for (const c of oppCards) oppSection.appendChild(buildBoardCard(c, 1 - myIndex, region, s));
    const mySection = col.querySelector('.my-side');
    for (const c of myCards)  mySection.appendChild(buildBoardCard(c, myIndex, region, s));

    // Click = face-up deploy, right-click = face-down deploy
    col.addEventListener('click', () => {
      if (!selectedCard || !canActNow(s)) return;
      deployCard(selectedCard.id, region, deployFaceDown);
    });
    col.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!selectedCard || !canActNow(s)) return;
      deployCard(selectedCard.id, region, true);
    });

    if (selectedCard) col.classList.add('droppable-target');
  }

  document.getElementById('deployInstructions').classList.toggle('hidden', !selectedCard);
}

function canActNow(s) {
  return s && s.currentTurn === myIndex && s.phase === 'playing' && !s.pendingAbility;
}

// ─── Build a single board card element ────────────────────────────────────
function buildBoardCard(c, playerIdx, region, s) {
  const card = document.createElement('div');
  card.setAttribute('data-card-id', c.id);

  if (c.faceUp) {
    const def = getCardDef(c.id);
    card.className = 'board-card face-up-hoverable';
    card.innerHTML = `
      <img src="/image/${c.id}${getImgExt(c.id)}" alt="${def.champion}"
           onerror="this.style.display='none'" />
      <div class="card-face-info">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="card-name">${def.champion}</span>
          <span class="card-str">⚔ ${def.strength}</span>
        </div>
        ${def.type !== 'None' ? `<div><span class="card-type-badge type-${def.type}">${def.type}</span></div>` : ''}
      </div>
    `;

    // Hover → show card info in sidebar
    card.addEventListener('mouseenter', () => showCardInfo(def));
    card.addEventListener('mouseleave', hideCardInfo);

  } else {
    card.className = 'board-card facedown';
  }

  // Flip target highlight
  if (s.pendingAbility && isFlipTarget(s.pendingAbility, region, playerIdx, myIndex)) {
    card.classList.add('flip-target');
    card.style.cursor = 'crosshair';
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      socket.emit('abilityResponse', {
        targetCardId: c.id,
        targetRegion: region,
        targetPlayer: playerIdx,
      });
    });
  }

  return card;
}

function isFlipTarget(ab, region, cardPlayer, myIdx) {
  if (!ab) return false;
  if (ab.type === 'flip_any') return true;
  if (ab.type === 'flip_adjacent' && ab.playerIdx === myIdx) return true;
  if (ab.type === 'N5_opp_flip' && ab.playerIdx !== myIdx) return cardPlayer === (1 - myIdx);
  if (ab.type === 'N5_self_flip' && ab.playerIdx === myIdx) return cardPlayer === myIdx;
  return false;
}

// ─── Strength calculation (client-side for display) ────────────────────────
function calcStrengthClient(s, region, playerIdx) {
  const cards = s.regions[region][playerIdx] || [];
  let total = 0;

  const zedActive = REGIONS.some(r => (s.regions[r][playerIdx] || []).some(c => c.faceUp && c.id === 'I2'));
  const luxRegion = findCardRegion(s, 'D1', playerIdx);

  for (const c of cards) {
    const def = getCardDef(c.id);
    let str = c.faceUp ? def.strength : 2;
    if (!c.faceUp && zedActive) str = 4;
    total += str;
  }
  if (luxRegion && adjacentTo(luxRegion, region)) total += 3;
  return total;
}

function findCardRegion(s, cardId, playerIdx) {
  for (const r of REGIONS) {
    if ((s.regions[r][playerIdx] || []).some(c => c.id === cardId && c.faceUp)) return r;
  }
  return null;
}
function adjacentTo(r1, r2) {
  return Math.abs(REGIONS.indexOf(r1) - REGIONS.indexOf(r2)) === 1;
}

// ─── Hand ─────────────────────────────────────────────────────────────────
function renderHand(hand) {
  const container = document.getElementById('handCards');
  container.innerHTML = '';
  const canAct = canActNow(gameState);

  for (const card of (hand || [])) {
    const el = document.createElement('div');
    el.className = `hand-card region-${card.region}` + (selectedCard?.id === card.id ? ' selected' : '');
    el.setAttribute('data-id', card.id);

    el.innerHTML = `
      <img src="/image/${card.id}${getImgExt(card.id)}" alt="${card.champion}"
           onerror="this.onerror=null;this.style.minHeight='52px';this.style.display='block';this.style.background='#1a2035'" />
      <div class="card-info">
        <span class="c-str">${card.strength}</span>
        <div class="c-name">${card.champion}</div>
        <div class="c-region">${card.region}</div>
      </div>
    `;

    if (canAct) {
      el.addEventListener('click', () => selectCard(card));
    }
    // Hover on hand card → show card info in sidebar
    el.addEventListener('mouseenter', () => showCardInfo(card));
    el.addEventListener('mouseleave', hideCardInfo);

    container.appendChild(el);
  }
}

function selectCard(card) {
  if (selectedCard?.id === card.id) {
    selectedCard = null;
    deployFaceDown = false;
    document.getElementById('btnFaceDown').classList.add('hidden');
    document.getElementById('btnFaceDown').textContent = '🌑 Hidden Deploy';
  } else {
    selectedCard = { id: card.id, cardDef: card };
    deployFaceDown = false;
    document.getElementById('btnFaceDown').classList.remove('hidden');
  }
  renderHand(gameState.myHand);
  renderBoard(gameState);
}

// ─── Deploy ────────────────────────────────────────────────────────────────
function deployCard(cardId, region, faceDown) {
  socket.emit('playCard', { cardId, regionName: region, faceDown });
  selectedCard = null;
  deployFaceDown = false;
  document.getElementById('btnFaceDown').classList.add('hidden');
  document.getElementById('btnFaceDown').textContent = '🌑 Hidden Deploy';
}

document.getElementById('btnFaceDown').addEventListener('click', () => {
  if (!selectedCard) return;
  deployFaceDown = !deployFaceDown;
  document.getElementById('btnFaceDown').textContent =
    deployFaceDown ? '✅ Hidden ON — Click Region' : '🌑 Hidden Deploy';
});

document.getElementById('btnWithdraw').addEventListener('click', () => {
  if (!confirm('Retreat from this round? Your opponent will score Victory Points.')) return;
  socket.emit('withdraw');
});

// ─── Card Info Sidebar ─────────────────────────────────────────────────────
const CHAMPION_LORE = {
  Katarina: 'A Noxian assassin who moves without mercy, striking between heartbeats.',
  Talon: "The Blade's Shadow — silence before the kill.",
  Darius: 'The Hand of Noxus. He who hesitates is dead.',
  Swain: 'Grand General of Noxus, master of ravens and dark power.',
  LeBlanc: 'The Deceiver — every truth is a veil over a deeper lie.',
  Draven: 'The Glorious Executioner. He turns every battle into a spectacle.',
  Lux: 'The Lady of Luminosity, wielding light with precision and grace.',
  Quinn: 'Demacian ranger, soaring with her eagle Valor beyond enemy lines.',
  Garen: 'The Might of Demacia, spinning steel and unshakeable conviction.',
  'Jarvan IV': 'Crown Prince of Demacia, fighting in the vanguard of every battle.',
  Fiora: 'The Grand Duelist, for whom every fight is an elegant art form.',
  Galio: 'The Colossus, a stone sentinel forged to stand against magic.',
  Ahri: 'The Nine-Tailed Fox, dancing between worlds with a song of stolen spirits.',
  Zed: 'Master of Shadows — he and his shadow are never separated.',
  Shen: 'The Eye of Twilight, balancing the scales between body, mind, and spirit.',
  Yasuo: 'The Unforgiven, an exile whose blade brings both freedom and ruin.',
  Irelia: 'The Blade Dancer of Ionia, a storm of floating steel.',
  'Master Yi': 'The Wuju Bladesman — one hundred enemies, one perfect strike.',
};

let cardHideTimer = null;

function showCardInfo(def) {
  clearTimeout(cardHideTimer);
  document.getElementById('cardInfoIdle').classList.add('hidden');
  document.getElementById('cardInfoDetail').classList.remove('hidden');

  document.getElementById('cidImage').src = `/image/${def.id}${getImgExt(def.id)}`;
  document.getElementById('cidImage').alt = def.champion;
  document.getElementById('cidStrength').textContent = `⚔ ${def.strength}`;
  document.getElementById('cidName').textContent = def.champion;

  const regionBadge = document.getElementById('cidRegionBadge');
  regionBadge.textContent = def.region;
  regionBadge.className = `cid-region-badge region-badge-${def.region}`;

  const typeBadge = document.getElementById('cidTypeBadge');
  typeBadge.textContent = def.type;
  typeBadge.className = `cid-type-badge type-${def.type}`;

  const abilityBox = document.getElementById('cidAbilityBox');
  if (def.ability) {
    abilityBox.style.display = '';
    document.getElementById('cidAbility').textContent = def.ability;
  } else {
    abilityBox.style.display = 'none';
  }
  document.getElementById('cidLore').textContent = CHAMPION_LORE[def.champion] || '';
}

function hideCardInfo() {
  cardHideTimer = setTimeout(() => {
    document.getElementById('cardInfoIdle').classList.remove('hidden');
    document.getElementById('cardInfoDetail').classList.add('hidden');
  }, 350);
}

// ─── Log ───────────────────────────────────────────────────────────────────
let lastLogLength = 0;

function renderLog(log) {
  const container = document.getElementById('logScroll');
  if (!log || log.length === lastLogLength) return;

  const newEntries = log.slice(lastLogLength);
  lastLogLength = log.length;

  for (const entry of newEntries) {
    const div = document.createElement('div');
    div.className = 'log-entry new';
    div.textContent = entry;
    container.appendChild(div);
    setTimeout(() => div.classList.remove('new'), 1500);
  }
  container.scrollTop = container.scrollHeight;
}

// ─── Ability Modal ─────────────────────────────────────────────────────────
function openAbilityModal(ability) {
  const modal  = document.getElementById('abilityModal');
  const title  = document.getElementById('modalTitle');
  const desc   = document.getElementById('modalDesc');
  const opts   = document.getElementById('modalOptions');
  const footer = document.getElementById('modalFooter');

  title.textContent = abilityTitle(ability.type);
  desc.textContent  = ability.label || '';
  opts.innerHTML    = '';
  footer.innerHTML  = '';

  switch (ability.type) {
    case 'N1_peek': {
      const top = ability.topCard;
      desc.textContent = `Top card: ${top.champion} (${top.region}, STR ${top.strength}). Deploy facedown to an adjacent region?`;
      for (const r of adjacentRegions('Noxus')) {
        const btn = mkModalOption(r, '📍 ' + r, 'Deploy facedown here');
        btn.addEventListener('click', () => { socket.emit('abilityResponse', { deploy: true, regionName: r }); closeModal(); });
        opts.appendChild(btn);
      }
      footer.appendChild(mkBtn('Skip', 'btn btn-secondary btn-sm', () => { socket.emit('abilityResponse', { deploy: false }); closeModal(); }));
      break;
    }
    case 'flip_any':
    case 'flip_adjacent':
    case 'N5_opp_flip':
    case 'N5_self_flip': {
      desc.textContent = ability.label + ' Click the highlighted card on the board.';
      footer.appendChild(mkBtn('Cancel', 'btn btn-secondary btn-sm', closeModal));
      break;
    }
    case 'I1_move': {
      desc.textContent = 'Choose one of your cards to move to a different region.';
      let step = 'pick'; let pickedCard = null; let pickedFrom = null;
      for (const r of REGIONS) {
        for (const c of (gameState.regions[r][myIndex] || [])) {
          const def = getCardDef(c.id);
          const el = mkModalOption(c.id, def.champion, r + (c.faceUp ? ' · STR ' + def.strength : ' · facedown'));
          el.addEventListener('click', () => {
            if (step !== 'pick') return;
            pickedCard = c.id; pickedFrom = r; step = 'dest';
            opts.innerHTML = '';
            desc.textContent = `Move ${def.champion} to which region?`;
            for (const dr of REGIONS) {
              if (dr === r) continue;
              const d = mkModalOption(dr, '📍 ' + dr, 'Move here');
              d.addEventListener('click', () => { socket.emit('abilityResponse', { cardId: pickedCard, fromRegion: pickedFrom, toRegion: dr }); closeModal(); });
              opts.appendChild(d);
            }
          });
          opts.appendChild(el);
        }
      }
      footer.appendChild(mkBtn('Skip', 'btn btn-secondary btn-sm', () => { socket.emit('abilityResponse', { skip: true }); closeModal(); }));
      break;
    }
    case 'I4_return': {
      desc.textContent = 'Return a facedown card to hand and gain an extra turn, or skip.';
      let anyFound = false;
      for (const r of REGIONS) {
        for (const c of (gameState.regions[r][myIndex] || [])) {
          if (!c.faceUp) {
            anyFound = true;
            const def = getCardDef(c.id);
            const el = mkModalOption(c.id, def.champion, r + ' — return for extra turn');
            el.addEventListener('click', () => { socket.emit('abilityResponse', { cardId: c.id, fromRegion: r }); closeModal(); });
            opts.appendChild(el);
          }
        }
      }
      if (!anyFound) desc.textContent = 'No facedown cards to return.';
      footer.appendChild(mkBtn('Skip', 'btn btn-secondary btn-sm', () => { socket.emit('abilityResponse', { skip: true }); closeModal(); }));
      break;
    }
  }

  modal.classList.remove('hidden');
}

function closeModal() { document.getElementById('abilityModal').classList.add('hidden'); }

function abilityTitle(type) {
  return {
    N1_peek: 'Katarina — Peek', flip_any: 'Talon — Flip Card',
    flip_adjacent: 'Flip Adjacent Card', N5_opp_flip: 'LeBlanc — Opponent Flips',
    N5_self_flip: 'LeBlanc — You Flip', I1_move: 'Ahri — Move Card',
    I4_return: 'Yasuo — Return Card',
  }[type] || 'Champion Ability';
}

function mkModalOption(id, name, info) {
  const el = document.createElement('div');
  el.className = 'modal-option';
  el.innerHTML = `<div><div class="opt-name">${name}</div><div class="opt-info">${info}</div></div>`;
  return el;
}
function mkBtn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = cls; b.textContent = label;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

// ─── Win Screen ────────────────────────────────────────────────────────────
function showWinScreen(iWon) {
  const win = document.getElementById('winOverlay');
  document.getElementById('winTrophy').textContent = iWon ? '🏆' : '💀';
  document.getElementById('winTitle').textContent  = iWon ? 'Victory!' : 'Defeated!';
  document.getElementById('winDesc').textContent   = iWon
    ? `You conquered the Rift with ${gameState.scores[myIndex]} VP!`
    : `Opponent reached ${gameState.scores[1 - myIndex]} VP. Don't give up.`;
  win.classList.remove('hidden');
}

// ─── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  if (isError) t.style.borderColor = 'rgba(231,76,60,0.6)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

// ─── Helpers ───────────────────────────────────────────────────────────────
const CARD_DEFS = {
  N1:{id:'N1',region:'Noxus',strength:1,champion:'Katarina',type:'Instant',ability:'Look at the top card of the deck. You may play it facedown to an adjacent region.'},
  N2:{id:'N2',region:'Noxus',strength:2,champion:'Talon',type:'Instant',ability:'Flip a card in any region.'},
  N3:{id:'N3',region:'Noxus',strength:3,champion:'Darius',type:'Instant',ability:'Flip a card in an adjacent region.'},
  N4:{id:'N4',region:'Noxus',strength:4,champion:'Swain',type:'Ongoing',ability:'All cards covered by this card are now strength 4.'},
  N5:{id:'N5',region:'Noxus',strength:5,champion:'LeBlanc',type:'Instant',ability:'Your opponent chooses and flips 1 of their cards. Then you flip 1 of yours.'},
  N6:{id:'N6',region:'Noxus',strength:6,champion:'Draven',type:'None',ability:null},
  D1:{id:'D1',region:'Demacia',strength:1,champion:'Lux',type:'Ongoing',ability:'You gain +3 strength in each adjacent region.'},
  D2:{id:'D2',region:'Demacia',strength:2,champion:'Quinn',type:'Instant',ability:'On your next turn, you may play a card to a non-matching region.'},
  D3:{id:'D3',region:'Demacia',strength:3,champion:'Garen',type:'Instant',ability:'Flip a card in an adjacent region.'},
  D4:{id:'D4',region:'Demacia',strength:4,champion:'Jarvan IV',type:'Ongoing',ability:'You may play cards of strength 3 or less to non-matching regions.'},
  D5:{id:'D5',region:'Demacia',strength:5,champion:'Fiora',type:'Ongoing',ability:'If either player plays a facedown card, discard that card with no effect.'},
  D6:{id:'D6',region:'Demacia',strength:6,champion:'Galio',type:'None',ability:null},
  I1:{id:'I1',region:'Ionia',strength:1,champion:'Ahri',type:'Instant',ability:'You may move 1 of your cards to a different region.'},
  I2:{id:'I2',region:'Ionia',strength:2,champion:'Zed',type:'Ongoing',ability:'All of your facedown cards are now strength 4.'},
  I3:{id:'I3',region:'Ionia',strength:3,champion:'Shen',type:'Instant',ability:'Flip a card in an adjacent region.'},
  I4:{id:'I4',region:'Ionia',strength:4,champion:'Yasuo',type:'Instant',ability:'Return 1 of your facedown cards to your hand. If you do, gain an extra turn.'},
  I5:{id:'I5',region:'Ionia',strength:5,champion:'Irelia',type:'Ongoing',ability:'If a card is played to an adjacent region with 3+ cards already, discard it.'},
  I6:{id:'I6',region:'Ionia',strength:6,champion:'Master Yi',type:'None',ability:null},
};

function getCardDef(id) { return CARD_DEFS[id] || { id, champion: id, region: '', strength: 0, type: 'None', ability: null }; }

const IMG_EXT = {
  N1:'jpg',N2:'png',N3:'png',N4:'png',N5:'png',N6:'jpg',
  D1:'jpg',D2:'png',D3:'jpg',D4:'png',D5:'jpg',D6:'png',
  I1:'png',I2:'jpg',I3:'jpg',I4:'jpg',I5:'png',I6:'png',
};
function getImgExt(id) { return '.' + (IMG_EXT[id] || 'png'); }

function adjacentRegions(r) {
  const i = REGIONS.indexOf(r);
  const adj = [];
  if (i > 0) adj.push(REGIONS[i - 1]);
  if (i < REGIONS.length - 1) adj.push(REGIONS[i + 1]);
  return adj;
}
