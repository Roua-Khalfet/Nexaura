/**
 * Tech Agent Configuration Validator
 * Checks environment setup on app startup
 */

export const TECH_AGENT_CONFIG = {
  BASE_URL: normalizeTechAgentBaseUrl(process.env.NEXT_PUBLIC_TECH_AGENT_BASE || 'http://localhost:8005'),
  API_KEY: process.env.NEXT_PUBLIC_API_KEY || 'your_api_key',
};

function normalizeTechAgentBaseUrl(baseUrl) {
  const value = String(baseUrl || '').trim().replace(/\/$/, '');
  if (value.endsWith('/api/ta')) {
    return value.slice(0, -'/api/ta'.length);
  }
  return value;
}

export function validateTechAgentConfig() {
  const issues = [];

  if (!TECH_AGENT_CONFIG.BASE_URL || TECH_AGENT_CONFIG.BASE_URL === '') {
    issues.push('NEXT_PUBLIC_TECH_AGENT_BASE is not set');
  }

  if (TECH_AGENT_CONFIG.BASE_URL.includes('undefined')) {
    issues.push('NEXT_PUBLIC_TECH_AGENT_BASE contains "undefined"');
  }

  if (TECH_AGENT_CONFIG.API_KEY === 'your_api_key') {
    // Not a fatal issue, just a warning
    console.warn('[Tech Agent] API_KEY not configured - using default');
  }

  return {
    isValid: issues.length === 0,
    issues,
    config: TECH_AGENT_CONFIG,
  };
}

export async function checkTechAgentHealth() {
  try {
    const url = `${TECH_AGENT_CONFIG.BASE_URL}/health`;
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch (error) {
    console.error('[Tech Agent] Health check failed:', error);
    return false;
  }
}

export function logTechAgentSetup() {
  const validation = validateTechAgentConfig();

  if (validation.isValid) {
    console.log(
      '✅ [Tech Agent] Configuration valid',
      '\n  Base URL:', TECH_AGENT_CONFIG.BASE_URL
    );
  } else {
    console.error(
      '❌ [Tech Agent] Configuration issues:',
      validation.issues.join(', ')
    );
  }
}
