const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

interface Guidelines {
  dos: string[]
  donts: string[]
}

interface ContentCheckResult {
  passed: boolean
  explanation: string
}

/**
 * Check if post content meets campaign guidelines using Claude.
 */
export async function checkContentGuidelines(
  postText: string,
  guidelines: Guidelines,
): Promise<ContentCheckResult> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const dosFormatted = guidelines.dos.map((d, i) => `  ${i + 1}. ${d}`).join('\n')
  const dontsFormatted = guidelines.donts.map((d, i) => `  ${i + 1}. ${d}`).join('\n')

  const systemPrompt = `You are a content compliance checker for a promotion campaign on a task marketplace. Your job is to evaluate whether a social media post meets the campaign guidelines set by the campaign creator.

You must respond with ONLY valid JSON in this exact format:
{"passed": true, "explanation": "Brief reason"}
or
{"passed": false, "explanation": "Brief reason for failure"}

Be strict but fair. The post must genuinely follow the guidelines, not just superficially.`

  const userPrompt = `Evaluate this post against the campaign guidelines.

CAMPAIGN GUIDELINES:
DO:
${dosFormatted}

DON'T:
${dontsFormatted}

POST CONTENT:
"""
${postText}
"""

Does this post comply with ALL guidelines? Respond with JSON only.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
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
