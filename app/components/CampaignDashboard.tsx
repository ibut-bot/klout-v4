'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useAuth } from '../hooks/useAuth'
import CampaignPayButton from './CampaignPayButton'
import CampaignPayBundle from './CampaignPayBundle'
import CampaignRejectButton from './CampaignRejectButton'
import { type PaymentTokenType, type TokenInfo, formatTokenAmount, resolveTokenInfo } from '@/lib/token-utils'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface CampaignStats {
  totalBudgetLamports: string
  budgetRemainingLamports: string
  budgetAllocatedLamports: string
  budgetSpentLamports: string
  cpmLamports: string
  minViews: number
  minPayoutLamports: string
  totalSubmissions: number
  approved: number
  paymentRequested: number
  paid: number
  rejected: number
  pending: number
  totalViews: number
  myApprovedPayoutLamports: string
}

interface CampaignSubmission {
  id: string
  postUrl: string
  xPostId: string
  viewCount: number | null
  viewsReadAt: string | null
  payoutLamports: string | null
  status: string
  rejectionReason: string | null
  contentCheckPassed: boolean | null
  contentCheckExplanation: string | null
  paymentTxSig: string | null
  paymentRequestId: string | null
  submitterId: string
  submitter: {
    id: string
    walletAddress: string
    username: string | null
    xUsername: string | null
    profilePicUrl: string | null
    kloutScore?: number | null
  }
  createdAt: string
}

interface SharedUser {
  id: string
  userId: string
  walletAddress: string
  username: string | null
  profilePicUrl: string | null
  createdAt: string
}

interface Props {
  taskId: string
  multisigAddress: string
  isCreator: boolean
  isSharedViewer?: boolean
  refreshTrigger?: number
  paymentToken?: PaymentTokenType
  customTokenMint?: string | null
  customTokenSymbol?: string | null
  customTokenDecimals?: number | null
}

function formatSol(lamports: string | number, decimals = 4): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL
  if (sol === 0) return '0'
  if (sol < 0.001 && decimals >= 4) return sol.toPrecision(2)
  return sol.toFixed(decimals)
}

const STATUS_BADGE: Record<string, string> = {
  PENDING_PAYMENT: 'bg-yellow-500/20 text-yellow-400',
  READING_VIEWS: 'bg-blue-500/20 text-blue-400',
  CHECKING_CONTENT: 'bg-blue-500/20 text-blue-400',
  APPROVED: 'bg-green-500/20 text-green-400',
  PAYMENT_REQUESTED: 'bg-purple-500/20 text-purple-400',
  REJECTED: 'bg-red-500/20 text-red-400',
  CREATOR_REJECTED: 'bg-orange-500/20 text-orange-400',
  PAID: 'bg-emerald-500/20 text-emerald-400',
  PAYMENT_FAILED: 'bg-red-500/20 text-red-400',
}

export default function CampaignDashboard({ taskId, multisigAddress, isCreator, isSharedViewer = false, refreshTrigger, paymentToken = 'SOL', customTokenMint, customTokenSymbol, customTokenDecimals }: Props) {
  const tInfo = resolveTokenInfo(paymentToken, customTokenMint, customTokenSymbol, customTokenDecimals)
  const sym = tInfo.symbol
  const { authFetch } = useAuth()
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [submissions, setSubmissions] = useState<CampaignSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectPreset, setRejectPreset] = useState<'Botting' | 'Quality' | 'Relevancy' | 'Other' | ''>('')
  const [rejectReason, setRejectReason] = useState('')
  const [rejectLoading, setRejectLoading] = useState(false)
  const [rejectError, setRejectError] = useState('')
  const [banSubmitter, setBanSubmitter] = useState(false)
  const [overrideApprovingId, setOverrideApprovingId] = useState<string | null>(null)
  const [overrideApproveLoading, setOverrideApproveLoading] = useState(false)
  const [overrideApproveError, setOverrideApproveError] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [requestingPayment, setRequestingPayment] = useState(false)
  const [requestPaymentError, setRequestPaymentError] = useState('')
  const [requestPaymentSuccess, setRequestPaymentSuccess] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [shareWallet, setShareWallet] = useState('')
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState('')
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([])
  const [sharedUsersLoading, setSharedUsersLoading] = useState(false)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const fetchSharedUsers = useCallback(async () => {
    if (!isCreator) return
    setSharedUsersLoading(true)
    try {
      const res = await authFetch(`/api/tasks/${taskId}/share`)
      const data = await res.json()
      if (data.success) setSharedUsers(data.shares)
    } catch {}
    setSharedUsersLoading(false)
  }, [isCreator, taskId, authFetch])

  useEffect(() => {
    if (isCreator && shareOpen) fetchSharedUsers()
  }, [isCreator, shareOpen, fetchSharedUsers])

  const handleShare = async () => {
    if (!shareWallet.trim()) return
    setShareLoading(true)
    setShareError('')
    try {
      const res = await authFetch(`/api/tasks/${taskId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: shareWallet.trim() }),
      })
      const data = await res.json()
      if (!data.success) {
        setShareError(data.message || 'Failed to share')
      } else {
        setShareWallet('')
        setSharedUsers((prev) => [data.share, ...prev])
      }
    } catch {
      setShareError('Network error')
    }
    setShareLoading(false)
  }

  const handleUnshare = async (userId: string) => {
    try {
      const res = await authFetch(`/api/tasks/${taskId}/share`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.success) {
        setSharedUsers((prev) => prev.filter((u) => u.userId !== userId))
      }
    } catch {}
  }

  const fetchExportData = async () => {
    const res = await authFetch(`/api/tasks/${taskId}/campaign-export`)
    const data = await res.json()
    if (!data.success) throw new Error(data.message || 'Export failed')
    return data as {
      task: {
        title: string; description: string; imageUrl: string | null; imageBase64: string | null
        totalBudgetLamports: string; budgetRemainingLamports: string; cpmLamports: string
        minViews: number; minLikes: number; minRetweets: number; minComments: number
        minPayoutLamports: string; minKloutScore: number | null
        maxBudgetPerUserPercent: number | null; maxBudgetPerPostPercent: number | null
        requireFollowX: string | null
        guidelines: { dos?: string[]; donts?: string[] } | null
      }
      submissions: Array<{
        postUrl: string; viewCount: number | null; payoutLamports: string | null
        status: string; rejectionReason: string | null; paymentTxSig: string | null
        submitter: {
          walletAddress: string; username: string | null; xUsername: string | null; kloutScore: number | null
          followers: number | null; following: number | null; geoTier: number | null; geoRegion: string | null
        }
        createdAt: string
      }>
    }
  }

  const fmtToken = (v: string | number | null, decimals = 4) => v != null ? formatTokenAmount(v, tInfo, decimals) : '-'
  const fmtBudget = (v: string | number | null) => {
    if (v == null) return '-'
    const num = Number(v) / tInfo.multiplier
    if (num === 0) return '0'
    if (Number.isInteger(num)) return num.toLocaleString()
    return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  }

  const exportCSV = async () => {
    setExporting(true)
    try {
      const data = await fetchExportData()
      const { task: t, submissions: subs } = data

      const totalViews = subs.reduce((sum, s) => sum + (s.viewCount || 0), 0)
      const totalPaid = subs.filter(s => s.status === 'PAID' && s.payoutLamports).reduce((sum, s) => sum + Number(s.payoutLamports), 0)
      const approved = subs.filter(s => s.status === 'APPROVED').length
      const paid = subs.filter(s => s.status === 'PAID').length
      const rejected = subs.filter(s => s.status === 'REJECTED' || s.status === 'CREATOR_REJECTED').length

      const lines: string[] = []
      const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`

      lines.push('Campaign Performance Report')
      lines.push(`Campaign,${esc(t.title)}`)
      lines.push(`Exported,${new Date().toLocaleString()}`)
      lines.push('')
      lines.push('Key Metrics')
      lines.push(`Total Budget,${fmtBudget(t.totalBudgetLamports)} ${sym}`)
      lines.push(`Budget Remaining,${fmtBudget(t.budgetRemainingLamports)} ${sym}`)
      lines.push(`Budget Spent,${fmtBudget(totalPaid)} ${sym}`)
      lines.push(`CPM,${fmtToken(t.cpmLamports, 2)} ${sym}`)
      lines.push(`Total Views,${totalViews}`)
      lines.push(`Total Submissions,${subs.length}`)
      lines.push(`Approved,${approved}`)
      lines.push(`Paid,${paid}`)
      lines.push(`Rejected,${rejected}`)
      lines.push('')
      lines.push('Submissions')
      lines.push(['Submitter', 'Wallet', 'Post URL', 'Klout Score', 'Views', `Payout (${sym})`, `Platform Fee (${sym})`, 'Status', 'Rejection Reason', 'Payment Tx', 'Date'].map(esc).join(','))

      for (const s of subs) {
        const name = s.submitter.xUsername ? `@${s.submitter.xUsername}` : s.submitter.username || s.submitter.walletAddress.slice(0, 8)
        const payout = s.payoutLamports ? fmtToken(s.payoutLamports) : '-'
        const fee = s.payoutLamports ? fmtToken(Math.round(Number(s.payoutLamports) * 0.1)) : '-'
        lines.push([
          name, s.submitter.walletAddress, s.postUrl,
          s.submitter.kloutScore != null ? String(s.submitter.kloutScore) : '-',
          s.viewCount != null ? String(s.viewCount) : '-',
          payout, fee, s.status.replace(/_/g, ' '),
          s.rejectionReason || '', s.paymentTxSig || '',
          new Date(s.createdAt).toLocaleDateString(),
        ].map(esc).join(','))
      }

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `campaign-report-${taskId.slice(0, 8)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(e.message || 'Export failed')
    }
    setExporting(false)
    setExportOpen(false)
  }

  const loadImageAsDataUrl = (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const c = document.createElement('canvas')
          c.width = img.naturalWidth || 400
          c.height = img.naturalHeight || 400
          c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
          resolve(c.toDataURL('image/png'))
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => {
        fetch(url, { mode: 'cors' })
          .then(r => r.blob())
          .then(blob => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          })
          .catch(() => resolve(null))
      }
      img.src = url
    })
  }

  const renderDonutChart = (
    segments: Array<{ value: number; color: string; label: string }>,
    size = 320,
  ): string | null => {
    const active = segments.filter(s => s.value > 0)
    if (active.length === 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    const cx = size / 2, cy = size / 2, outer = size / 2 - 8, inner = outer * 0.55
    const total = active.reduce((s, seg) => s + seg.value, 0)
    let angle = -Math.PI / 2
    for (const seg of active) {
      const sweep = (seg.value / total) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(cx, cy, outer, angle, angle + sweep)
      ctx.arc(cx, cy, inner, angle + sweep, angle, true)
      ctx.closePath()
      ctx.fillStyle = seg.color
      ctx.fill()
      angle += sweep
    }
    ctx.beginPath()
    ctx.arc(cx, cy, inner - 1, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.font = `bold ${Math.round(size * 0.1)}px sans-serif`
    ctx.fillStyle = '#18181b'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(total), cx, cy - size * 0.03)
    ctx.font = `${Math.round(size * 0.055)}px sans-serif`
    ctx.fillStyle = '#71717a'
    ctx.fillText('total', cx, cy + size * 0.06)
    return canvas.toDataURL('image/png')
  }

  const renderBarChart = (
    bars: Array<{ label: string; value: number; color: string }>,
    title: string,
    valueSuffix = '',
    width = 540,
    height = 280,
  ): string | null => {
    if (bars.length === 0 || bars.every(b => b.value === 0)) return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    const pad = { top: 36, bottom: 48, left: 60, right: 16 }
    const chartW = width - pad.left - pad.right
    const chartH = height - pad.top - pad.bottom
    const maxVal = Math.max(...bars.map(b => b.value), 1)

    // Title
    ctx.font = `bold 16px sans-serif`
    ctx.fillStyle = '#3f3f46'
    ctx.textAlign = 'left'
    ctx.fillText(title, pad.left, 22)

    // Y-axis gridlines + labels
    const gridLines = 5
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= gridLines; i++) {
      const yPos = pad.top + chartH - (i / gridLines) * chartH
      const val = (maxVal / gridLines) * i
      ctx.strokeStyle = '#e4e4e7'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pad.left, yPos)
      ctx.lineTo(pad.left + chartW, yPos)
      ctx.stroke()
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#71717a'
      const label = val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val.toFixed(val < 10 ? 1 : 0)
      ctx.fillText(label + valueSuffix, pad.left - 6, yPos)
    }

    // Bars
    const barGap = 6
    const barW = Math.min(48, (chartW - barGap * (bars.length + 1)) / bars.length)
    const totalBarsW = bars.length * barW + (bars.length - 1) * barGap
    const startX = pad.left + (chartW - totalBarsW) / 2

    bars.forEach((b, i) => {
      const bx = startX + i * (barW + barGap)
      const bh = maxVal > 0 ? (b.value / maxVal) * chartH : 0
      const by = pad.top + chartH - bh

      // Bar with rounded top
      const radius = Math.min(4, barW / 2)
      ctx.fillStyle = b.color
      ctx.beginPath()
      ctx.moveTo(bx, pad.top + chartH)
      ctx.lineTo(bx, by + radius)
      ctx.quadraticCurveTo(bx, by, bx + radius, by)
      ctx.lineTo(bx + barW - radius, by)
      ctx.quadraticCurveTo(bx + barW, by, bx + barW, by + radius)
      ctx.lineTo(bx + barW, pad.top + chartH)
      ctx.closePath()
      ctx.fill()

      // Value on top
      if (b.value > 0) {
        ctx.font = 'bold 10px sans-serif'
        ctx.fillStyle = '#3f3f46'
        ctx.textAlign = 'center'
        const vLabel = b.value >= 1000 ? `${(b.value / 1000).toFixed(1)}k` : b.value.toFixed(b.value < 10 ? 1 : 0)
        ctx.fillText(vLabel + valueSuffix, bx + barW / 2, by - 5)
      }

      // X label (wrapped)
      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#71717a'
      ctx.textAlign = 'center'
      const lines = b.label.length > 10 ? [b.label.slice(0, 10), b.label.slice(10)] : [b.label]
      lines.forEach((line, li) => {
        ctx.fillText(line, bx + barW / 2, pad.top + chartH + 14 + li * 12)
      })
    })

    return canvas.toDataURL('image/png')
  }

  const exportPDF = async () => {
    setExporting(true)
    try {
      const data = await fetchExportData()
      const { task: t, submissions: subs } = data

      const [logoDataUrl, bannerDataUrl] = await Promise.all([
        loadImageAsDataUrl('/Klout1.svg'),
        Promise.resolve(t.imageBase64),
      ])

      const totalViews = subs.reduce((sum, s) => sum + (s.viewCount || 0), 0)
      const totalPaid = subs.filter(s => s.status === 'PAID' && s.payoutLamports).reduce((sum, s) => sum + Number(s.payoutLamports), 0)
      const approved = subs.filter(s => s.status === 'APPROVED').length
      const paid = subs.filter(s => s.status === 'PAID').length
      const rejected = subs.filter(s => s.status === 'REJECTED' || s.status === 'CREATOR_REJECTED').length
      const pending = subs.length - approved - paid - rejected
      const budgetUsed = Number(t.totalBudgetLamports) > 0
        ? (Number(t.totalBudgetLamports) - Number(t.budgetRemainingLamports)) / Number(t.totalBudgetLamports) * 100
        : 0

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = 210
      const m = 14

      const addFooter = () => {
        const pages = doc.getNumberOfPages()
        for (let i = 1; i <= pages; i++) {
          doc.setPage(i)
          doc.setDrawColor(228, 228, 231)
          doc.setLineWidth(0.3)
          doc.line(m, 284, pw - m, 284)
          doc.setFontSize(7)
          doc.setTextColor(161, 161, 170)
          doc.text('Generated by Klout', m, 290)
          doc.text(`Page ${i} of ${pages}`, pw - m, 290, { align: 'right' })
          if (logoDataUrl) {
            doc.addImage(logoDataUrl, 'PNG', pw / 2 - 3, 285.5, 6, 6)
          }
        }
      }

      // ── CAMPAIGN IMAGE BANNER ──
      let y = 0
      const bannerH = 52
      if (bannerDataUrl) {
        try {
          const imgFormat = bannerDataUrl.includes('image/jpeg') || bannerDataUrl.includes('image/jpg') ? 'JPEG' : 'PNG'
          doc.addImage(bannerDataUrl, imgFormat, 0, 0, pw, bannerH, undefined, 'FAST')
        } catch { /* skip */ }
        y = bannerH
      }

      // ── DARK INFO BAR ──
      const infoBarH = t.requireFollowX ? 30 : 26
      doc.setFillColor(18, 18, 18)
      doc.rect(0, y, pw, infoBarH, 'F')
      doc.setFillColor(250, 204, 21)
      doc.rect(0, y + infoBarH, pw, 1.2, 'F')

      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', m, y + 4, 10, 10)
      }
      const tx = m + 14
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(255, 255, 255)
      doc.text('Campaign Performance Report', tx, y + 9)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(180, 180, 180)
      const titleTrunc = t.title.length > 55 ? t.title.slice(0, 52) + '...' : t.title
      doc.text(titleTrunc, tx, y + 16)

      doc.setFontSize(7.5)
      doc.setTextColor(130, 130, 130)
      const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      doc.text(`Generated ${dateStr}`, tx, y + 22)

      if (t.requireFollowX) {
        doc.setFontSize(7.5)
        doc.setTextColor(250, 204, 21)
        doc.text(`Required Follow: @${t.requireFollowX}`, tx, y + 27)
      }

      y += infoBarH + 6

      // ── KEY METRIC CARDS (3x2 grid) ──
      const cardW = (pw - m * 2 - 8) / 3
      const cardH = 22
      const gap = 4
      const metrics = [
        { label: 'Total Budget', value: `${fmtBudget(t.totalBudgetLamports)} ${sym}`, accent: [250, 204, 21] as const },
        { label: 'Budget Remaining', value: `${fmtBudget(t.budgetRemainingLamports)} ${sym}`, accent: [34, 197, 94] as const },
        { label: 'Budget Spent', value: `${fmtBudget(totalPaid)} ${sym}`, accent: [239, 68, 68] as const },
        { label: 'Total Views', value: totalViews.toLocaleString(), accent: [59, 130, 246] as const },
        { label: 'CPM', value: `${fmtToken(t.cpmLamports, 2)} ${sym}`, accent: [168, 85, 247] as const },
        { label: 'Total Submissions', value: String(subs.length), accent: [236, 72, 153] as const },
      ]
      metrics.forEach((mt, i) => {
        const col = i % 3, row = Math.floor(i / 3)
        const cx = m + col * (cardW + gap)
        const cy = y + row * (cardH + gap)
        doc.setFillColor(248, 248, 250)
        doc.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, 'F')
        doc.setDrawColor(228, 228, 231)
        doc.setLineWidth(0.3)
        doc.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, 'S')
        doc.setFillColor(mt.accent[0], mt.accent[1], mt.accent[2])
        doc.roundedRect(cx, cy + 3, 1.8, cardH - 6, 0.9, 0.9, 'F')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(113, 113, 122)
        doc.text(mt.label, cx + 6, cy + 8)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(24, 24, 27)
        doc.text(mt.value, cx + 6, cy + 17)
      })
      y += 2 * (cardH + gap) + 4

      // ── CAMPAIGN REQUIREMENTS ──
      const reqs: string[] = []
      if (t.requireFollowX) reqs.push(`Follow @${t.requireFollowX} on X`)
      if (t.minViews > 0) reqs.push(`Min ${t.minViews.toLocaleString()} views per post`)
      if (t.minLikes > 0) reqs.push(`Min ${t.minLikes.toLocaleString()} likes per post`)
      if (t.minRetweets > 0) reqs.push(`Min ${t.minRetweets.toLocaleString()} retweets per post`)
      if (t.minComments > 0) reqs.push(`Min ${t.minComments.toLocaleString()} comments per post`)
      if (t.minKloutScore) reqs.push(`Min Klout Score: ${t.minKloutScore.toLocaleString()}`)
      if (Number(t.minPayoutLamports) > 0) reqs.push(`Min payout threshold: ${fmtBudget(t.minPayoutLamports)} ${sym}`)
      if (t.maxBudgetPerUserPercent) reqs.push(`Max ${t.maxBudgetPerUserPercent}% of budget per user`)
      if (t.maxBudgetPerPostPercent) reqs.push(`Max ${t.maxBudgetPerPostPercent}% of budget per post`)

      const hasDos = t.guidelines?.dos && t.guidelines.dos.length > 0
      const hasDonts = t.guidelines?.donts && t.guidelines.donts.length > 0

      if (reqs.length > 0 || hasDos || hasDonts) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(63, 63, 70)
        doc.text('Campaign Requirements', m, y)
        y += 2

        const reqBoxX = m, reqBoxW = pw - m * 2
        const reqStartY = y

        // Pre-calculate height
        let measuredH = 4
        if (reqs.length > 0) measuredH += Math.ceil(reqs.length / 2) * 5.5 + 2
        if (hasDos) measuredH += (t.guidelines!.dos!.length + 1) * 4
        if (hasDonts) measuredH += (t.guidelines!.donts!.length + 1) * 4
        measuredH += 2

        // Draw box first
        doc.setFillColor(248, 248, 250)
        doc.setDrawColor(228, 228, 231)
        doc.setLineWidth(0.2)
        doc.roundedRect(reqBoxX, reqStartY, reqBoxW, measuredH, 1.5, 1.5, 'FD')

        // Then draw content on top
        let innerY = reqStartY + 4

        if (reqs.length > 0) {
          const colW = (reqBoxW - 8) / 2
          reqs.forEach((r, i) => {
            const col = i % 2
            const row = Math.floor(i / 2)
            const rx = reqBoxX + 4 + col * colW
            const ry = innerY + row * 5.5
            doc.setFillColor(250, 204, 21)
            doc.circle(rx + 1, ry - 1, 0.8, 'F')
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7.5)
            doc.setTextColor(63, 63, 70)
            doc.text(r, rx + 4, ry)
          })
          innerY += Math.ceil(reqs.length / 2) * 5.5 + 2
        }

        if (hasDos) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.setTextColor(22, 101, 52)
          doc.text('DO:', reqBoxX + 4, innerY)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.setTextColor(63, 63, 70)
          t.guidelines!.dos!.forEach((d, i) => {
            const txt = d.length > 80 ? d.slice(0, 77) + '...' : d
            doc.text(`+ ${txt}`, reqBoxX + 12, innerY + (i + 1) * 4)
          })
          innerY += (t.guidelines!.dos!.length + 1) * 4
        }

        if (hasDonts) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7)
          doc.setTextColor(153, 27, 27)
          doc.text("DON'T:", reqBoxX + 4, innerY)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.setTextColor(63, 63, 70)
          t.guidelines!.donts!.forEach((d, i) => {
            const txt = d.length > 80 ? d.slice(0, 77) + '...' : d
            doc.text(`- ${txt}`, reqBoxX + 16, innerY + (i + 1) * 4)
          })
          innerY += (t.guidelines!.donts!.length + 1) * 4
        }

        y = reqStartY + measuredH + 4
      }

      // ── BUDGET UTILIZATION BAR ──
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(63, 63, 70)
      doc.text('Budget Utilization', m, y)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(113, 113, 122)
      doc.text(`${budgetUsed.toFixed(1)}%`, m + 42, y)
      y += 4
      const barW = pw - m * 2, barH = 5
      doc.setFillColor(228, 228, 231)
      doc.roundedRect(m, y, barW, barH, 2.5, 2.5, 'F')
      const fillW = Math.max(0, (budgetUsed / 100) * barW)
      if (fillW > 0) {
        const bc: [number, number, number] = budgetUsed > 80 ? [239, 68, 68] : budgetUsed > 50 ? [245, 158, 11] : [34, 197, 94]
        doc.setFillColor(bc[0], bc[1], bc[2])
        doc.roundedRect(m, y, Math.max(fillW, 5), barH, 2.5, 2.5, 'F')
      }
      y += barH + 3
      doc.setFontSize(6.5)
      doc.setTextColor(161, 161, 170)
      doc.text(`${fmtBudget(t.totalBudgetLamports)} ${sym} total  ·  ${fmtBudget(t.budgetRemainingLamports)} ${sym} remaining`, m, y)
      y += 8

      // ── SUBMISSION STATUS DONUT + LEGEND ──
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(63, 63, 70)
      doc.text('Submission Breakdown', m, y)
      y += 4

      const statusSegments = [
        { value: approved, color: '#22c55e', label: 'Approved' },
        { value: paid, color: '#10b981', label: 'Paid' },
        { value: rejected, color: '#ef4444', label: 'Rejected' },
        { value: pending, color: '#f59e0b', label: 'Pending / Processing' },
      ]
      const donutImg = renderDonutChart(statusSegments, 320)
      const chartAreaY = y
      if (donutImg) {
        doc.addImage(donutImg, 'PNG', m, chartAreaY, 38, 38)
      }

      const legendX = m + 44
      let legendY = chartAreaY + 4
      statusSegments.forEach((seg) => {
        if (seg.value === 0) return
        const hex = seg.color
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        doc.setFillColor(r, g, b)
        doc.roundedRect(legendX, legendY - 2.5, 3.5, 3.5, 0.5, 0.5, 'F')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(63, 63, 70)
        doc.text(`${seg.label}:  ${seg.value}`, legendX + 6, legendY)
        legendY += 7
      })

      const qx = m + 100
      doc.setFillColor(248, 248, 250)
      doc.roundedRect(qx, chartAreaY, 78, 38, 2, 2, 'F')
      doc.setDrawColor(228, 228, 231)
      doc.setLineWidth(0.2)
      doc.roundedRect(qx, chartAreaY, 78, 38, 2, 2, 'S')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.setTextColor(113, 113, 122)
      doc.text('QUICK STATS', qx + 4, chartAreaY + 6)

      const qStats = [
        `Avg views/post: ${subs.length > 0 ? Math.round(totalViews / subs.length).toLocaleString() : '0'}`,
        `Avg payout/post: ${subs.length > 0 ? fmtBudget(Math.round(totalPaid / Math.max(1, paid))) : '0'} ${sym}`,
        `Approval rate: ${subs.length > 0 ? ((approved + paid) / subs.length * 100).toFixed(0) : '0'}%`,
        `Cost efficiency: ${totalViews > 0 ? fmtToken(Math.round(totalPaid / totalViews * 1000), 2) : '0'} ${sym}/1k views`,
      ]
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(63, 63, 70)
      qStats.forEach((qs, i) => {
        doc.text(qs, qx + 4, chartAreaY + 13 + i * 7)
      })

      y = chartAreaY + 44

      // ── ANALYTICS CHARTS ──
      const paidOrApproved = subs.filter(s =>
        ['PAID', 'APPROVED', 'PAYMENT_REQUESTED'].includes(s.status) && s.payoutLamports
      )

      const chartW = pw - m * 2
      const chartImgH = 120
      const donutSize = 50
      const renderChartPageHeader = (title: string) => {
        doc.setFillColor(248, 248, 250)
        doc.rect(0, 0, pw, 18, 'F')
        doc.setDrawColor(228, 228, 231)
        doc.setLineWidth(0.3)
        doc.line(0, 18, pw, 18)
        if (logoDataUrl) doc.addImage(logoDataUrl, 'PNG', m, 4, 9, 9)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(24, 24, 27)
        doc.text(title, m + 13, 11)
      }

      if (paidOrApproved.length > 0) {

        // ── Page: Klout Score Tranche ──
        const scoreTranches: Record<string, { total: number; count: number; color: string }> = {
          '0-500': { total: 0, count: 0, color: '#94a3b8' },
          '500-1k': { total: 0, count: 0, color: '#60a5fa' },
          '1k-2k': { total: 0, count: 0, color: '#34d399' },
          '2k-4k': { total: 0, count: 0, color: '#a78bfa' },
          '4k-7k': { total: 0, count: 0, color: '#f59e0b' },
          '7k-10k': { total: 0, count: 0, color: '#ef4444' },
          'N/A': { total: 0, count: 0, color: '#d4d4d8' },
        }
        for (const s of paidOrApproved) {
          const score = s.submitter.kloutScore
          const payout = Number(s.payoutLamports) / tInfo.multiplier
          let bucket: string
          if (score == null) bucket = 'N/A'
          else if (score < 500) bucket = '0-500'
          else if (score < 1000) bucket = '500-1k'
          else if (score < 2000) bucket = '1k-2k'
          else if (score < 4000) bucket = '2k-4k'
          else if (score < 7000) bucket = '4k-7k'
          else bucket = '7k-10k'
          scoreTranches[bucket].total += payout
          scoreTranches[bucket].count += 1
        }
        const scoreBars = Object.entries(scoreTranches)
          .filter(([, v]) => v.count > 0)
          .map(([label, v]) => ({ label: `${label} (${v.count})`, value: v.total, color: v.color }))

        const scoreChartImg = renderBarChart(scoreBars, `Payout by Klout Score Tranche (${sym})`, '', 720, 380)
        if (scoreChartImg) {
          doc.addPage()
          renderChartPageHeader('Analytics — Klout Score Distribution')
          doc.addImage(scoreChartImg, 'PNG', m, 28, chartW, chartImgH)

          const scoreDonutSegs = Object.entries(scoreTranches)
            .filter(([, v]) => v.count > 0)
            .map(([label, v]) => ({ label, value: v.count, color: v.color }))
          const scoreDonut = renderDonutChart(scoreDonutSegs, 360)
          if (scoreDonut) {
            const dy = 158
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(10)
            doc.setTextColor(63, 63, 70)
            doc.text('Submitters by Score Tranche', m, dy)
            doc.addImage(scoreDonut, 'PNG', m + 8, dy + 6, donutSize, donutSize)
            let ldy = dy + 12
            scoreDonutSegs.forEach(seg => {
              if (seg.value === 0) return
              const hex = seg.color
              doc.setFillColor(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16))
              doc.roundedRect(m + donutSize + 18, ldy - 2.5, 4, 4, 0.7, 0.7, 'F')
              doc.setFont('helvetica', 'normal')
              doc.setFontSize(8.5)
              doc.setTextColor(63, 63, 70)
              doc.text(`${seg.label}: ${seg.value} submitter${seg.value !== 1 ? 's' : ''}`, m + donutSize + 25, ldy + 0.5)
              ldy += 7
            })
          }
        }

        // ── Page: Geographic Region ──
        const GEO_LABELS: Record<number, string> = {
          1: 'Tier 1 (US/CA)',
          2: 'Tier 2 (W.Europe)',
          3: 'Tier 3 (E.Eur/Asia)',
          4: 'Tier 4 (Africa/Other)',
        }
        const GEO_COLORS: Record<number, string> = {
          1: '#3b82f6', 2: '#22c55e', 3: '#f59e0b', 4: '#ef4444',
        }
        const geoData: Record<string, { total: number; count: number; color: string }> = {}
        for (const s of paidOrApproved) {
          const tier = s.submitter.geoTier
          const payout = Number(s.payoutLamports) / tInfo.multiplier
          const key = tier != null ? (GEO_LABELS[tier] || `Tier ${tier}`) : 'Unknown'
          const color = tier != null ? (GEO_COLORS[tier] || '#94a3b8') : '#d4d4d8'
          if (!geoData[key]) geoData[key] = { total: 0, count: 0, color }
          geoData[key].total += payout
          geoData[key].count += 1
        }
        const geoBars = Object.entries(geoData)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([label, v]) => ({ label: `${label} (${v.count})`, value: v.total, color: v.color }))

        const geoChartImg = renderBarChart(geoBars, `Payout by Geographic Region (${sym})`, '', 720, 380)
        if (geoChartImg) {
          doc.addPage()
          renderChartPageHeader('Analytics — Geographic Distribution')
          doc.addImage(geoChartImg, 'PNG', m, 28, chartW, chartImgH)

          const geoDonutSegs = Object.entries(geoData).map(([label, v]) => ({ label, value: v.count, color: v.color }))
          const geoDonut = renderDonutChart(geoDonutSegs, 360)
          if (geoDonut) {
            const dy = 158
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(10)
            doc.setTextColor(63, 63, 70)
            doc.text('Submitters by Region', m, dy)
            doc.addImage(geoDonut, 'PNG', m + 8, dy + 6, donutSize, donutSize)
            let ldy = dy + 12
            geoDonutSegs.forEach(seg => {
              if (seg.value === 0) return
              const hex = seg.color
              doc.setFillColor(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16))
              doc.roundedRect(m + donutSize + 18, ldy - 2.5, 4, 4, 0.7, 0.7, 'F')
              doc.setFont('helvetica', 'normal')
              doc.setFontSize(8.5)
              doc.setTextColor(63, 63, 70)
              doc.text(`${seg.label}: ${seg.value} submitter${seg.value !== 1 ? 's' : ''}`, m + donutSize + 25, ldy + 0.5)
              ldy += 7
            })
          }
        }

        // ── Page: Follower/Following Ratio ──
        const ratioTranches: Record<string, { total: number; count: number; color: string }> = {
          '<0.5': { total: 0, count: 0, color: '#ef4444' },
          '0.5-1': { total: 0, count: 0, color: '#f59e0b' },
          '1-2': { total: 0, count: 0, color: '#eab308' },
          '2-5': { total: 0, count: 0, color: '#22c55e' },
          '5-10': { total: 0, count: 0, color: '#3b82f6' },
          '10+': { total: 0, count: 0, color: '#8b5cf6' },
          'N/A': { total: 0, count: 0, color: '#d4d4d8' },
        }
        for (const s of paidOrApproved) {
          const { followers, following } = s.submitter
          const payout = Number(s.payoutLamports) / tInfo.multiplier
          let bucket: string
          if (followers == null || following == null || following === 0) bucket = 'N/A'
          else {
            const ratio = followers / following
            if (ratio < 0.5) bucket = '<0.5'
            else if (ratio < 1) bucket = '0.5-1'
            else if (ratio < 2) bucket = '1-2'
            else if (ratio < 5) bucket = '2-5'
            else if (ratio < 10) bucket = '5-10'
            else bucket = '10+'
          }
          ratioTranches[bucket].total += payout
          ratioTranches[bucket].count += 1
        }
        const ratioBars = Object.entries(ratioTranches)
          .filter(([, v]) => v.count > 0)
          .map(([label, v]) => ({ label: `${label} (${v.count})`, value: v.total, color: v.color }))

        const ratioChartImg = renderBarChart(ratioBars, `Payout by Follower/Following Ratio (${sym})`, '', 720, 380)
        if (ratioChartImg) {
          doc.addPage()
          renderChartPageHeader('Analytics — Follower/Following Ratio')
          doc.addImage(ratioChartImg, 'PNG', m, 28, chartW, chartImgH)

          const ratioDonutSegs = Object.entries(ratioTranches)
            .filter(([, v]) => v.count > 0)
            .map(([label, v]) => ({ label, value: v.count, color: v.color }))
          const ratioDonut = renderDonutChart(ratioDonutSegs, 360)
          if (ratioDonut) {
            const dy = 158
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(10)
            doc.setTextColor(63, 63, 70)
            doc.text('Submitters by Ratio', m, dy)
            doc.addImage(ratioDonut, 'PNG', m + 8, dy + 6, donutSize, donutSize)
            let ldy = dy + 12
            ratioDonutSegs.forEach(seg => {
              if (seg.value === 0) return
              const hex = seg.color
              doc.setFillColor(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16))
              doc.roundedRect(m + donutSize + 18, ldy - 2.5, 4, 4, 0.7, 0.7, 'F')
              doc.setFont('helvetica', 'normal')
              doc.setFontSize(8.5)
              doc.setTextColor(63, 63, 70)
              doc.text(`${seg.label}: ${seg.value} submitter${seg.value !== 1 ? 's' : ''}`, m + donutSize + 25, ldy + 0.5)
              ldy += 7
            })
          }
        }
      }

      // ── SUBMISSIONS TABLE ──
      doc.addPage()
      y = 14
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(24, 24, 27)
      doc.text(`Submissions Detail (${subs.length})`, m, y)
      y += 4

      const STATUS_COLORS: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
        APPROVED: { bg: [220, 252, 231], text: [22, 101, 52] },
        PAID: { bg: [209, 250, 229], text: [6, 78, 59] },
        PAYMENT_REQUESTED: { bg: [243, 232, 255], text: [107, 33, 168] },
        REJECTED: { bg: [254, 226, 226], text: [153, 27, 27] },
        CREATOR_REJECTED: { bg: [255, 237, 213], text: [154, 52, 18] },
        READING_VIEWS: { bg: [219, 234, 254], text: [30, 64, 175] },
        CHECKING_CONTENT: { bg: [219, 234, 254], text: [30, 64, 175] },
        PENDING_PAYMENT: { bg: [254, 249, 195], text: [133, 77, 14] },
        PAYMENT_FAILED: { bg: [254, 226, 226], text: [153, 27, 27] },
      }

      const tableRows = subs.map((s) => {
        const name = s.submitter.xUsername ? `@${s.submitter.xUsername}` : s.submitter.username || s.submitter.walletAddress.slice(0, 8)
        return [
          name,
          s.submitter.kloutScore != null ? s.submitter.kloutScore.toLocaleString() : '-',
          s.viewCount != null ? s.viewCount.toLocaleString() : '-',
          s.payoutLamports ? `${fmtBudget(s.payoutLamports)} ${sym}` : '-',
          s.payoutLamports ? `${fmtBudget(Math.round(Number(s.payoutLamports) * 0.1))} ${sym}` : '-',
          s.status.replace(/_/g, ' '),
          new Date(s.createdAt).toLocaleDateString(),
        ]
      })

      autoTable(doc, {
        startY: y,
        head: [['Submitter', 'Klout Score', 'Views', `Payout (${sym})`, `Fee (${sym})`, 'Status', 'Date']],
        body: tableRows,
        theme: 'grid',
        margin: { left: m, right: m, bottom: 18 },
        headStyles: {
          fillColor: [24, 24, 27],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 3,
        },
        styles: {
          fontSize: 7,
          cellPadding: 2.5,
          lineColor: [228, 228, 231],
          lineWidth: 0.2,
          textColor: [63, 63, 70],
        },
        alternateRowStyles: { fillColor: [250, 250, 252] },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { halign: 'right', cellWidth: 22 },
          2: { halign: 'right', cellWidth: 20 },
          3: { halign: 'right', cellWidth: 26 },
          4: { halign: 'right', cellWidth: 22 },
          5: { cellWidth: 30 },
          6: { cellWidth: 22 },
        },
        didParseCell: (hookData: any) => {
          if (hookData.section === 'body' && hookData.column.index === 5) {
            const raw = subs[hookData.row.index]?.status
            const sc = STATUS_COLORS[raw]
            if (sc) {
              hookData.cell.styles.fillColor = sc.bg
              hookData.cell.styles.textColor = sc.text
              hookData.cell.styles.fontStyle = 'bold'
            }
          }
        },
      })

      addFooter()
      doc.save(`campaign-report-${taskId.slice(0, 8)}.pdf`)
    } catch (e: any) {
      alert(e.message || 'Export failed')
    }
    setExporting(false)
    setExportOpen(false)
  }

  const fetchData = useCallback(async () => {
    try {
      const subsParams = new URLSearchParams({ page: String(page), limit: '50' })
      if (sortCol) {
        subsParams.set('sortBy', sortCol)
        subsParams.set('sortDir', sortDir)
      }
      const [statsRes, subsRes] = await Promise.all([
        authFetch(`/api/tasks/${taskId}/campaign-stats`),
        authFetch(`/api/tasks/${taskId}/campaign-submissions?${subsParams}`),
      ])
      const [statsData, subsData] = await Promise.all([statsRes.json(), subsRes.json()])
      if (statsData.success) setStats(statsData.stats)
      if (subsData.success) {
        setSubmissions(subsData.submissions)
        if (subsData.pagination) {
          setTotalPages(subsData.pagination.pages)
          setTotalCount(subsData.pagination.total)
        }
      }
    } catch {}
    setLoading(false)
  }, [taskId, authFetch, page, sortCol, sortDir])

  const handleReject = async (submissionId: string) => {
    if (!rejectPreset) {
      setRejectError('Please select a reason for rejection')
      return
    }
    if (rejectPreset === 'Other' && !rejectReason.trim()) {
      setRejectError('Please enter a reason')
      return
    }
    const finalReason = rejectPreset === 'Other' ? rejectReason.trim() : rejectPreset
    setRejectLoading(true)
    setRejectError('')
    try {
      const res = await authFetch(`/api/tasks/${taskId}/campaign-submissions/${submissionId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectPreset, ...(rejectPreset === 'Other' ? { customReason: rejectReason.trim() } : {}), banSubmitter }),
      })
      const data = await res.json()
      if (!data.success) {
        setRejectError(data.message || 'Failed to reject submission')
      } else {
        setRejectingId(null)
        setRejectPreset('')
        setRejectReason('')
        setBanSubmitter(false)
        fetchData()
      }
    } catch {
      setRejectError('Network error')
    }
    setRejectLoading(false)
  }

  const handleOverrideApprove = async (submissionId: string) => {
    setOverrideApproveLoading(true)
    setOverrideApproveError('')
    try {
      const res = await authFetch(`/api/tasks/${taskId}/campaign-submissions/${submissionId}/override-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!data.success) {
        setOverrideApproveError(data.message || 'Failed to approve submission')
      } else {
        setOverrideApprovingId(null)
        fetchData()
      }
    } catch {
      setOverrideApproveError('Network error')
    }
    setOverrideApproveLoading(false)
  }

  const handleRequestPayment = async () => {
    setRequestingPayment(true)
    setRequestPaymentError('')
    setRequestPaymentSuccess('')
    try {
      const res = await authFetch(`/api/tasks/${taskId}/campaign-request-payment`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!data.success) {
        setRequestPaymentError(data.message || 'Payment request failed')
      } else {
        setRequestPaymentSuccess(`Payment requested for ${data.submissionCount} post(s) — ${formatTokenAmount(data.totalPayoutLamports, tInfo)} ${sym}`)
        fetchData()
      }
    } catch {
      setRequestPaymentError('Network error')
    }
    setRequestingPayment(false)
  }

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshTrigger])

  if (loading) {
    return <div className="animate-pulse rounded-xl border border-zinc-200 p-6 border-k-border h-48" />
  }

  if (!stats) return null

  const budgetPct = Number(stats.totalBudgetLamports) > 0
    ? ((Number(stats.totalBudgetLamports) - Number(stats.budgetRemainingLamports)) / Number(stats.totalBudgetLamports)) * 100
    : 0

  const myApprovedPayout = Number(stats.myApprovedPayoutLamports || '0')
  const budgetRemaining = Number(stats.budgetRemainingLamports || '0')
  const cappedPayout = Math.min(myApprovedPayout, budgetRemaining)
  const minPayoutThreshold = Number(stats.minPayoutLamports || '0')
  const canRequestPayment = !isCreator && !isSharedViewer && cappedPayout > 0 && (minPayoutThreshold === 0 || myApprovedPayout >= minPayoutThreshold)

  const toggleSort = (col: string) => {
    setPage(1)
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const SortHeader = ({ col, children, className = '' }: { col: string; children: React.ReactNode; className?: string }) => (
    <th
      className={`pb-2 pr-4 font-medium text-zinc-500 cursor-pointer select-none hover:text-zinc-300 transition-colors ${className}`}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortCol === col ? (
          <svg className="h-3 w-3 text-accent" viewBox="0 0 12 12" fill="currentColor">
            {sortDir === 'asc'
              ? <path d="M6 2l4 5H2z" />
              : <path d="M6 10l4-5H2z" />}
          </svg>
        ) : (
          <svg className="h-3 w-3 opacity-30" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 2l3 4H3zM6 10l3-4H3z" />
          </svg>
        )}
      </span>
    </th>
  )

  return (
    <div className="space-y-6">
      {/* Shared viewer banner */}
      {isSharedViewer && (
        <div className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 text-sm text-indigo-400">
          You have view-only access to this campaign dashboard.
        </div>
      )}

      {/* Export + Share + Stats Cards — creator or shared viewer */}
      {(isCreator || isSharedViewer) && (
        <>
        <div className="flex items-center justify-end gap-2" ref={exportRef}>
          {isCreator && (
            <button
              onClick={() => setShareOpen(o => !o)}
              className="flex items-center gap-1.5 rounded-lg border border-k-border px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-surface transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Share ({sharedUsers.length})
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setExportOpen(o => !o)}
              disabled={exporting}
              className="flex items-center gap-1.5 rounded-lg border border-k-border px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-surface transition-colors disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {exporting ? 'Exporting...' : 'Export Report'}
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-k-border bg-zinc-900 shadow-xl">
                <button
                  onClick={exportCSV}
                  disabled={exporting}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-surface transition-colors rounded-t-lg"
                >
                  <svg className="h-3.5 w-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export as CSV
                </button>
                <button
                  onClick={exportPDF}
                  disabled={exporting}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-surface transition-colors rounded-b-lg"
                >
                  <svg className="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Export as PDF
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Share panel */}
        {isCreator && shareOpen && (
          <div className="rounded-xl border border-k-border p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Share Dashboard</h3>
            <p className="text-xs text-zinc-400">Grant view-only access to team members by wallet address.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareWallet}
                onChange={(e) => { setShareWallet(e.target.value); setShareError('') }}
                placeholder="Enter wallet address..."
                className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-accent focus:outline-none"
              />
              <button
                onClick={handleShare}
                disabled={shareLoading || !shareWallet.trim()}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-50"
              >
                {shareLoading ? 'Sharing...' : 'Share'}
              </button>
            </div>
            {shareError && <p className="text-xs text-red-400">{shareError}</p>}
            {sharedUsersLoading ? (
              <div className="animate-pulse h-8 rounded bg-surface" />
            ) : sharedUsers.length > 0 ? (
              <div className="space-y-2">
                {sharedUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between rounded-lg border border-k-border/50 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {u.profilePicUrl ? (
                        <img src={u.profilePicUrl} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-medium text-zinc-300 shrink-0">
                          {u.walletAddress.slice(0, 2)}
                        </div>
                      )}
                      <span className="text-sm text-zinc-300 truncate">
                        {u.username || `${u.walletAddress.slice(0, 6)}...${u.walletAddress.slice(-4)}`}
                      </span>
                    </div>
                    <button
                      onClick={() => handleUnshare(u.userId)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">Not shared with anyone yet.</p>
            )}
          </div>
        )}
        </>
      )}
      {(isCreator || isSharedViewer) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">Total Budget</p>
            <p className="text-lg font-semibold text-zinc-100">{formatTokenAmount(stats.totalBudgetLamports, tInfo, 0)} {sym}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">Remaining</p>
            <p className="text-lg font-semibold text-zinc-100">{formatTokenAmount(stats.budgetRemainingLamports, tInfo, 0)} {sym}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">Total Views</p>
            <p className="text-lg font-semibold text-zinc-100">{stats.totalViews.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">Submissions</p>
            <p className="text-lg font-semibold text-zinc-100">{stats.totalSubmissions}</p>
            <p className="text-xs text-zinc-400">{stats.approved} approved, {stats.paymentRequested} pending pay, {stats.paid} paid, {stats.rejected} rejected</p>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
            <p className="text-xs text-zinc-500">CPM (per 1,000 views)</p>
            <p className="text-lg font-semibold text-zinc-100">{formatTokenAmount(stats.cpmLamports, tInfo, 2)} {sym}</p>
          </div>
          {stats.minViews > 0 && (
            <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
              <p className="text-xs text-zinc-500">Min views per post</p>
              <p className="text-lg font-semibold text-zinc-100">{stats.minViews.toLocaleString()}</p>
            </div>
          )}
          {Number(stats.minPayoutLamports) > 0 && (
            <div className="rounded-lg border border-zinc-200 p-3 border-k-border">
              <p className="text-xs text-zinc-500">Min payout threshold</p>
              <p className="text-lg font-semibold text-zinc-100">{formatTokenAmount(stats.minPayoutLamports, tInfo, 2)} {sym}</p>
            </div>
          )}
        </div>
      )}

      {/* Budget Progress Bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
          <span>Budget used: {budgetPct.toFixed(1)}%</span>
          <span>CPM: {formatTokenAmount(stats.cpmLamports, tInfo, 2)} {sym}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-700 bg-surface">
          <div
            className="h-full rounded-full bg-green-500 transition-all"
            style={{ width: `${Math.min(budgetPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Request Payment section (for non-creators, not shared viewers) */}
      {!isCreator && !isSharedViewer && (
        <div className="rounded-xl border border-k-border p-4">
          <h3 className="mb-2 text-sm font-semibold text-white">Your Payout</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-zinc-400">
              <span>Approved (unpaid):</span>
              <span className="font-medium text-zinc-100">
                {formatTokenAmount(myApprovedPayout, tInfo)} {sym}
                {myApprovedPayout > 0 && cappedPayout < myApprovedPayout && (
                  <span className="text-amber-400"> (capped to {formatTokenAmount(cappedPayout, tInfo)} {sym})</span>
                )}
              </span>
            </div>
            {minPayoutThreshold > 0 && (
              <div className="flex justify-between text-zinc-400">
                <span>Min payout threshold:</span>
                <span className="font-medium text-zinc-100">{formatTokenAmount(minPayoutThreshold, tInfo)} {sym}</span>
              </div>
            )}
            {minPayoutThreshold > 0 && myApprovedPayout > 0 && myApprovedPayout < minPayoutThreshold && (
              <div className="mt-1">
                <div className="mb-1 text-xs text-zinc-500">Progress to threshold: {((myApprovedPayout / minPayoutThreshold) * 100).toFixed(1)}%</div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all"
                    style={{ width: `${Math.min((myApprovedPayout / minPayoutThreshold) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
            {requestPaymentError && (
              <p className="text-xs text-red-400">{requestPaymentError}</p>
            )}
            {requestPaymentSuccess && (
              <p className="text-xs text-green-400">{requestPaymentSuccess}</p>
            )}
            <button
              onClick={handleRequestPayment}
              disabled={!canRequestPayment || requestingPayment}
              className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-black hover:bg-accent-hover disabled:opacity-50"
            >
              {requestingPayment
                ? 'Requesting...'
                : canRequestPayment
                  ? `Request Payment (${formatTokenAmount(cappedPayout, tInfo)} ${sym})`
                  : myApprovedPayout > 0
                    ? `Below threshold (${formatTokenAmount(myApprovedPayout, tInfo)} / ${formatTokenAmount(minPayoutThreshold, tInfo)} ${sym})`
                    : 'No approved payouts yet'}
            </button>
          </div>
        </div>
      )}

      {/* Pending Payment Requests (bundled) */}
      {isCreator && (() => {
        const paymentRequestedSubs = submissions.filter(s => s.status === 'PAYMENT_REQUESTED' && s.paymentRequestId)
        const grouped = paymentRequestedSubs.reduce<Record<string, typeof paymentRequestedSubs>>((acc, s) => {
          const key = s.paymentRequestId!
          if (!acc[key]) acc[key] = []
          acc[key].push(s)
          return acc
        }, {})
        const entries = Object.entries(grouped)
        if (entries.length === 0) return null
        return (
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-white">
              Pending Payment Requests ({entries.length})
            </h3>
            <div className="space-y-3">
              {entries.map(([requestId, subs]) => (
                <CampaignPayBundle
                  key={requestId}
                  taskId={taskId}
                  paymentRequestId={requestId}
                  multisigAddress={multisigAddress}
                  recipientWallet={subs[0].submitter.walletAddress}
                  submissions={subs}
                  onPaid={fetchData}
                  onReject={(submissionId) => {
                    setRejectingId(submissionId)
                    setRejectPreset('')
                    setRejectReason('')
                    setRejectError('')
                    setBanSubmitter(false)
                  }}
                  paymentToken={paymentToken}
                  customTokenMint={customTokenMint}
                  customTokenSymbol={customTokenSymbol}
                  customTokenDecimals={customTokenDecimals}
                  submitterId={subs[0].submitterId}
                />
              ))}
            </div>
          </div>
        )
      })()}

      {/* Submissions Table */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-white">Submissions ({totalCount})</h3>
        {submissions.length === 0 ? (
          <p className="text-sm text-zinc-500">No submissions yet.</p>
        ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-k-border">
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Submitter</th>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Post</th>
                  <SortHeader col="score">Klout Score</SortHeader>
                  <SortHeader col="views">Views</SortHeader>
                  <SortHeader col="payout">Payout</SortHeader>
                  <th className="pb-2 pr-4 font-medium text-zinc-500">Platform Fee (10%)</th>
                  <SortHeader col="status">Status</SortHeader>
                  <SortHeader col="date">Date</SortHeader>
                  {isCreator && <th className="pb-2 font-medium text-zinc-500">Action</th>}
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-k-border border-k-border/50">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {s.submitter.profilePicUrl ? (
                          <img src={s.submitter.profilePicUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700 text-[10px] font-medium text-zinc-400 bg-zinc-700 text-zinc-300">
                            {s.submitter.walletAddress.slice(0, 2)}
                          </div>
                        )}
                        <span className="text-zinc-300">
                          {s.submitter.xUsername ? `@${s.submitter.xUsername}` : s.submitter.username || `${s.submitter.walletAddress.slice(0, 6)}...`}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <a href={s.postUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover text-blue-400">
                        View Post
                      </a>
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {s.submitter.kloutScore != null ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold text-yellow-400">
                          <svg className="h-3 w-3" viewBox="0 0 375 375" fill="currentColor"><path d="M255.074 48.605L158.453 47.785L125.961 193.941H174.68L135.703 318.171L267.234 141.16H195.789L255.074 48.605Z"/></svg>
                          {s.submitter.kloutScore.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-500">-</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {s.viewCount !== null ? s.viewCount.toLocaleString() : '-'}
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {s.payoutLamports ? `${formatTokenAmount(s.payoutLamports, tInfo, 2)} ${sym}` : '-'}
                    </td>
                    <td className="py-3 pr-4 text-zinc-300">
                      {s.payoutLamports ? `${formatTokenAmount(Math.round(Number(s.payoutLamports) * 0.1), tInfo, 2)} ${sym}` : '-'}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] || ''}`}>
                        {s.status.replace(/_/g, ' ')}
                      </span>
                      {(s.status === 'REJECTED' || s.status === 'CREATOR_REJECTED') && s.rejectionReason && (
                        <p className={`mt-0.5 text-xs ${s.status === 'CREATOR_REJECTED' ? 'text-orange-400' : 'text-red-500'}`} title={s.rejectionReason}>
                          {s.status === 'CREATOR_REJECTED' ? 'Creator: ' : ''}
                          {s.rejectionReason.length > 50 ? s.rejectionReason.slice(0, 50) + '...' : s.rejectionReason}
                        </p>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-xs text-zinc-400">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    {isCreator && (
                      <td className="py-3">
                        {s.status === 'PAYMENT_REQUESTED' && s.paymentRequestId && (
                          <div className="flex flex-col gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-purple-400">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" /></svg>
                              In payment bundle
                            </span>
                            {rejectingId === s.id && (
                              <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 p-2">
                                <select
                                  value={rejectPreset}
                                  onChange={(e) => { setRejectPreset(e.target.value as any); setRejectError('') }}
                                  className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-red-500 focus:outline-none"
                                >
                                  <option value="">Select reason...</option>
                                  <option value="Botting">Botting</option>
                                  <option value="Quality">Quality</option>
                                  <option value="Relevancy">Relevancy</option>
                                  <option value="Other">Other</option>
                                </select>
                                {rejectPreset === 'Other' && (
                                  <input
                                    type="text"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Enter rejection reason..."
                                    className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
                                    maxLength={500}
                                  />
                                )}
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={banSubmitter}
                                    onChange={(e) => setBanSubmitter(e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500"
                                  />
                                  <span className="text-xs text-zinc-400">Ban from all your future campaigns</span>
                                </label>
                                {rejectError && <p className="text-xs text-red-500">{rejectError}</p>}
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleReject(s.id)}
                                    disabled={rejectLoading || !rejectPreset || (rejectPreset === 'Other' && !rejectReason.trim())}
                                    className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {rejectLoading ? (banSubmitter ? 'Rejecting & Banning...' : 'Rejecting...') : (banSubmitter ? 'Reject & Ban' : 'Confirm Reject')}
                                  </button>
                                  <button
                                    onClick={() => { setRejectingId(null); setRejectPreset(''); setBanSubmitter(false) }}
                                    className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {s.status === 'PAYMENT_REQUESTED' && !s.paymentRequestId && s.payoutLamports && (
                          <div className="flex items-center gap-2">
                            <CampaignPayButton
                              taskId={taskId}
                              submissionId={s.id}
                              multisigAddress={multisigAddress}
                              recipientWallet={s.submitter.walletAddress}
                              payoutLamports={s.payoutLamports}
                              onPaid={fetchData}
                              paymentToken={paymentToken}
                              customTokenMint={customTokenMint}
                              customTokenSymbol={customTokenSymbol}
                              customTokenDecimals={customTokenDecimals}
                              submitterId={s.submitterId}
                            />
                          </div>
                        )}
                        {(s.status === 'APPROVED') && s.payoutLamports && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-500">Awaiting payment request</span>
                            <button
                              onClick={() => { setRejectingId(s.id); setRejectPreset(''); setRejectReason(''); setRejectError(''); setBanSubmitter(false) }}
                              className="rounded-md border border-red-500/30 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                            >
                              Reject
                            </button>
                            {rejectingId === s.id && (
                              <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 p-2">
                                <select
                                  value={rejectPreset}
                                  onChange={(e) => { setRejectPreset(e.target.value as any); setRejectError('') }}
                                  className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 focus:border-red-500 focus:outline-none"
                                >
                                  <option value="">Select reason...</option>
                                  <option value="Botting">Botting</option>
                                  <option value="Quality">Quality</option>
                                  <option value="Relevancy">Relevancy</option>
                                  <option value="Other">Other</option>
                                </select>
                                {rejectPreset === 'Other' && (
                                  <input
                                    type="text"
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="Enter rejection reason..."
                                    className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-red-500 focus:outline-none"
                                    maxLength={500}
                                  />
                                )}
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={banSubmitter}
                                    onChange={(e) => setBanSubmitter(e.target.checked)}
                                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-red-500 focus:ring-red-500"
                                  />
                                  <span className="text-xs text-zinc-400">Ban from all your future campaigns</span>
                                </label>
                                {rejectError && <p className="text-xs text-red-500">{rejectError}</p>}
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleReject(s.id)}
                                    disabled={rejectLoading || !rejectPreset || (rejectPreset === 'Other' && !rejectReason.trim())}
                                    className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {rejectLoading ? (banSubmitter ? 'Rejecting & Banning...' : 'Rejecting...') : (banSubmitter ? 'Reject & Ban' : 'Confirm Reject')}
                                  </button>
                                  <button
                                    onClick={() => { setRejectingId(null); setRejectPreset(''); setBanSubmitter(false) }}
                                    className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {s.status === 'PAID' && s.paymentTxSig && (
                          <span className="text-xs text-emerald-600">Paid</span>
                        )}
                        {s.status === 'CREATOR_REJECTED' && (
                          <span className="text-xs text-orange-400">Rejected by you</span>
                        )}
                        {s.status === 'REJECTED' && (
                          <div className="flex flex-col gap-1.5">
                            {overrideApprovingId === s.id ? (
                              <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 p-2">
                                <p className="text-xs text-zinc-400">Override auto-rejection and approve this submission?</p>
                                {overrideApproveError && <p className="text-xs text-red-500">{overrideApproveError}</p>}
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleOverrideApprove(s.id)}
                                    disabled={overrideApproveLoading}
                                    className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                  >
                                    {overrideApproveLoading ? 'Approving...' : 'Confirm Approve'}
                                  </button>
                                  <button
                                    onClick={() => { setOverrideApprovingId(null); setOverrideApproveError('') }}
                                    className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-200"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setOverrideApprovingId(s.id); setOverrideApproveError('') }}
                                className="rounded-md border border-green-500/30 px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-500/10 transition-colors"
                              >
                                Override &amp; Approve
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Page {page} of {totalPages} ({totalCount} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-k-border px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-surface disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md border border-k-border px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-surface disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
        )}
      </div>
    </div>
  )
}
