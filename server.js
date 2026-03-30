const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/image', express.static(path.join(__dirname, 'image')));

// ─── Card Data ─────────────────────────────────────────────────────────────
const CARDS = [
  { id: 'N1', region: 'Noxus',   strength: 1, champion: 'Katarina',  type: 'Instant',  ability: 'Look at the top card of the deck. You may play it facedown to an adjacent region.' },
  { id: 'N2', region: 'Noxus',   strength: 2, champion: 'Talon',     type: 'Instant',  ability: 'Flip a card in any region.' },
  { id: 'N3', region: 'Noxus',   strength: 3, champion: 'Darius',    type: 'Instant',  ability: 'Flip a card in an adjacent region.' },
  { id: 'N4', region: 'Noxus',   strength: 4, champion: 'Swain',     type: 'Ongoing',  ability: 'All cards covered by this card are now strength 4.' },
  { id: 'N5', region: 'Noxus',   strength: 5, champion: 'LeBlanc',   type: 'Instant',  ability: 'Your opponent chooses and flips 1 of their cards. Then you flip 1 of yours.' },
  { id: 'N6', region: 'Noxus',   strength: 6, champion: 'Draven',    type: 'None',     ability: null },
  { id: 'D1', region: 'Demacia', strength: 1, champion: 'Lux',       type: 'Ongoing',  ability: 'You gain +3 strength in each adjacent region.' },
  { id: 'D2', region: 'Demacia', strength: 2, champion: 'Quinn',     type: 'Instant',  ability: 'On your next turn, you may play a card to a non-matching region.' },
  { id: 'D3', region: 'Demacia', strength: 3, champion: 'Garen',     type: 'Instant',  ability: 'Flip a card in an adjacent region.' },
  { id: 'D4', region: 'Demacia', strength: 4, champion: 'Jarvan IV', type: 'Ongoing',  ability: 'You may play cards of strength 3 or less to non-matching regions.' },
  { id: 'D5', region: 'Demacia', strength: 5, champion: 'Fiora',     type: 'Ongoing',  ability: 'If either player plays a facedown card, discard that card with no effect.' },
  { id: 'D6', region: 'Demacia', strength: 6, champion: 'Galio',     type: 'None',     ability: null },
  { id: 'I1', region: 'Ionia',   strength: 1, champion: 'Ahri',      type: 'Instant',  ability: 'You may move 1 of your cards to a different region.' },
  { id: 'I2', region: 'Ionia',   strength: 2, champion: 'Zed',       type: 'Ongoing',  ability: 'All of your facedown cards are now strength 4.' },
  { id: 'I3', region: 'Ionia',   strength: 3, champion: 'Shen',      type: 'Instant',  ability: 'Flip a card in an adjacent region.' },
  { id: 'I4', region: 'Ionia',   strength: 4, champion: 'Yasuo',     type: 'Instant',  ability: 'Return 1 of your facedown cards to your hand. If you do, gain an extra turn.' },
  { id: 'I5', region: 'Ionia',   strength: 5, champion: 'Irelia',    type: 'Ongoing',  ability: 'If a card is played to an adjacent region with 3+ cards already, discard it.' },
  { id: 'I6', region: 'Ionia',   strength: 6, champion: 'Master Yi', type: 'None',     ability: null },
];

const REGIONS = ['Noxus', 'Demacia', 'Ionia'];
const WITHDRAWAL_SCORE = { 0: 6, 1: 5, 2: 4, 3: 3, 4: 2, 5: 2, 6: 2 };

// ─── Utility ────────────────────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function getCardById(id) {
  return CARDS.find(c => c.id === id);
}

// ─── Room State Factory ─────────────────────────────────────────────────────
function createGameState(initiative = 0) {
  return {
    phase: 'playing',          // 'playing' | 'roundEnd' | 'gameOver'
    round: 0,
    currentTurn: initiative,            // 0 or 1 (index of player whose turn it is)
    initiative: initiative,             // who goes first next round
    scores: [0, 0],
    deck: [],                      
    hands: [[], []],     
    withdrawn: [false, false],
    extraTurn: [false, false],  // Yasuo effect
    quinnEffect: [false, false],// Quinn effect
    regions: {                 // 'Noxus', 'Demacia', 'Ionia'
      Noxus:   { 0: [], 1: [] },
      Demacia: { 0: [], 1: [] },
      Ionia:   { 0: [], 1: [] },
    },
    log: [],
    // Pending ability state (for multi-step abilities)
    pendingAbility: null,
    abilityQueue: [],
  };
}

// ─── Region helpers ─────────────────────────────────────────────────────────
function adjacentRegions(regionName) {
  const idx = REGIONS.indexOf(regionName);
  const adj = [];
  if (idx > 0) adj.push(REGIONS[idx - 1]);
  if (idx < REGIONS.length - 1) adj.push(REGIONS[idx + 1]);
  return adj;
}

// Returns total strength for a player in a region, applying Ongoing effects
function calcStrength(state, regionName, playerIdx) {
  const myCards = state.regions[regionName][playerIdx];
  const oppIdx = 1 - playerIdx;

  // Collect active Ongoing cards for both players across all regions
  const allOngoing = {};
  for (const r of REGIONS) {
    for (const p of [0, 1]) {
      for (const c of state.regions[r][p]) {
        if (c.faceUp && getCardById(c.id).type === 'Ongoing') {
          if (!allOngoing[c.id]) allOngoing[c.id] = { card: getCardById(c.id), player: p, region: r };
        }
      }
    }
  }

  let total = 0;
  for (const c of myCards) {
    const cardDef = getCardById(c.id);
    let str = c.faceUp ? cardDef.strength : 2;

    // I2 Zed: all my facedown cards become strength 4
    const zedActive = Object.values(allOngoing).some(o => o.card.id === 'I2' && o.player === playerIdx);
    if (!c.faceUp && zedActive) str = 4;

    // N4 Swain: cards under Swain become strength 4
    // Swain effect applies to cards that Swain is placed on top of, tracked by coveredBy
    if (c.coveredBySwain) str = 4;

    total += str;
  }

  // D1 Lux: +3 in each adjacent region where Lux belongs to playerIdx
  const luxActive = Object.values(allOngoing).find(o => o.card.id === 'D1' && o.player === playerIdx);
  if (luxActive) {
    const luxAdj = adjacentRegions(luxActive.region);
    if (luxAdj.includes(regionName)) total += 3;
  }

  return total;
}

// Determine who controls each region (returns 0, 1, or null for tie)
function resolveRegions(state) {
  const results = {};
  for (const r of REGIONS) {
    const s0 = calcStrength(state, r, 0);
    const s1 = calcStrength(state, r, 1);
    if (s0 > s1) results[r] = 0;
    else if (s1 > s0) results[r] = 1;
    else results[r] = null; // tie — initiative wins
  }
  return results;
}

function hasAnyCards(state, playerIdx) {
  return Object.values(state.regions).some(r => r[playerIdx].length > 0) || state.hands[playerIdx].length > 0;
}

// ─── Ability Resolution ─────────────────────────────────────────────────────

function handleCardFlippedFaceUp(state, targetCard, targetRegion, targetPlayer) {
  const cardDef = getCardById(targetCard.id);
  if (cardDef.type === 'Instant') {
    state.log.push(`⚡ ${cardDef.champion}'s Instant ability triggered!`);
    const result = applyInstantAbility(state, targetCard.id, targetPlayer, targetRegion);
    if (result.pendingAbility) {
      state.abilityQueue.push(result.pendingAbility);
    }
  }
}

// Returns { newState, pendingAbility } where pendingAbility is non-null if
// client needs to respond with more info before turn ends.
function applyInstantAbility(state, cardId, playerIdx, playedRegion) {
  const card = getCardById(cardId);
  if (!card || card.type !== 'Instant') return { state, pendingAbility: null };

  switch (cardId) {
    case 'N1': // Katarina — show top card, optionally deploy facedown to adjacent
      if (state.deck.length > 0) {
        return { state, pendingAbility: { type: 'N1_peek', playerIdx, topCard: state.deck[0] } };
      }
      break;

    case 'N2': // Talon — flip any card on the board
      return { state, pendingAbility: { type: 'flip_any', playerIdx, label: 'Talon: Flip any card on the board.' } };

    case 'N3': // Darius — flip a card in an adjacent region
    case 'D3': // Garen — same
    case 'I3': // Shen  — same
      return { state, pendingAbility: { type: 'flip_adjacent', playerIdx, sourceCard: cardId, playedRegion, label: `${card.champion}: Flip a card in an adjacent region.` } };

    case 'N5': // LeBlanc — opponent flips one of theirs, then you flip one of yours
      return { state, pendingAbility: { type: 'N5_opp_flip', playerIdx, label: 'LeBlanc: Opponent must flip one of their cards.' } };

    case 'D2': // Quinn — next turn deploy to non-matching
      state.quinnEffect[playerIdx] = true;
      state.log.push(`Quinn: ${playerIdx === 0 ? 'You' : 'Opponent'} may play a card to a non-matching region next turn.`);
      break;

    case 'I1': // Ahri — move one of your cards to a different region
      return { state, pendingAbility: { type: 'I1_move', playerIdx, label: 'Ahri: Move one of your cards to a different region.' } };

    case 'I4': // Yasuo — return a facedown card to hand, gain extra turn
      return { state, pendingAbility: { type: 'I4_return', playerIdx, label: 'Yasuo: Return a facedown card to your hand for an extra turn (or skip).' } };
  }

  return { state, pendingAbility: null };
}

// Helper for withdrawal score
function retreatVP(oppHandCount) {
  return WITHDRAWAL_SCORE[Math.min(oppHandCount, 6)] || 2;
}

// ─── Start new round ────────────────────────────────────────────────────────
function startNewRound(state) {
  const deck = shuffle([...CARDS]);
  state.hands[0] = deck.splice(0, 6);
  state.hands[1] = deck.splice(0, 6);
  state.deck = deck;
  state.regions = { Noxus: { 0: [], 1: [] }, Demacia: { 0: [], 1: [] }, Ionia: { 0: [], 1: [] } };
  state.withdrawn = [false, false];
  state.extraTurn = [false, false];
  state.quinnEffect = [false, false];
  state.pendingAbility = null;
  state.abilityQueue = [];
  state.currentTurn = state.initiative;
  state.round++;
  state.phase = 'playing';
  state.log.push(`--- Round ${state.round} begins. Player ${state.initiative + 1} has initiative ---`);
  return state;
}

// ─── Rooms ───────────────────────────────────────────────────────────────────
const rooms = {}; // roomCode => { players: [socketId, socketId], state: GameState }

function getRoomOfSocket(socketId) {
  for (const [code, room] of Object.entries(rooms)) {
    if (room.players.includes(socketId)) return { code, room };
  }
  return null;
}

function playerIndexOf(room, socketId) {
  return room.players.indexOf(socketId);
}

// Broadcast the view-specific game state (hide opponent hand card details)
function broadcastState(code) {
  const room = rooms[code];
  if (!room) return;

  for (let i = 0; i < 2; i++) {
    const sid = room.players[i];
    if (!sid) continue;
    const oppIdx = 1 - i;

    // Build view: opponent hand shows only count
    const view = {
      ...room.state,
      myIndex: i,
      myHand: room.state.hands[i],
      opponentHandCount: room.state.hands[oppIdx].length,
      scores: room.state.scores,
    };
    // Don't send full hands array with opponent cards
    delete view.hands;

    io.to(sid).emit('gameState', view);
  }
}

// ─── Socket Events ───────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // HOST
  socket.on('hostRoom', () => {
    let code = generateCode();
    while (rooms[code]) code = generateCode();
    rooms[code] = { players: [socket.id, null], state: null };
    socket.join(code);
    socket.emit('roomCreated', { code });
    console.log(`Room ${code} created by ${socket.id}`);
  });

  // JOIN
  socket.on('joinRoom', ({ code }) => {
    const room = rooms[code];
    if (!room) return socket.emit('joinError', 'Room not found.');
    if (room.players[1]) return socket.emit('joinError', 'Room is full.');

    room.players[1] = socket.id;
    socket.join(code);

    // Start game
    const startingInitiative = Math.floor(Math.random() * 2);
    room.state = createGameState(startingInitiative);
    startNewRound(room.state);

    io.to(code).emit('gameStarted', { code });
    broadcastState(code);
    console.log(`Room ${code} — game started`);
  });

  // PLAY CARD
  socket.on('playCard', ({ cardId, regionName, faceDown }) => {
    const found = getRoomOfSocket(socket.id);
    if (!found) return;
    const { code, room } = found;
    const state = room.state;
    const pIdx = playerIndexOf(room, socket.id);

    if (state.phase !== 'playing') return;
    if (state.currentTurn !== pIdx) return socket.emit('actionError', 'Not your turn.');
    if (state.withdrawn[pIdx]) return socket.emit('actionError', 'You have already withdrawn.');
    if (state.pendingAbility) return socket.emit('actionError', 'Resolve pending ability first.');

    const cardDef = getCardById(cardId);
    if (!cardDef) return socket.emit('actionError', 'Invalid card.');

    // Check card is in hand
    const handIdx = state.hands[pIdx].findIndex(c => c.id === cardId);
    if (handIdx === -1) return socket.emit('actionError', 'Card not in hand.');

    // Validate region rules
    if (faceDown) {
      // Face-down allowed anywhere
    } else {
      // Face-up must go to matching region unless Quinn or Jarvan IV effect
      const jarvanActive = Object.values(state.regions).some(r =>
        r[pIdx].some(c => c.faceUp && c.id === 'D4')
      );
      const canPlayAnywhere = state.quinnEffect[pIdx] ||
        (jarvanActive && cardDef.strength <= 3);

      if (cardDef.region !== regionName && !canPlayAnywhere) {
        return socket.emit('actionError', `${cardDef.champion} must be played to ${cardDef.region} face-up.`);
      }
    }

    // D5 Fiora: discard facedown cards
    const fioraActive = Object.values(state.regions).some(r =>
      r[1 - pIdx].some(c => c.faceUp && c.id === 'D5') ||
      r[pIdx].some(c => c.faceUp && c.id === 'D5')
    );
    if (faceDown && fioraActive) {
      state.hands[pIdx].splice(handIdx, 1);
      state.log.push(`Fiora discards ${cardDef.champion} (facedown)!`);
      advanceTurn(state, code, room);
      broadcastState(code);
      return;
    }

    // I5 Irelia: discard if adjacent region has 3+ cards
    if (!faceDown) {
      const adjR = adjacentRegions(regionName);
      const irelia0Active = state.regions[regionName][0].some(c => c.faceUp && c.id === 'I5');
      const irelia1Active = state.regions[regionName][1].some(c => c.faceUp && c.id === 'I5');
      const iriActive = irelia0Active || irelia1Active;
      // Check if target region's adjacent has 3+ for the PLAYING player
      // Rule: if a card is played to adjacent region with 3+ cards already, discard it
      // "adjacent region" here means: the region receiving the card is adjacent to Irelia's region
      // and has 3+ cards total
      if (iriActive) {
        const iriRegion = REGIONS.find(r =>
          state.regions[r][0].some(c => c.faceUp && c.id === 'I5') ||
          state.regions[r][1].some(c => c.faceUp && c.id === 'I5')
        );
        if (iriRegion) {
          const adjToIri = adjacentRegions(iriRegion);
          if (adjToIri.includes(regionName)) {
            const totalCards = state.regions[regionName][0].length + state.regions[regionName][1].length;
            if (totalCards >= 3) {
              state.hands[pIdx].splice(handIdx, 1);
              state.log.push(`Irelia discards ${cardDef.champion} played to ${regionName}!`);
              advanceTurn(state, code, room);
              broadcastState(code);
              return;
            }
          }
        }
      }
    }

    // Place card
    state.hands[pIdx].splice(handIdx, 1);
    const placedCard = { id: cardId, faceUp: !faceDown };
    state.regions[regionName][pIdx].push(placedCard);

    // Reset Quinn effect after use
    if (state.quinnEffect[pIdx] && cardDef.region !== regionName) {
      state.quinnEffect[pIdx] = false;
    }

    state.log.push(`Player ${pIdx + 1} plays ${faceDown ? 'facedown card' : cardDef.champion} to ${regionName}.`);

    // Resolve instant ability
    if (!faceDown && cardDef.type === 'Instant') {
      const result = applyInstantAbility(state, cardId, pIdx, regionName);
      room.state = result.state;
      if (result.pendingAbility) {
        room.state.pendingAbility = result.pendingAbility;
        broadcastState(code);
        return; // Wait for ability response
      }
    }

    advanceTurn(state, code, room);
    broadcastState(code);
  });

  // ABILITY RESPONSE
  socket.on('abilityResponse', (data) => {
    const found = getRoomOfSocket(socket.id);
    if (!found) return;
    const { code, room } = found;
    const state = room.state;
    const pIdx = playerIndexOf(room, socket.id);

    if (!state.pendingAbility) return;
    const ability = state.pendingAbility;

    // Only the relevant player can respond
    if (ability.type !== 'N5_opp_flip' && ability.playerIdx !== pIdx) return;
    if (ability.type === 'N5_opp_flip' && pIdx !== 1 - ability.playerIdx) return;

    switch (ability.type) {
      case 'N1_peek': {
        // data: { deploy: bool, regionName: string|null }
        if (data.deploy && state.deck.length > 0 && data.regionName) {
          const topCard = state.deck.shift();
          
          // D5 Fiora check: discard if either player has an active Fiora
          const fioraActive = Object.values(state.regions).some(r =>
            r[1 - pIdx].some(c => c.faceUp && c.id === 'D5') ||
            r[pIdx].some(c => c.faceUp && c.id === 'D5')
          );

          if (fioraActive) {
            state.log.push(`Katarina: ${pIdx === 0 ? 'You' : 'Opponent'} tried to deploy ${topCard.champion} facedown to ${data.regionName}, but Fiora discarded it!`);
          } else {
            // Must be adjacent to Noxus (where Katarina was played)
            state.regions[data.regionName][pIdx].push({ id: topCard.id, faceUp: false });
            state.log.push(`Katarina: ${pIdx === 0 ? 'You' : 'Opponent'} deployed ${topCard.champion} facedown to ${data.regionName}.`);
          }
        } else {
          state.log.push(`Katarina: ${pIdx === 0 ? 'You' : 'Opponent'} chose not to deploy.`);
        }
        state.pendingAbility = null;
        break;
      }
      case 'flip_any':
      case 'flip_adjacent': {
        // data: { targetCardId, targetRegion, targetPlayer }
        const target = state.regions[data.targetRegion]?.[data.targetPlayer]?.find(c => c.id === data.targetCardId);
        if (target) {
          target.faceUp = !target.faceUp;
          state.log.push(`${getCardById(ability.sourceCard || 'N2')?.champion || 'Card'}: Flipped ${getCardById(data.targetCardId)?.champion}.`);
          if (target.faceUp) handleCardFlippedFaceUp(state, target, data.targetRegion, data.targetPlayer);
        }
        state.pendingAbility = null;
        break;
      }
      case 'N5_opp_flip': {
        // Opponent is flipping one of their cards
        const target = state.regions[data.targetRegion]?.[pIdx]?.find(c => c.id === data.targetCardId);
        if (target) {
          target.faceUp = !target.faceUp;
          state.log.push(`LeBlanc: Opponent flipped ${getCardById(data.targetCardId)?.champion}.`);
          if (target.faceUp) handleCardFlippedFaceUp(state, target, data.targetRegion, pIdx);
        }
        // Now player (LeBlanc owner) flips one of theirs
        state.pendingAbility = { type: 'N5_self_flip', playerIdx: ability.playerIdx, label: 'LeBlanc: Now flip one of your own cards.' };
        broadcastState(code);
        return;
      }
      case 'N5_self_flip': {
        const target = state.regions[data.targetRegion]?.[pIdx]?.find(c => c.id === data.targetCardId);
        if (target) {
          target.faceUp = !target.faceUp;
          state.log.push(`LeBlanc: You flipped ${getCardById(data.targetCardId)?.champion}.`);
          if (target.faceUp) handleCardFlippedFaceUp(state, target, data.targetRegion, pIdx);
        }
        state.pendingAbility = null;
        break;
      }
      case 'I1_move': {
        // data: { cardId, fromRegion, toRegion }
        const fromArr = state.regions[data.fromRegion]?.[pIdx];
        if (fromArr) {
          const cIdx = fromArr.findIndex(c => c.id === data.cardId);
          if (cIdx !== -1) {
            const [moved] = fromArr.splice(cIdx, 1);
            state.regions[data.toRegion][pIdx].push(moved);
            state.log.push(`Ahri: Moved ${getCardById(data.cardId)?.champion} from ${data.fromRegion} to ${data.toRegion}.`);
          }
        }
        state.pendingAbility = null;
        break;
      }
      case 'I4_return': {
        // data: { cardId, fromRegion } or { skip: true }
        if (!data.skip && data.cardId && data.fromRegion) {
          const fromArr = state.regions[data.fromRegion]?.[pIdx];
          if (fromArr) {
            const cIdx = fromArr.findIndex(c => c.id === data.cardId && !c.faceUp);
            if (cIdx !== -1) {
              const [returned] = fromArr.splice(cIdx, 1);
              state.hands[pIdx].push(getCardById(returned.id));
              state.extraTurn[pIdx] = true;
              state.log.push(`Yasuo: Returned ${getCardById(data.cardId)?.champion} to hand. Extra turn granted!`);
            }
          }
        } else {
          state.log.push(`Yasuo: Skipped returning card.`);
        }
        state.pendingAbility = null;
        break;
      }
    }

    if (!state.pendingAbility && state.abilityQueue.length > 0) {
      state.pendingAbility = state.abilityQueue.shift();
      broadcastState(code);
      return;
    }

    // After resolving ability sequence, advance turn 
    if (!state.pendingAbility) {
      advanceTurn(state, code, room);
    }
    broadcastState(code);
  });

  // WITHDRAW
  socket.on('withdraw', () => {
    const found = getRoomOfSocket(socket.id);
    if (!found) return;
    const { code, room } = found;
    const state = room.state;
    const pIdx = playerIndexOf(room, socket.id);

    if (state.phase !== 'playing') return;
    if (state.currentTurn !== pIdx) return socket.emit('actionError', 'Not your turn.');
    if (state.withdrawn[pIdx]) return socket.emit('actionError', 'Already withdrawn.');
    if (state.pendingAbility) return socket.emit('actionError', 'Resolve pending ability first.');

    state.withdrawn[pIdx] = true;

    // End round normally to go to roundEnd phase
    endRound(state, code, room);
    broadcastState(code);
  });

  // READY FOR NEXT ROUND
  socket.on('readyForNextRound', () => {
    const found = getRoomOfSocket(socket.id);
    if (!found) return;
    const { code, room } = found;
    if (room.state.phase !== 'roundEnd') return;
    const pIdx = playerIndexOf(room, socket.id);
    if (pIdx > -1) {
      room.state.readyForNextRound[pIdx] = true;
      if (room.state.readyForNextRound[0] && room.state.readyForNextRound[1]) {
        room.state.initiative = 1 - room.state.initiative;
        startNewRound(room.state);
      }
      broadcastState(code);
    }
  });

  // SURRENDER
  socket.on('surrenderMatch', () => {
    const found = getRoomOfSocket(socket.id);
    if (!found) return;
    const { code, room } = found;
    if (room.state.phase === 'gameOver') return;
    const pIdx = playerIndexOf(room, socket.id);
    if (pIdx > -1) {
      room.state.phase = 'gameOver';
      room.state.surrender = true;
      room.state.winner = 1 - pIdx;
      broadcastState(code);
    }
  });

  // REJOIN (game.html reconnects after redirect)
  socket.on('rejoinRoom', ({ code, playerIndex }) => {
    const room = rooms[code];
    if (!room) return socket.emit('joinError', 'Room not found (may have expired).');
    // Cancel any pending disconnect timer for this player
    if (room.disconnectTimers?.[playerIndex]) {
      clearTimeout(room.disconnectTimers[playerIndex]);
      delete room.disconnectTimers[playerIndex];
    }
    // Re-register this socket as the player
    room.players[playerIndex] = socket.id;
    socket.join(code);
    console.log(`Player ${playerIndex + 1} rejoined room ${code} with socket ${socket.id}`);
    if (room.state) {
      broadcastState(code);
    }
  });


  // DISCONNECT
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    const found = getRoomOfSocket(socket.id);
    if (!found) return;
    const { code, room } = found;
    const playerIdx = playerIndexOf(room, socket.id);

    // Grace period: page redirects (lobby → game.html) disconnect the lobby socket.
    // Wait 10 s before closing; rejoinRoom will cancel this timer if player reconnects.
    room.disconnectTimers = room.disconnectTimers || {};
    room.disconnectTimers[playerIdx] = setTimeout(() => {
      if (rooms[code] && rooms[code].players[playerIdx] === socket.id) {
        io.to(code).emit('opponentLeft');
        delete rooms[code];
        console.log(`Room ${code} removed after grace period (player ${playerIdx + 1} gone).`);
      }
    }, 10000);
  });

});

// ─── Advance Turn Helper ─────────────────────────────────────────────────────
function advanceTurn(state, code, room) {
  const pIdx = state.currentTurn;
  const oppIdx = 1 - pIdx;

  // Check for empty hands (both players)
  const bothEmpty = state.hands[0].length === 0 && state.hands[1].length === 0;

  if (bothEmpty || (state.withdrawn[0] && state.withdrawn[1])) {
    // Resolve round normally
    endRound(state, code, room);
    return;
  }

  // Yasuo extra turn
  if (state.extraTurn[0]) {
    state.extraTurn[0] = false;
    state.currentTurn = 0;
    state.log.push(`Player 1 gets an extra turn (Yasuo)!`);
    return;
  }
  if (state.extraTurn[1]) {
    state.extraTurn[1] = false;
    state.currentTurn = 1;
    state.log.push(`Player 2 gets an extra turn (Yasuo)!`);
    return;
  }

  // If opponent already withdrawn, stay on current player if they have cards
  if (state.withdrawn[oppIdx]) {
    if (state.hands[pIdx].length > 0) {
      state.currentTurn = pIdx;
    } else {
      endRound(state, code, room);
    }
    return;
  }

  // Normal alternating turns
  state.currentTurn = oppIdx;
}

function endRound(state, code, room) {
  state.log.push('─── ROUND END ───');
  
  let roundWinner = null;
  let vpScored = 0;
  let reason = '';

  if (state.withdrawn[0]) {
    roundWinner = 1;
    const p2HandCount = state.hands[1].length;
    vpScored = retreatVP(p2HandCount);
    reason = 'Player 1 Retreated';
    state.log.push(`Player 1 retreated. Player 2 gains ${vpScored} VP (Opp. hand: ${p2HandCount}).`);
  } else if (state.withdrawn[1]) {
    roundWinner = 0;
    const p1HandCount = state.hands[0].length;
    vpScored = retreatVP(p1HandCount);
    reason = 'Player 2 Retreated';
    state.log.push(`Player 2 retreated. Player 1 gains ${vpScored} VP (Opp. hand: ${p1HandCount}).`);
  } else {
    // Normal resolving
    const regionResults = resolveRegions(state);
    let p1Reg = 0, p2Reg = 0;
    for (const r of REGIONS) {
      if (regionResults[r] === 0) p1Reg++;
      else p2Reg++;
    }

    if (p1Reg > p2Reg) { roundWinner = 0; vpScored = 6; reason = 'Controlled more Regions'; }
    else if (p2Reg > p1Reg) { roundWinner = 1; vpScored = 6; reason = 'Controlled more Regions'; }
    else { roundWinner = state.initiative; vpScored = 6; reason = 'Tie breaker (Initiative)'; }
    state.log.push(`Player ${roundWinner + 1} controls more regions and gains 6 VP!`);
  }

  state.scores[roundWinner] += vpScored;

  if (state.scores[0] >= 12 || state.scores[1] >= 12) {
    state.phase = 'gameOver';
    state.winner = state.scores[0] >= 12 ? 0 : 1;
    state.log.push(`🏆 Player ${state.winner + 1} wins the game!`);
  } else {
    state.phase = 'roundEnd';
    state.roundSummary = { winner: roundWinner, points: vpScored, reason };
    state.readyForNextRound = [false, false];
  }
}

// ─── Start Server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`RiftConquest server running at http://localhost:${PORT}`);
});
