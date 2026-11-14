/**
 * Marketing nav targets.
 * Guided demo and proof map onto routes that already exist.
 * Hash links stay on this page when the app has no matching screen.
 */
export const links = {
  /** This landing page. The app home is /home. */
  home: "#top",
  /** The role dashboard inside the app. */
  app: "/home",
  /** TODO: no standalone how-it-works route; this stays on the landing page. */
  how: "#how",
  proof: "/onchain",
  demo: "/home?guide=1",
  docs: "/docs",
  /** What is real, and what is only the demo. */
  security: "/start",
  support: "/help#support",
  wall: "#wall",
} as const;
