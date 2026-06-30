import { bindShellNavigation, renderShell } from "../../app/shell.js";

const GUIDE_SECTIONS = [
  {
    title: "Win The Match",
    icon: "mdi-trophy-outline",
    text: "Be the first player to reach 12 Victory Points. Most full rounds award 6 VP to the player who controls more regions.",
  },
  {
    title: "Deploy Champions",
    icon: "mdi-cards-outline",
    text: "Face-up cards use their printed region and ability. Face-down cards can go anywhere, count as strength 2, and hide your plan.",
  },
  {
    title: "Control Regions",
    icon: "mdi-map-marker-path",
    text: "At round end, each region belongs to the player with the higher total strength there. Initiative breaks tied control.",
  },
  {
    title: "Retreat At The Right Time",
    icon: "mdi-flag-variant-outline",
    text: "Retreat ends the round immediately. Your opponent scores based on how many cards they still hold.",
  },
  {
    title: "Use The Web Lobby",
    icon: "mdi-account-group-outline",
    text: "Host a casual room and share the code, join a room from a code, or sign in and use Ranked to find an opponent.",
  },
  {
    title: "During A Game",
    icon: "mdi-sword-cross",
    text: "Use the board, hand controls, ability prompts, round log, and sound settings to play without leaving the match screen.",
  },
];

const FLOW_STEPS = [
  "Host a casual room or join with a room code from the Play screen.",
  "Start the match once both players are ready in the lobby.",
  "Take turns deploying cards, responding to ability prompts, or choosing a retreat.",
  "Score the round, ready up, and continue until a player reaches 12 Victory Points.",
];

export function mount(root, { navigate }) {
  document.documentElement.classList.add("guide-page-active");
  document.body.classList.add("guide-page-active");
  renderShell(root, {
    activePath: "/how-to-play",
    content: `
      <section class="guide-page" aria-labelledby="guide-title">
        <div class="guide-page-header">
          <p class="home-kicker">New player guide</p>
          <h1 id="guide-title" class="cinzel">How To Play</h1>
          <p>
            Learn the match goal, the lobby flow, and the core decisions you
            will make each turn.
          </p>
          <div class="home-actions">
            <button class="btn btn-primary" type="button" data-nav="/play">
              <span class="mdi mdi-sword-cross ui-icon" aria-hidden="true"></span>
              <span>Play</span>
            </button>
            <button class="btn btn-secondary" type="button" data-nav="/home">
              <span class="mdi mdi-home-outline ui-icon" aria-hidden="true"></span>
              <span>Home</span>
            </button>
          </div>
        </div>
        <div class="guide-page-content">
          <section class="guide-flow" aria-labelledby="guide-flow-title">
            <div class="home-section-heading">
              <p class="home-kicker">Web flow</p>
              <h2 id="guide-flow-title" class="cinzel">From Lobby To Victory</h2>
            </div>
            <ol>
              ${FLOW_STEPS.map((step) => `<li>${step}</li>`).join("")}
            </ol>
          </section>
          <section class="guide-page-grid" aria-label="Core rules">
            ${GUIDE_SECTIONS.map(
              (section) => `
                <article class="guide-page-card">
                  <span class="mdi ${section.icon} ui-icon" aria-hidden="true"></span>
                  <h2>${section.title}</h2>
                  <p>${section.text}</p>
                </article>
              `,
            ).join("")}
          </section>
          <section class="guide-scoring">
            <div>
              <p class="home-kicker">Round pressure</p>
              <h2 class="cinzel">Retreat Scoring</h2>
              <p>When you retreat, your opponent scores from their remaining hand.</p>
            </div>
            <table>
              <thead>
                <tr><th>Opponent cards left</th><th>VP gained</th></tr>
              </thead>
              <tbody>
                <tr><td>0</td><td>6</td></tr>
                <tr><td>1</td><td>5</td></tr>
                <tr><td>2</td><td>4</td></tr>
                <tr><td>3</td><td>3</td></tr>
                <tr><td>4-6</td><td>2</td></tr>
              </tbody>
            </table>
          </section>
          <div class="guide-final-cta">
            <h2 class="cinzel">Ready To Try A Round?</h2>
            <button class="btn btn-primary" type="button" data-nav="/play">
              <span class="mdi mdi-sword-cross ui-icon" aria-hidden="true"></span>
              <span>Play</span>
            </button>
          </div>
        </div>
      </section>
    `,
  });
  bindShellNavigation(root, navigate);
}

export function unmount() {
  document.documentElement.classList.remove("guide-page-active");
  document.body.classList.remove("guide-page-active");
}
