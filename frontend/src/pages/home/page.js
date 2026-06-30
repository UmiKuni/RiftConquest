import { bindShellNavigation, renderShell } from "../../app/shell.js";

export function mount(root, { navigate }) {
  renderShell(root, {
    activePath: "/home",
    content: `
      <section class="home-hero">
        <div class="home-hero-media" aria-hidden="true">
          <video autoplay muted loop playsinline preload="auto">
            <source src="/image/Background_Lobby.webm" type="video/webm" />
          </video>
        </div>
        <div class="home-hero-content">
          <p class="home-kicker">Two players. Three regions. One rift.</p>
          <h1 class="cinzel">RiftConquest</h1>
          <p class="home-copy">
            Deploy champions, control Noxus, Demacia, and Ionia, and race to
            12 Victory Points in a compact tactical card duel.
          </p>
          <div class="home-actions">
            <button class="btn btn-primary" type="button" data-nav="/play">
              <span class="mdi mdi-sword-cross ui-icon" aria-hidden="true"></span>
              <span>Play</span>
            </button>
            <button class="btn btn-secondary" type="button" data-nav="/how-to-play">
              <span class="mdi mdi-book-open-page-variant ui-icon" aria-hidden="true"></span>
              <span>How To Play</span>
            </button>
          </div>
        </div>
      </section>
      <section class="home-feature-band">
        <article>
          <span class="mdi mdi-map-marker-path ui-icon" aria-hidden="true"></span>
          <h2>Contest Regions</h2>
          <p>Every round reshuffles the battlefield, changing adjacency and tactical value.</p>
        </article>
        <article>
          <span class="mdi mdi-eye-off-outline ui-icon" aria-hidden="true"></span>
          <h2>Bluff Hidden Cards</h2>
          <p>Play face-down anywhere for strength 2 when tempo matters more than ability.</p>
        </article>
        <article>
          <span class="mdi mdi-trophy-outline ui-icon" aria-hidden="true"></span>
          <h2>Climb Ranked</h2>
          <p>Sign in to queue ranked matches, earn RP, and track your match history.</p>
        </article>
      </section>
    `,
  });
  bindShellNavigation(root, navigate);
}
