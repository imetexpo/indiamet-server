const cmsSync = require('./VisitorPassCmsSyncService');

// Preserve the old service entry point while routing pass records through the
// idempotent visitor-pass mutation instead of creating a generic CMS lead.
async function syncPass(pass, options = {}) {
  return cmsSync.enqueue(pass, options);
}

module.exports = { syncPass, isConfigured: cmsSync.isConfigured };
