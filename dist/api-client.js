/**
 * @file api-client.js
 * @description Frontend API Client for live bracket sync, organizer authentication,
 * and Optimistic Concurrency Control (OCC) operations.
 */

(function (root) {
  const TOKEN_KEY = 'ncf_legends_organizer_token';
  const PROFILE_KEY = 'ncf_legends_organizer_profile';

  /**
   * Retrieves the stored organizer JWT token.
   * @returns {string|null}
   */
  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Retrieves stored organizer profile metadata.
   * @returns {object|null}
   */
  function getProfile() {
    try {
      const data = localStorage.getItem(PROFILE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * Saves organizer authentication session.
   * @param {string} token
   * @param {object} organizer
   */
  function setSession(token, organizer) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(organizer));
    } catch {
      // Storage unavailable
    }
  }

  /**
   * Clears organizer session on logout.
   */
  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(PROFILE_KEY);
    } catch {
      // Ignore
    }
  }

  /**
   * Default headers with organizer authorization if logged in.
   * @returns {HeadersInit}
   */
  function authHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Fetches latest tournament brackets from server.
   * Polled every 5 seconds.
   * @returns {Promise<{ success: boolean, brackets?: Record<string, any>, error?: string }>}
   */
  async function fetchBrackets() {
    if (typeof fetch === 'undefined') return { success: false, error: 'Offline environment' };
    try {
      const res = await fetch('/api/brackets', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Authenticates organizer with tournament passcode.
   * @param {string} passcode
   * @returns {Promise<{ success: boolean, organizer?: object, error?: string }>}
   */
  async function login(passcode) {
    if (typeof fetch === 'undefined') return { success: false, error: 'Offline environment' };
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSession(data.token, data.organizer);
      }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Records a game outcome using Optimistic Concurrency Control.
   * If another device updated the match, the server returns 409 Conflict.
   *
   * @param {object} params
   * @param {string} params.title 'MLBB' or 'CODM'
   * @param {number} params.expectedVersion
   * @param {number} params.matchIndex
   * @param {number} params.gameIndex
   * @param {number} params.winnerSide
   * @returns {Promise<{ success: boolean, conflict?: boolean, version?: number, current?: object, error?: string }>}
   */
  async function recordGameOCC({ title, expectedVersion, matchIndex, gameIndex, winnerSide, defaultWin = false }) {
    if (typeof fetch === 'undefined') return { success: false, error: 'Offline' };
    try {
      const res = await fetch('/api/bracket/record', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title, expectedVersion, matchIndex, gameIndex, winnerSide, defaultWin }),
      });
      const data = await res.json();
      if (res.status === 409) {
        return { success: false, conflict: true, code: 'CONFLICT', ...data };
      }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Updates tournament team names with OCC.
   * @param {string} title
   * @param {number} expectedVersion
   * @param {string[]} names
   */
  async function updateTeamsOCC(title, expectedVersion, names) {
    if (typeof fetch === 'undefined') return { success: false, error: 'Offline' };
    try {
      const res = await fetch('/api/bracket/teams', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title, expectedVersion, names }),
      });
      const data = await res.json();
      if (res.status === 409) {
        return { success: false, conflict: true, ...data };
      }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Resets a tournament bracket with OCC.
   * @param {string} title
   * @param {number} expectedVersion
   */
  async function resetBracketOCC(title, expectedVersion) {
    if (typeof fetch === 'undefined') return { success: false, error: 'Offline' };
    try {
      const res = await fetch('/api/bracket/reset', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ title, expectedVersion }),
      });
      const data = await res.json();
      if (res.status === 409) {
        return { success: false, conflict: true, ...data };
      }
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  const clientApi = {
    getToken,
    getProfile,
    isOrganizer: () => Boolean(getToken()),
    login,
    logout: clearSession,
    fetchBrackets,
    recordGameOCC,
    updateTeamsOCC,
    resetBracketOCC,
  };

  if (typeof module !== 'undefined') module.exports = clientApi;
  else root.TournamentAPI = clientApi;
})(typeof globalThis !== 'undefined' ? globalThis : this);
