import { NextRequest } from 'next/server'

/** POST /api/tasks/:id/complete -- deprecated, use bids/:bidId/approve-payment instead */
export async function POST(
  _request: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  return Response.json(
    {
      success: false,
      error: 'DEPRECATED',
      message: 'Use POST /api/tasks/:id/bids/:bidId/approve-payment to complete tasks via the multisig flow',
    },
    { status: 410 }
  )
}
