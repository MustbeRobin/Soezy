# Native AutoMod

Restart the bot to register the updated slash commands. The bot needs Manage Server (Manage Guild).

For the full set, a server administrator can run `/automod setup all:true`. On a fresh server with available slots, the bundled word lists produce nine rules: custom bad words, NSFW words, links (including invites), length, everyone/here, mention spam, Discord spam, all three Discord word presets, and member profiles. Message limits default to 100 characters and mention limits to 5; existing limits are preserved. Member-profile matches block member interactions; the other rules block messages. Existing domain exceptions and rule-slot conflicts are reported rather than overwritten. Running setup again updates the same rules instead of creating duplicates.

1. Configure the existing bad-word, NSFW text, Anti-Link and Anti-Mention filters.
2. Run `/automod setup` to synchronize enabled filters into Discord Block Message rules. Saved changes then synchronize automatically.
3. Run `/security message-limit limit:100` for a server-wide character limit. Optional `channel` scopes an override to that channel. 100 Unicode code points are allowed, 101 are blocked; newlines count. Use 0 to remove a limit.
4. Run `/automod rules` to inspect the created rules and the most recent sync error.

Blocked messages show Discord's private failure notice with "Blocked by Soezy". Since blocked messages never reach the bot's message handler, legacy warning/kick/ban actions do not run for them. Existing post-send enforcement remains as a fallback. NSFW rules match text, not the contents of image uploads.

Discord supports role and channel exemptions, not individual user exemptions. Native AutoMod also has Discord-managed exemptions such as server administrators. Test using an ordinary member account.

Discord permits six keyword rules and one mention-spam rule per server. Each distinct channel length limit needs a keyword slot and exempts all other channels (maximum 50 exemptions). Too many rules or exemptions are reported as errors. Existing manual mention rules may occupy the only mention slot. Anti-Link domain exceptions are rejected because Discord's allow-list exempts a whole matching message, including other malicious links in it. Remove domain exceptions before native sync. Existing rules are not silently overwritten to make room.

`/automod reset` removes this bot's managed native rules and stops automatic synchronization. It does not turn off legacy filters.

The Uses AutoMod badge is awarded by Discord when the app has at least 100 AutoMod rules across servers, according to https://support-dev.discord.com/hc/en-us/articles/13847462843543-Introducing-the-AutoMod-Badge . Local code changes do not award the badge. Create useful rules only in servers where administrators request them.
