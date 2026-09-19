export const YOUTUBE_CHANNEL_IDS = (
  process.env.YOUTUBE_CHANNEL_IDS || process.env.YOUTUBE_CHANNEL_ID || ''
)
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);