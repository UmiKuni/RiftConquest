export function toGameUrl(code, playerIndex) {
  return `/game?room=${encodeURIComponent(code)}&player=${encodeURIComponent(
    String(playerIndex),
  )}`;
}
