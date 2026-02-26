'use client'

import { useState, useEffect } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import { createProposalApproveExecuteWA } from '@/lib/solana/multisig'
import { createProposalApproveExecuteSplWA, USDC_MINT } from '@/lib/solana/spl-token'
import { type PaymentTokenType, type TokenInfo, formatTokenAmount, resolveTokenInfo } from '@/lib/token-utils'

const PLATFORM_WALLET = process.env.NEXT_PUBLIC_ARBITER_WALLET_ADDRESS || ''

interface ReferralInfo {
  referrerWallet: string
  referrerFeePct: number
  tierNumber: number
}

interface BundleSubmission {
  id: string
  postUrl: string
  xPostId: string | null
  viewCount: number | null
  payoutLamports: string | null
  status: string
  submitter: {
    id: string
    walletAddress: string
    username: string | null
    xUsername: string | null
    profilePicUrl: string | null
  }
  createdAt: string
}

interface Props {
  taskId: string
  paymentRequestId: string
  multisigAddress: string
  recipientWallet: string
  submissions: BundleSubmission[]
  onPaid: () => void
  onReject: (submissionId: string) => void
  paymentToken?: PaymentTokenType
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
  submitterId?: string
  compact?: boolean
}

export default function CampaignPayBundle({
  taskId,
  paymentRequestId,
  multisigAddress,
  recipientWallet,
  submissions,
  onPaid,
  onReject,
  paymentToken = 'SOL',
  customTokenMint,
  customTokenSymbol,
  customTokenDecimals,
  submitterId,
  compact = false,
}: Props) {
  const { authFetch } = useAuth()
  const { connection } = useConnection()
  const wallet = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!submitterId) return
    authFetch(`/api/referral/lookup?userId=${submitterId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.referral) {
          setReferralInfo(data.referral)
        }
      })
      .catch(() => {})
  }, [submitterId, authFetch])

  const tInfo = resolveTokenInfo(paymentToken, customTokenMint, customTokenSymbol, customTokenDecimals)
  const sym = tInfo.symbol

  const totalLamports = submissions.reduce((sum, s) => sum + Number(s.payoutLamports || 0), 0)
  const platformFeeTotal = Math.floor(totalLamports * 0.1)
  const referrerAmount = referralInfo ? Math.floor(platformFeeTotal * referralInfo.referrerFeePct / 100) : 0
  const platformFee = platformFeeTotal - referrerAmount
  const recipientAmount = totalLamports - platformFeeTotal

  const handlePayBundle = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !PLATFORM_WALLET) return
    setError('')
    setLoading(true)

    try {
      const walletSigner = { publicKey: wallet.publicKey, signTransaction: wallet.signTransaction }
      const msigPda = new PublicKey(multisigAddress)
      const recipientPk = new PublicKey(recipientWallet)
      const platformPk = new PublicKey(PLATFORM_WALLET)

      const referrerPk = referralInfo ? new PublicKey(referralInfo.referrerWallet) : undefined
      const referrerFeePct = referralInfo?.referrerFeePct || 0

      let result: { transactionIndex: bigint; signature: string }
      if (paymentToken === 'SOL') {
        result = await createProposalApproveExecuteWA(
          connection, walletSigner, msigPda, recipientPk, totalLamports,
          platformPk, undefined, referrerPk, referrerFeePct
        )
      } else {
        const mint = paymentToken === 'CUSTOM' && customTokenMint
          ? new PublicKey(customTokenMint)
          : USDC_MINT
        result = await createProposalApproveExecuteSplWA(
          connection, walletSigner, msigPda, recipientPk, totalLamports,
          platformPk, undefined, mint, referrerPk, referrerFeePct
        )
      }

      const res = await authFetch(`/api/tasks/${taskId}/campaign-payment-requests/${paymentRequestId}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          paymentTxSig: result.signature,
          proposalIndex: result.transactionIndex.toString(),
        }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.message)

      onPaid()
    } catch (e: any) {
      setError(e.message || 'Payment failed')
    } finally {
      setLoading(false)
    }
  }

  const totalDisplay = formatTokenAmount(totalLamports, tInfo, 2)
  const recipientDisplay = formatTokenAmount(recipientAmount, tInfo, 2)
  const feeDisplay = formatTokenAmount(platformFee, tInfo, 2)
  const referrerDisplay = referrerAmount > 0 ? formatTokenAmount(referrerAmount, tInfo, 2) : null

  const submitter = submissions[0]?.submitter
  const submitterName = submitter?.xUsername
    ? `@${submitter.xUsername}`
    : submitter?.username || `${submitter?.walletAddress.slice(0, 6)}...`

  if (compact) {
    return (
      <div className="inline-flex flex-col gap-0.5">
        <button
          onClick={handlePayBundle}
          disabled={loading || !PLATFORM_WALLET || submissions.length === 0}
          className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
          title={
            referrerDisplay
              ? `${recipientDisplay} ${sym} to creator + ${feeDisplay} ${sym} platform + ${referrerDisplay} ${sym} referrer`
              : `${recipientDisplay} ${sym} to creator + ${feeDisplay} ${sym} platform fee`
          }
        >
          {loading ? 'Paying...' : `Pay ${totalDisplay} ${sym}`}
        </button>
        <span className="text-[10px] text-zinc-500">{submissions.length} post{submissions.length !== 1 ? 's' : ''} in bundle</span>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {submitter?.profilePicUrl ? (
            <img src={submitter.profilePicUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium text-zinc-300">
              {submitter?.walletAddress.slice(0, 2)}
            </div>
          )}
          <div>
            <span className="text-sm font-medium text-zinc-200">{submitterName}</span>
            <div className="text-xs text-zinc-400">
              {submissions.length} post{submissions.length !== 1 ? 's' : ''} &middot; {totalDisplay} {sym} total
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            {expanded ? 'Collapse' : 'Review Posts'}
          </button>
          <button
            onClick={handlePayBundle}
            disabled={loading || !PLATFORM_WALLET || submissions.length === 0}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
            title={
              referrerDisplay
                ? `${recipientDisplay} ${sym} to creator + ${feeDisplay} ${sym} platform + ${referrerDisplay} ${sym} referrer`
                : `${recipientDisplay} ${sym} to creator + ${feeDisplay} ${sym} platform fee`
            }
          >
            {loading ? 'Paying...' : `Pay ${totalDisplay} ${sym}`}
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {expanded && (
        <div className="mt-3 space-y-2 border-t border-zinc-700/50 pt-3">
          {submissions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2">
              <div className="flex items-center gap-3">
                <a
                  href={s.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:underline"
                >
                  View Post
                </a>
                <span className="text-xs text-zinc-400">
                  {s.viewCount !== null ? `${s.viewCount.toLocaleString()} views` : 'Views pending'}
                </span>
                <span className="text-xs text-zinc-300">
                  {s.payoutLamports ? `${formatTokenAmount(s.payoutLamports, tInfo, 2)} ${sym}` : '-'}
                </span>
              </div>
              <button
                onClick={() => onReject(s.id)}
                className="rounded-md border border-red-500/30 px-2 py-0.5 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Reject
              </button>
            </div>
          ))}
          <div className="flex justify-between pt-1 text-xs text-zinc-400">
            <span>Breakdown:</span>
            <span>
              {recipientDisplay} {sym} to creator + {feeDisplay} {sym} platform
              {referrerDisplay && ` + ${referrerDisplay} ${sym} referrer`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
