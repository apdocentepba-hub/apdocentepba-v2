(() => {
  'use strict';
  // Legacy compatibility file retained for cache-safe rollout.
  // Account profile and password operations now live in account_profile_patch.js
  // and are handled exclusively by the session-authenticated Worker API.
  window.__apdAccountProfileHotfixRetired = true;
})();
