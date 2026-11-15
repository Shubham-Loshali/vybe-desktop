/**
 * Spotify helpers for playlist imports and errors.
 */

/** An IPC error's own message, without Electron's "Error invoking remote method" prefix. */
export function ipcMessage(err: unknown, fallback: string): string {
  const text = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "";
  return text || fallback;
}

/** A playlist on Spotify's web player ("liked": its Liked Songs). */
export function spotifyUrl(id: string): string {
  return id === "liked" ? "https://open.spotify.com/collection/tracks" : `https://open.spotify.com/playlist/${encodeURIComponent(id)}`;
}
