const GRAPHQL_ENDPOINT =
  process.env.CMS_GRAPHQL_ENDPOINT ||
  process.env.NEXT_PUBLIC_CMS_GRAPHQL_ENDPOINT ||
  'https://business-cms-1aks.onrender.com/graphql';

const PROJECT_ID =
  process.env.CMS_PROJECT_ID ||
  process.env.NEXT_PUBLIC_CMS_PROJECT_ID ||
  'cmt1a66ja0000jo0ifvy79m9p';

const CREATE_LEAD_MUTATION = `
  mutation CreateLead($input: CreateLeadInput!) {
    createLead(input: $input) {
      id
      name
      email
    }
  }
`;

/**
 * Sends a GraphQL request to the central Maxx Media CMS.
 */
async function graphqlRequest(query, variables = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-project-id': PROJECT_ID,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`CMS GraphQL HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const result = await response.json();
    return result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Syncs a VisitorPass model instance to the central Maxx Media CMS as a VISITOR lead.
 * Updates the pass instance with cmsLeadId, cmsStatus, and cmsSyncedAt.
 * 
 * @param {Object} pass - VisitorPass Sequelize instance or plain object
 * @returns {Promise<{success: boolean, leadId?: string, error?: string}>}
 */
async function syncPass(pass) {
  if (!pass) return { success: false, error: 'No pass provided' };

  const interestsList = Array.isArray(pass.interests)
    ? pass.interests.filter(Boolean).join(', ')
    : String(pass.interests || '');

  const visitorEmail =
    (pass.email && String(pass.email).trim()) ||
    `${String(pass.registrationNumber || 'visitor').toLowerCase().replace(/[^a-z0-9]/g, '')}@visitor.indiametexpo.com`;

  const input = {
    projectId: PROJECT_ID,
    email: visitorEmail,
    name: String(pass.name || 'Visitor').trim(),
    leadType: 'VISITOR',
    companyName: pass.company || undefined,
    jobTitle: pass.designation || undefined,
    phone: pass.phone || undefined,
    country: pass.country || 'India',
    state: pass.state || undefined,
    city: pass.city || undefined,
    message: `IndiaMET 2027 Visitor Pass: ${pass.registrationNumber || 'N/A'}${interestsList ? `. Interests: ${interestsList}` : ''}`,
    source: 'WEBSITE_UTM',
    status: 'NEW',
    utmSource: pass.source || 'Pass Registration',
  };

  try {
    console.log(`[CmsLeadService] Syncing visitor pass ${pass.registrationNumber} to CMS (${input.email})...`);
    const result = await graphqlRequest(CREATE_LEAD_MUTATION, { input });

    if (result.errors?.length) {
      const errMsg = result.errors[0]?.message || 'GraphQL error';
      console.warn(`[CmsLeadService] CMS returned error for ${pass.registrationNumber}:`, errMsg);
      if (typeof pass.update === 'function') {
        await pass.update({ cmsStatus: 'error', cmsError: errMsg }).catch(() => null);
      }
      return { success: false, error: errMsg };
    }

    const leadId = result.data?.createLead?.id;
    if (!leadId) {
      const errMsg = 'No lead ID returned from CMS';
      if (typeof pass.update === 'function') {
        await pass.update({ cmsStatus: 'error', cmsError: errMsg }).catch(() => null);
      }
      return { success: false, error: errMsg };
    }

    console.log(`✅ [CmsLeadService] Visitor pass ${pass.registrationNumber} synced as lead ${leadId}`);
    if (typeof pass.update === 'function') {
      await pass.update({
        cmsLeadId: leadId,
        cmsStatus: 'synced',
        cmsSyncedAt: new Date(),
        cmsError: null,
      }).catch(() => null);
    }

    return { success: true, leadId };
  } catch (err) {
    const errMsg = err.message || 'CMS request failed';
    console.error(`❌ [CmsLeadService] Failed to sync pass ${pass.registrationNumber}:`, errMsg);
    if (typeof pass.update === 'function') {
      await pass.update({ cmsStatus: 'error', cmsError: errMsg }).catch(() => null);
    }
    return { success: false, error: errMsg };
  }
}

module.exports = {
  GRAPHQL_ENDPOINT,
  PROJECT_ID,
  graphqlRequest,
  syncPass,
};
