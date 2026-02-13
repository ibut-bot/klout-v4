const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

interface Guidelines {
  dos: string[]
  donts: string[]
}

interface ContentCheckResult {
  passed: boolean
  explanation: string
}

interface MediaItem {
  type: 'photo' | 'video' | 'animated_gif'
  url?: string
  previewImageUrl?: string
}

/**
 * Check if post content (text + media) meets campaign guidelines using Claude.
 * Images are analysed via Claude's vision capability.
 * For videos/gifs only the preview thumbnail is checked (full video analysis not supported).
 */
export async function checkContentGuidelines(
  postText: string,
  guidelines: Guidelines,
  media: MediaItem[] = [],
): Promise<ContentCheckResult> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const hasDos = guidelines.dos.length > 0
  const hasDonts = guidelines.donts.length > 0

  // If no guidelines are set, auto-pass
  if (!hasDos && !hasDonts) {
    return { passed: true, explanation: 'No campaign guidelines configured — post accepted.' }
  }

  const dosFormatted = hasDos
    ? guidelines.dos.map((d, i) => `  ${i + 1}. ${d}`).join('\n')
    : '  (none specified)'
  const dontsFormatted = hasDonts
    ? guidelines.donts.map((d, i) => `  ${i + 1}. ${d}`).join('\n')
    : '  (none specified)'

  const hasMedia = media.length > 0
  const mediaNote = hasMedia
    ? `\n\nThe post also contains media attachments (images/videos). Evaluate the media content against the explicit guidelines as well. Only reject media if it clearly violates a stated guideline.`
    : ''

  const systemPrompt = `You are a content compliance checker for a promotion campaign. Your job is to evaluate whether a social media post violates any EXPLICIT campaign guidelines set by the campaign creator.

IMPORTANT: Be PERMISSIVE. You should APPROVE the post UNLESS it clearly and directly violates one of the stated guidelines. Do NOT reject posts based on your own subjective standards, taste, or assumptions about what the campaign should want. Only the explicitly listed DO's and DON'Ts matter.

- If a DO guideline is listed, the post should make a reasonable effort to follow it.
- If a DON'T guideline is listed, the post must not violate it.
- If no DO's are listed, there are no required elements.
- If no DON'Ts are listed, nothing is prohibited.
- When in doubt, APPROVE the post.

You must respond with ONLY valid JSON in this exact format:
{"passed": true, "explanation": "Brief reason"}
or
{"passed": false, "explanation": "Brief reason for failure — cite the specific guideline violated"}${mediaNote}`

  // Build message content blocks
  const contentBlocks: any[] = []

  // Add text prompt first
  const mediaDescription = hasMedia
    ? `\n\nThe post includes ${media.length} media attachment(s). The images are provided below for your review. Only reject if media clearly violates a stated guideline.`
    : ''

  contentBlocks.push({
    type: 'text',
    text: `Evaluate this post against the campaign guidelines. ONLY reject if the post clearly violates an explicitly stated guideline.

CAMPAIGN GUIDELINES:
DO:
${dosFormatted}

DON'T:
${dontsFormatted}

POST CONTENT (text):
"""
${postText}
"""${mediaDescription}

Does this post violate any of the explicitly stated guidelines? Respond with JSON only.`,
  })

  // Add image blocks for each media item
  for (const item of media) {
    // Use direct URL for photos, preview thumbnail for videos/gifs
    const imageUrl = item.type === 'photo' ? item.url : item.previewImageUrl
    if (!imageUrl) continue

    // Add a label for the media type
    if (item.type !== 'photo') {
      contentBlocks.push({
        type: 'text',
        text: `[${item.type === 'video' ? 'Video thumbnail' : 'Animated GIF frame'} — only the preview image is available for review]:`,
      })
    }

    contentBlocks.push({
      type: 'image',
      source: {
        type: 'url',
        url: imageUrl,
      },
    })
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        { role: 'user', content: contentBlocks },
      ],
      temperature: 0.1,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API call failed: ${err}`)
  }

  const data = await res.json()
  const content = data.content?.[0]?.text?.trim()

  if (!content) {
    throw new Error('Empty response from Claude')
  }

  try {
    const result = JSON.parse(content) as ContentCheckResult
    return {
      passed: Boolean(result.passed),
      explanation: String(result.explanation || ''),
    }
  } catch {
    // If JSON parsing fails, try to infer from the text
    const lower = content.toLowerCase()
    return {
      passed: lower.includes('"passed": true') || lower.includes('"passed":true'),
      explanation: content,
    }
  }
}
