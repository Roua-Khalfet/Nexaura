import { TECH_AGENT_CONFIG } from './config.js';

const API_KEY = TECH_AGENT_CONFIG.API_KEY;
const TA_BASE = TECH_AGENT_CONFIG.BASE_URL;

function buildTaUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${String(TA_BASE).replace(/\/$/, '')}${normalizedPath}`;
}

async function taFetch(path, options = {}) {
  try {
    const response = await fetch(buildTaUrl(path), {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 0 || response.status === 503 || response.status === 502) {
        throw new Error(
          `Tech Agent service is unavailable (${response.status}). ` +
          `Ensure tech-agent is running: cd backend/tech-agent && docker compose up -d`
        );
      }
      throw new Error(`Tech-agent API ${response.status}: ${text}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot reach Tech Agent at ${TA_BASE}. ` +
        `Start tech-agent services: cd backend/tech-agent && docker compose up -d`
      );
    }
    throw error;
  }
}

export async function invokeTechAgent(payload) {
  return taFetch('/invoke', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function parseSseBuffer(buffer, onEvent) {
  let next = buffer.indexOf('\n\n');
  let remainder = buffer;

  while (next !== -1) {
    const frame = remainder.slice(0, next).trim();
    remainder = remainder.slice(next + 2);

    if (frame) {
      let event = 'message';
      const dataLines = [];

      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) {
          event = line.slice(6).trim() || 'message';
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim());
        }
      }

      const rawData = dataLines.join('\n');
      let data = rawData;
      if (rawData) {
        try {
          data = JSON.parse(rawData);
        } catch {
          data = rawData;
        }
      }

      onEvent?.({ event, data });
    }

    next = remainder.indexOf('\n\n');
  }

  return remainder;
}

export async function invokeTechAgentStream(payload, { onEvent, signal } = {}) {
  const body = {
    ...payload,
    message_type: payload?.message_type || 'user_message',
  };

  const response = await fetch(buildTaUrl('/invoke/stream'), {
    method: 'POST',
    credentials: 'include',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tech-agent API ${response.status}: ${text}`);
  }

  if (!response.body) {
    throw new Error('Tech-agent stream response has no body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalResponse = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    buffer = parseSseBuffer(buffer, (eventPayload) => {
      if (eventPayload?.event === 'final_response' && eventPayload?.data) {
        finalResponse = eventPayload.data;
      }
      onEvent?.(eventPayload);
    });
  }

  buffer += decoder.decode();
  parseSseBuffer(buffer, (eventPayload) => {
    if (eventPayload?.event === 'final_response' && eventPayload?.data) {
      finalResponse = eventPayload.data;
    }
    onEvent?.(eventPayload);
  });

  return finalResponse;
}

export async function submitTechAgentFeedback(payload) {
  return taFetch('/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getTechAgentProjectState(sessionId) {
  if (!sessionId) {
    throw new Error('sessionId is required to fetch project state.');
  }

  return taFetch(`/project/${encodeURIComponent(sessionId)}/state`, {
    method: 'GET',
  });
}

export async function getTechAgentFeedbackScores(topN = 100) {
  return taFetch(`/feedback/scores?top_n=${topN}`);
}
