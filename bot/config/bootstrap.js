const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionsBitField,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  AttachmentBuilder,
  Partials,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ComponentType,
  ChannelType,
  RoleSelectMenuBuilder,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActivityType,
  AuditLogEvent,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  SectionBuilder,
  MessageFlags
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const os = require("os");
const { execSync, exec: execAsync } = require("child_process");

