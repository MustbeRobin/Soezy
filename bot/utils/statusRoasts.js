"use strict";

const lines = {
  hierarchy: [
    "Confidence does not move you up the role ladder.",
    "Big plans. Small place in the role hierarchy.",
    "The role ladder declined your promotion."
  ],
  permission: [
    "Confidence is not a Discord permission.",
    "You brought ambition. The permission checkbox stayed home.",
    "The permission check is immune to wishful thinking."
  ],
  error: [
    "Bold attempt. The instructions remain undefeated.",
    "Your confidence loaded. The command did not.",
    "Almost impressive. Mostly almost.",
    "The button worked. Your plan needs a patch.",
    "A little less freestyle, a little more reading."
  ],
  success: [
    "Look at you, getting a command right.",
    "Done. Try not to let this go to your head.",
    "That worked. We are both pleasantly surprised.",
    "Task complete. Your victory speech can wait.",
    "A rare moment of flawless button pressing."
  ],
  enable: [
    "Switched on. Your decision-making finally has backup.",
    "Enabled. Now let it do the work you were avoiding.",
    "It is on. Please resist your urge to touch everything.",
    "Activated. One correct decision for the highlight reel.",
    "Enabled. Even your settings are making progress."
  ],
  disable: [
    "Switched off. Your clicking privileges survive another day.",
    "Disabled. A surprisingly successful exit strategy.",
    "It is off. You may stop pressing the button now.",
    "Disabled. Finally, a break from your experiments.",
    "Turned off. That was your cue to leave it alone."
  ]
};
const previous = new Map();

function roastStatusMessage(type, title, description) {
  const original = String(description || "").trim();
  let kind = type;
  if (type === "error") {
    const context = `${title || ""} ${original}`;
    if (/hierarchy|higher.*role|role.*higher|role.*too high|above.*role|highest role/i.test(context)) kind = "hierarchy";
    else if (/permission|access denied|not authorized|only.*owner|manage roles|manage messages|ban members/i.test(context)) kind = "permission";
  }
  if (type !== "error") {
    if (/\b(disabled?|turned off|switched off)\b/i.test(title)) kind = "disable";
    else if (/\b(enabled?|turned on|switched on)\b/i.test(title)) kind = "enable";
  }
  const choices = lines[kind];
  if (!choices || original.length >= 3500) return original;
  const last = previous.get(kind);
  const available = choices.filter(line => line !== last);
  const roast = available[Math.floor(Math.random() * available.length)];
  previous.set(kind, roast);
  return original ? `${roast} ${original}` : roast;
}

function formatStatusReply(type, title, description, emoji) {
  const original = String(description || "").trim();
  const combined = roastStatusMessage(type, title, original);
  let roast = original ? combined.slice(0, combined.length - original.length).trim() : combined;
  let stateNote = "";
  if (type !== "error") {
    if (/\b(disabled?|off)\b/i.test(title || "")) stateNote = "It Will Stay Off. You're Welcome.";
    else if (/\b(enabled?|on)\b/i.test(title || "")) stateNote = "It Will Stay On. You're Welcome.";
  }
  const asInlineCode = line => {
    const longestRun = Math.max(0, ...[...line.matchAll(/`+/g)].map(match => match[0].length));
    const fence = "`".repeat(longestRun + 1);
    return `${fence}${line}${fence}`;
  };
  if (stateNote && roast) roast = asInlineCode(`${roast} ${stateNote}`);
  else if (roast) roast = asInlineCode(roast);
  const body = [roast, original].filter(Boolean).join(" ");
  return body.split("\n").map((line, index) =>
    `> ${index === 0 ? `${emoji} ` : ""}**${line}**`
  ).join("\n");
}

module.exports = { roastStatusMessage, formatStatusReply };
