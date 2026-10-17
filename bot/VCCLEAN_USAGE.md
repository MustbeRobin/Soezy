# VC Clean Command - Usage Guide

## Quick Start

### Delete all messages in your current VC
```
/vcclean
```
- Uses default 100ms delay
- Cleans up to 1000 messages
- Requires ManageMessages permission

### Clean a specific VC with default settings
```
/vcclean #voice-channel
```

### Custom delay (slow cleanup)
```
/vcclean #voice-channel 500
```
- Deletes one message every 500ms (2 per second)
- Useful if you want to see progress
- Max: 5000ms per deletion

### Custom delay (fast cleanup)
```
/vcclean #voice-channel 50
```
- Deletes one message every 50ms (20 per second)
- Use with caution - very fast
- Min: 50ms per deletion

### Limit deletions
```
/vcclean #voice-channel 100 50
```
- Channel: #voice-channel
- Delay: 100ms
- Limit: Delete max 50 messages

## Examples

### Professional cleanup (default)
```
/vcclean #general-vc
```
- 100ms delay = smooth, noticeable progress
- 1000 max = Won't delete too many
- ~1.5 minutes to delete 1000 messages

### Quick cleanup
```
/vcclean #temp-vc 50
```
- 50ms delay = fast (20 msg/sec)
- Deletes 1000 messages in ~50 seconds
- ⚠️ Very fast, may look like spam

### Slow cleanup
```
/vcclean #important-vc 1000
```
- 1 second between deletions
- Very deliberate, clear progress
- Good for verification that cleanup is working

### Limited cleanup
```
/vcclean #spammy-vc 100 200
```
- Delete exactly 200 messages
- 100ms delay
- Leave older messages alone

## Confirmation

After running the command, a confirmation dialog appears:
- Shows the voice channel being cleaned
- Shows the delay and limit
- Requires explicit approval
- Cancel to abort

## Permissions Required

Your account:
- ✅ ManageMessages in the voice channel

Bot:
- ✅ ManageMessages in the voice channel

Server Owner:
- Can run even without ManageMessages (if authorized)

## Response

Upon success, you'll see:
- Number of messages deleted
- Voice channel name
- Delay used
- Total time taken (calculated as: deleted × delay / 1000)

## Moderation Log

Action logged to your server's moderation log with:
- Command: `vcclean`
- Moderator: Your name
- Channel: Voice channel cleaned
- Statistics: Count, limit, delay

## Limitations

- Only works on voice-based channels
- Can only delete messages from the last 14 days (Discord API limit)
- One deletion per message (not bulk delete)
- Respects Discord rate limits

## Troubleshooting

**"Missing Permissions"**
- Bot needs ManageMessages in that VC
- Check role hierarchy

**"Not a Voice Channel"**
- Target must be a voice/stage channel
- Can't clean text channels this way (use `/purge` instead)

**"No Voice Channel Found"**
- Either specify a channel or join a VC first
- Example: `/vcclean #my-vc` (if not in a VC)

**Delete failed on some messages**
- Bot continues cleaning despite individual failures
- Some messages may already be deleted
- Final count shows successfully deleted

## Performance

| Messages | Delay | Time |
|----------|-------|------|
| 100 | 50ms | ~5 sec |
| 500 | 100ms | ~50 sec |
| 1000 | 100ms | ~1.5 min |
| 1000 | 500ms | ~8 min |

## Common Patterns

**Clean your VC every day:**
```
/vcclean  (same VC, default settings)
```

**Clean specific channels:**
```
/vcclean #announcements
/vcclean #logs
/vcclean #temp-voice
```

**Partial cleanup:**
```
/vcclean #spammy 100 100  (delete only 100 messages)
```

**Archive then clean:**
1. Screenshot messages (if needed)
2. Run `/vcclean #voice`
3. Continue using the VC
