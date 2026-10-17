"use strict";
(() => {

function responseFlags(ephemeral = false) {
  return (globalThis.MessageFlags?.IsComponentsV2 || 0) | (ephemeral ? 64 : 0);
}

function normalizePanelPayload(payload = {}, ephemeral = false) {
  return {
    ...payload,
    flags: payload.flags ?? responseFlags(ephemeral),
  };
}

async function safeInteractionReply(interaction, payload = {}) {
  if (typeof globalThis.safeReply === "function") return globalThis.safeReply(interaction, normalizePanelPayload(payload));
  try {
    const clean = normalizePanelPayload(payload);
    if (interaction?.deferred || interaction?.replied) return interaction.editReply?.(clean).catch(() => null);
    return interaction?.reply?.(clean).catch(() => null);
  } catch {
    return null;
  }
}

async function safeEphemeralReply(interaction, payload = {}) {
  return safeInteractionReply(interaction, normalizePanelPayload(payload, true));
}

async function safeInteractionUpdate(interaction, payload = {}) {
  if (typeof globalThis.safeUpdate === "function") return globalThis.safeUpdate(interaction, normalizePanelPayload(payload));
  try {
    const clean = normalizePanelPayload(payload);
    if (interaction?.deferred || interaction?.replied) return interaction.editReply?.(clean).catch(() => null);
    return interaction?.update?.(clean).catch(() => safeInteractionReply(interaction, clean));
  } catch {
    return null;
  }
}

async function safePanelRefresh(interaction, payload = {}) {
  const clean = normalizePanelPayload(payload);
  if (interaction?.isButton?.() || interaction?.isStringSelectMenu?.()) return safeInteractionUpdate(interaction, clean);
  return safeInteractionReply(interaction, clean);
}

const api = {
  safeInteractionReply,
  safeInteractionUpdate,
  safePanelRefresh,
  safeEphemeralReply,
};

globalThis.soezyInteractionResponseManager = api;
Object.assign(globalThis, api);
module.exports = api;
})();
