'use client'

import { useState } from 'react'
import Link from 'next/link'

const pages: Record<string, string> = {
  intro: 'Introduction',
  quickstart: 'Quickstart',
  concepts: 'Core Concepts',
  'klout-score': 'My Klout Score',
  'browse-campaigns': 'Browsing Campaigns',
  'join-campaign': 'Joining a Campaign',
  'cpm-payouts': 'CPM & Payouts',
  wallet: 'Wallet & Payments',
  launch: 'Launching a Campaign',
  'campaign-fields': 'Campaign Fields',
  'managing-submissions': 'Managing Submissions',
  escrow: 'Escrow & Payments',
  referrals: 'Referral Program',
  'referral-tiers': 'Referral Tiers',
  faq: 'FAQ',
  changelog: 'Changelog',
}

const sections = [
  { label: 'Getting Started', items: ['intro', 'quickstart', 'concepts'] },
  { label: 'Klout Score', items: ['klout-score'] },
  { label: 'For Creators', items: ['browse-campaigns', 'join-campaign', 'cpm-payouts', 'wallet'] },
  { label: 'For Brands', items: ['launch', 'campaign-fields', 'managing-submissions', 'escrow'] },
  { label: 'Referrals', items: ['referrals', 'referral-tiers'] },
  { label: 'Resources', items: ['faq', 'changelog'] },
]

const sectionIcons: Record<string, string> = {
  intro: '🏠', quickstart: '⚡', concepts: '🧠',
  'klout-score': '⚡',
  'browse-campaigns': '📋', 'join-campaign': '🚀', 'cpm-payouts': '💸', wallet: '👛',
  launch: '📣', 'campaign-fields': '📝', 'managing-submissions': '✅', escrow: '🔐',
  referrals: '🔗', 'referral-tiers': '📈',
  
  faq: '❓', changelog: '📝',
}

function Callout({ type, icon, title, children }: { type: 'info' | 'tip' | 'warning' | 'danger'; icon: string; title: string; children: React.ReactNode }) {
  const styles = {
    info: 'bg-accent/[.07] border-accent/20',
    tip: 'bg-green-500/[.07] border-green-500/20',
    warning: 'bg-orange-500/[.07] border-orange-500/20',
    danger: 'bg-red-500/[.07] border-red-500/20',
  }
  return (
    <div className={`flex gap-3 rounded-xl border p-4 my-5 ${styles[type]}`}>
      <span className="text-lg shrink-0 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <strong className="block text-sm font-semibold text-zinc-100 mb-1">{title}</strong>
        <p className="text-[13.5px] text-zinc-400 leading-relaxed m-0">{children}</p>
      </div>
    </div>
  )
}

function Step({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-7 relative">
      <div className="w-8 h-8 bg-accent text-black rounded-full flex items-center justify-center font-bold text-sm shrink-0">{num}</div>
      <div className="flex-1 pt-1">
        <h4 className="font-semibold text-[15px] text-zinc-100 mb-1.5">{title}</h4>
        <p className="text-[13.5px] text-zinc-400 leading-relaxed m-0">{children}</p>
      </div>
    </div>
  )
}

function InfoCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-k-border bg-surface overflow-hidden my-6">
      <div className="bg-surface-hover px-5 py-3.5 border-b border-k-border flex items-center gap-2.5 font-bold text-[15px]">
        <span>{icon}</span> {title}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}


function Badge({ color, children }: { color: 'yellow' | 'green' | 'gray' | 'red' | 'blue'; children: React.ReactNode }) {
  const styles = {
    yellow: 'bg-accent/15 text-accent',
    green: 'bg-green-500/15 text-green-400',
    gray: 'bg-zinc-700/50 text-zinc-400',
    red: 'bg-red-500/15 text-red-400',
    blue: 'bg-blue-500/15 text-blue-400',
  }
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-medium ${styles[color]}`}>{children}</span>
}

/* ═══════════════ PAGE SECTIONS ═══════════════ */

function IntroPage({ go }: { go: (id: string) => void }) {
  return (
    <>
      <div className="mb-12">
        <div className="inline-flex items-center gap-1.5 bg-accent/10 border border-accent/25 text-accent text-[11px] font-mono tracking-wide px-2.5 py-1 rounded-full mb-4">✦ Official Documentation</div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] mb-3.5">Monetize your <span className="text-accent">Klout</span></h1>
        <p className="text-[17px] text-zinc-400 max-w-xl leading-relaxed mb-7">Klout connects X (Twitter) creators with brands — earn SOL based on the real views your posts generate. Your Klout Score determines eligibility and future earning power.</p>
        <div className="flex gap-2.5 flex-wrap">
          <button onClick={() => go('quickstart')} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-black hover:bg-accent-hover transition">⚡ Get Started</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-10">
        {[
          { id: 'klout-score', icon: '⚡', title: 'My Klout Score', desc: 'Your X account quality score — the key to unlocking campaigns and higher future earning rates.' },
          { id: 'cpm-payouts', icon: '📊', title: 'CPM & Payouts', desc: 'Earn based on real views. Understand how CPM, engagement thresholds, and payout requests work.' },
          { id: 'referrals', icon: '🔗', title: 'Referral Program', desc: 'Share your link and earn a % of platform fees on every campaign your referrals complete.' },
          { id: 'launch', icon: '📣', title: 'Launch a Campaign', desc: 'Post a CPM-based campaign, set your requirements, and pay only for real engagement.' },
        ].map((c) => (
          <button key={c.id} onClick={() => go(c.id)} className="text-left rounded-xl border border-k-border bg-surface p-5 hover:border-accent/40 hover:bg-surface-hover hover:-translate-y-0.5 transition-all">
            <div className="text-2xl mb-2.5">{c.icon}</div>
            <h3 className="font-bold text-[15px] text-zinc-100 mb-1">{c.title}</h3>
            <p className="text-[13px] text-zinc-500 leading-snug">{c.desc}</p>
          </button>
        ))}
      </div>

      <H2 first>What is Klout?</H2>
      <P>Klout is a creator monetization marketplace built on <strong className="text-zinc-100 font-medium">Solana</strong>. Brands post campaigns on X topics — creators post, generate real views, and earn SOL based on a <strong className="text-zinc-100 font-medium">CPM (cost per 1,000 views)</strong> model. Budget is held in an on-chain escrow vault and released by the brand directly to each creator&apos;s connected wallet as posts are verified and approved.</P>
      <P>The <strong className="text-zinc-100 font-medium">Klout Score</strong> — a measure of your X account&apos;s quality — determines which campaigns you can access and will drive tiered earning rates as the platform grows.</P>
      <Callout type="info" icon="⚡" title="Pay for real reach, not flat fees">Unlike fixed-payout platforms, Klout&apos;s CPM model means brands pay proportionally for the reach they actually receive, and creators are rewarded for the real impact their posts generate.</Callout>

      <H2>Platform at a Glance</H2>
      <Table heads={['Feature', 'Description']} rows={[
        [<strong key="a" className="text-zinc-100 font-medium">Klout Score</strong>, 'X account quality score — gates campaign access and will determine future earning rates'],
        [<strong key="b" className="text-zinc-100 font-medium">CPM Campaigns</strong>, 'Earn per 1,000 verified views on your X posts — paid in any Solana token the brand selects'],
        [<strong key="c" className="text-zinc-100 font-medium">Escrow Budget</strong>, 'Brand budgets are locked in escrow; brands release payments manually per submission'],
        [<strong key="d" className="text-zinc-100 font-medium">AI + Manual Review</strong>, 'Submissions auto-screened for botting; brands do final checks before releasing payment'],
        [<strong key="f" className="text-zinc-100 font-medium">Referrals</strong>, 'Earn a % of platform fees on every payout your referrals receive'],
      ]} />
    </>
  )
}

function QuickstartPage() {
  return (
    <>
      <PageTitle icon="⚡" title="Quickstart" sub="Go from zero to your first CPM payout in minutes." />
      <div className="my-6">
        <Step num={1} title="Connect a Solana wallet">Visit <a href="https://klout.gg" target="_blank" className="text-accent hover:underline">klout.gg</a> and connect any Solana-supported wallet — Phantom, Backpack, Solflare, and others all work. This is where all your campaign earnings will be sent.</Step>
        <Step num={2} title="Connect your X account">Sign in with X (Twitter). Klout uses your X profile and tweet history to calculate your Klout Score, which determines which campaigns you&apos;re eligible for.</Step>
        <Step num={3} title="Check your Klout Score">Go to <strong className="text-zinc-100">My Klout → My Klout Score</strong>. Your score is computed from your X profile metrics and tweet history. Recalculate at any time for <strong className="text-zinc-100">0.01 SOL</strong> (covers X API costs) to reflect recent growth.</Step>
        <Step num={4} title="Browse and join a campaign">Head to <strong className="text-zinc-100">Campaigns</strong> and find an open campaign you&apos;re eligible for. Read the brief carefully — it will specify a tweet to quote post, accounts to mention, and any content requirements.</Step>
        <Step num={5} title="Submit your post">Post on X then paste your post URL into the submission field. There&apos;s a small <strong className="text-zinc-100">0.0005 SOL verification fee</strong> to submit, which covers the cost of checking your post&apos;s metrics via the X API.</Step>
        <Step num={6} title="Accumulate views and request payment">Once your post meets the minimum engagement thresholds and your approved earnings reach the campaign&apos;s payout threshold, you can request payment. The brand reviews and releases SOL directly to your wallet.</Step>
      </div>
      <Callout type="tip" icon="💡" title="Earn while you sleep">Share your referral link right away. Every time someone you referred gets paid from a campaign, you automatically receive a percentage of the platform fee — no action needed.</Callout>
    </>
  )
}

function ConceptsPage() {
  return (
    <>
      <PageTitle icon="🧠" title="Core Concepts" sub="The building blocks of the Klout platform." />
      <H2 first>Klout Score</H2>
      <P>Your <strong className="text-zinc-100 font-medium">Klout Score</strong> is a numerical measure of your X account&apos;s quality and influence, computed from your profile metrics and historical tweet performance. It determines which campaigns you&apos;re eligible for today, and will drive tiered earning rates in future platform updates.</P>
      <H2>CPM — Cost Per 1,000 Views</H2>
      <P>Campaigns on Klout are priced on a <strong className="text-zinc-100 font-medium">CPM</strong> basis — brands set a rate they&apos;ll pay per 1,000 verified views on creator posts. When you submit a post, your payout is calculated as: <code className="text-accent text-[13px] font-mono bg-surface-hover border border-k-border px-1.5 py-0.5 rounded">(views ÷ 1,000) × CPM rate</code>. Earning is proportional to actual reach — the more genuine views your post gets, the more you earn.</P>
      <H2>Escrow Budget</H2>
      <P>When a brand posts a campaign, their total budget is immediately locked in an <strong className="text-zinc-100 font-medium">on-chain escrow vault</strong>. Creators don&apos;t receive payment until the brand manually releases it, ensuring funds are always available and protected. Unused budget remains in escrow until the campaign ends.</P>
      <H2>Minimum Engagement Thresholds</H2>
      <P>Every campaign sets minimum requirements a post must meet to qualify for payout — for example, a minimum number of views, likes, retweets, or comments. Posts that don&apos;t meet all thresholds are not eligible for payment, regardless of CPM calculation.</P>
      <H2>Minimum Payout Threshold</H2>
      <P>Creators accumulate approved earnings across one or more qualifying posts. Once their total reaches the campaign&apos;s <strong className="text-zinc-100 font-medium">minimum payout threshold</strong>, they can request payment. This prevents micro-payouts and keeps transaction costs manageable.</P>
      <H2>AI + Manual Review</H2>
      <P>All submissions are automatically screened for artificially inflated engagement (bots, paid services, engagement pods). Posts flagged by the AI are marked and not eligible for payment. The brand then does a final manual review of remaining submissions before choosing which to release payment for.</P>
      <H2>Solana Wallet</H2>
      <P>Klout does not hold creator funds. All payments are sent directly to the Solana wallet you connect to your account — Phantom, Backpack, Solflare, and other compatible wallets all work.</P>
    </>
  )
}

function KloutScorePage() {
  return (
    <>
      <PageTitle icon="⚡" title="My Klout Score" sub="Your X account quality score — the gateway to campaigns and future earning tiers on Klout." />
      <H2 first>What is the Klout Score?</H2>
      <P>The Klout Score is a numerical assessment of your X (Twitter) account&apos;s quality and influence. It&apos;s computed from your profile metrics and the historical performance of your tweets to produce a single number that reflects the real impact your voice has on X.</P>
      <P>Your score is the central mechanic on Klout — it gates which campaigns you can join today, and as the platform evolves, it will directly determine how much you earn per campaign through tiered earning rates.</P>

      <InfoCard icon="⚡" title="Example Score Card">
        <div className="flex items-center gap-3.5 mb-3">
          <div className="text-5xl font-extrabold text-accent leading-none">28</div>
          <div>
            <div className="text-[13px] text-zinc-400">NPC Energy</div>
            <div className="text-[12px] text-zinc-500 font-mono mt-0.5">≡+ ENHANCED</div>
          </div>
        </div>
        <div className="text-[13px] text-zinc-500 italic mb-4">&quot;I can finesse free shipping on a DM deal&quot;</div>
        <div className="flex gap-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium border border-k-border text-zinc-400">𝕏 Share on X</span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-accent text-black">Recalculate — 0.01 SOL</span>
        </div>
      </InfoCard>

      <H2>What Determines Your Score?</H2>
      <P>Your score is computed from data fetched via the X API and covers:</P>
      <Ul items={[
        'Follower count and quality of your follower network',
        'Engagement rate on recent and historical tweets (likes, reposts, replies)',
        'Tweet frequency and posting consistency',
        'Profile completeness and account age',
        'Amplification patterns — how often your content is shared further',
      ]} />

      <H2>What Your Score Unlocks</H2>
      <Table heads={['Now', 'Coming soon']} rows={[
        ['Campaign eligibility — score gates which campaigns you can join', 'Tiered earning rates — higher scores will earn more per campaign'],
        ['CPM multiplier — your score determines your earning rate', 'Premium brand deals exclusively available to top-scored creators'],
      ]} />

      <H2>Recalculating Your Score</H2>
      <P>Your score is calculated when you first join. Recalculate at any time for <strong className="text-zinc-100 font-medium">0.01 SOL</strong> — this covers the cost of fetching fresh data from the X API. Recalculation is instant and useful after follower growth, a viral tweet, or a stretch of unusually high engagement.</P>

      <H2>Sharing Your Score</H2>
      <P>Hit <strong className="text-zinc-100 font-medium">Share on X</strong> from your score card. The image is auto-copied to your clipboard. Sharing your score is a natural way to drive referral sign-ups: followers curious about their own score click your referral link, earning you passive SOL income every time they get paid.</P>

      <Callout type="info" icon="ℹ️" title="Score labels">Every score has a descriptive label (e.g. &quot;NPC Energy&quot;, &quot;Enhanced&quot;) giving a human-readable sense of your tier. Higher labels signal stronger accounts to brands and unlock more campaign access.</Callout>
    </>
  )
}

function BrowseCampaignsPage() {
  return (
    <>
      <PageTitle icon="📋" title="Browsing Campaigns" sub="Find campaigns that match your Klout Score and start earning SOL." />
      <H2 first>The Campaign Feed</H2>
      <P>Click <strong className="text-zinc-100 font-medium">Campaigns</strong> in the top navigation to see all <Badge color="green">Open</Badge> campaigns. Each campaign card shows the key details you need to decide whether to participate.</P>
      <H2>What&apos;s on a Campaign Card</H2>
      <Table heads={['Field', 'What it means']} rows={[
        [<strong key="a" className="text-zinc-100 font-medium">Title</strong>, 'Campaign name and short punchy headline from the brand'],
        [<strong key="b" className="text-zinc-100 font-medium">Campaign image</strong>, 'Visual set by the brand — gives context for the campaign vibe'],
        [<strong key="c" className="text-zinc-100 font-medium">CPM rate</strong>, "Tokens you earn per 1,000 views on your qualifying post (in the campaign's chosen token)"],
        [<strong key="d" className="text-zinc-100 font-medium">Budget remaining</strong>, 'How much of the escrow budget is still available for payouts'],
        [<strong key="e" className="text-zinc-100 font-medium">Min. engagement</strong>, 'Minimum views, likes, retweets, and comments your post must hit to qualify'],
        [<strong key="f" className="text-zinc-100 font-medium">Token</strong>, 'Payout currency — SOL, USDC, or a custom SPL token'],
      ]} />
      <Callout type="warning" icon="⚠️" title="Watch the budget bar">Campaigns with low remaining budget may not be able to pay out even if your post qualifies. Check budget remaining before submitting, especially on older campaigns.</Callout>
    </>
  )
}

function JoinCampaignPage({ go }: { go: (id: string) => void }) {
  return (
    <>
      <PageTitle icon="🚀" title="Joining a Campaign" sub="How to post, submit, and earn from a Klout campaign." />
      <H2 first>Reading the Campaign Page</H2>
      <P>When you open a campaign you&apos;ll see:</P>
      <Ul items={[
        <span key="a">The specific <strong className="text-zinc-100 font-medium">tweet or post to quote post</strong> (the campaign&apos;s seed post on X)</span>,
        <span key="b">Accounts you <strong className="text-zinc-100 font-medium">must mention or follow</strong> in your post</span>,
        <span key="c">Campaign <strong className="text-zinc-100 font-medium">guidelines — Do&apos;s and Don&apos;ts</strong> set by the brand</span>,
        'All CPM rates, minimums, thresholds, and budget caps at a glance',
      ]} />
      <Callout type="danger" icon="🚫" title="Follow the brief exactly">Posts that don&apos;t follow the campaign guidelines — missing required mentions, wrong format, off-brand content — will be rejected by the brand during manual review.</Callout>

      <H2>Submitting Your Post</H2>
      <P>After posting on X, paste your post URL into the <strong className="text-zinc-100 font-medium">Submit Your Post</strong> field and click submit. There is a small <strong className="text-zinc-100 font-medium">0.0005 SOL verification fee</strong> per submission, charged at the time of submission. This fee covers querying the X API to read your post&apos;s real-time metrics.</P>
      <Callout type="danger" icon="⏳" title="Wait before you submit — your payout is locked at the moment of submission">Klout reads your post&apos;s metrics at the instant you submit. If your post has 100 views but the campaign requires 500, it will be rejected — even if it reaches 500 views an hour later. <strong className="text-zinc-100 font-medium">Only submit once your views have had time to accumulate and growth has slowed.</strong> There is no way to re-evaluate a post after submission.</Callout>

      <H2>After Submission</H2>
      <P>Once submitted, Klout reads your post metrics. If your post meets all the campaign&apos;s minimum engagement thresholds, it&apos;s shown as <Badge color="green">APPROVED</Badge> and your payout accumulates in the <strong className="text-zinc-100 font-medium">Your Payout</strong> panel. If it doesn&apos;t meet thresholds, it&apos;s marked as <Badge color="red">REJECTED</Badge>.</P>
      <P>Approved submissions still require the brand to manually release payment — see <button onClick={() => go('cpm-payouts')} className="text-accent hover:underline">CPM &amp; Payouts</button> for how requesting payment works.</P>
    </>
  )
}

function CpmPayoutsPage() {
  return (
    <>
      <PageTitle icon="💸" title="CPM & Payouts" sub="How your earnings are calculated and how to get paid." />
      <H2 first>How CPM Works</H2>
      <P>CPM stands for <strong className="text-zinc-100 font-medium">Cost Per Mille</strong> — the amount a brand pays per 1,000 verified views. Your post&apos;s payout is calculated as:</P>
      <InfoCard icon="💸" title="Payout Formula">
        <div className="text-center py-2">
          <div className="font-mono text-[15px] text-accent mb-2">Payout = (Views ÷ 1,000) × CPM Rate</div>
          <div className="text-[13px] text-zinc-500">Example: 8,000 views × 0.03 SOL CPM = <strong className="text-zinc-100">0.24 SOL</strong></div>
        </div>
      </InfoCard>

      <H2>Minimum Engagement Thresholds</H2>
      <P>Every campaign sets minimum requirements a post must meet across all tracked metrics before any payout is calculated. A post that misses even one threshold earns nothing, regardless of view count.</P>
      <Table heads={['Metric', 'Description', 'Example minimum']} rows={[
        [<strong key="a" className="text-zinc-100 font-medium">Views</strong>, 'Total impressions on the post', '500'],
        [<strong key="b" className="text-zinc-100 font-medium">Likes</strong>, 'Heart reactions', '2'],
        [<strong key="c" className="text-zinc-100 font-medium">Retweets</strong>, 'Reposts and quote posts', '2'],
        [<strong key="d" className="text-zinc-100 font-medium">Comments</strong>, 'Replies to the post', '2'],
      ]} />

      <H2>Payouts Are Locked at the Point of Submission</H2>
      <P>This is the most important mechanic to understand as a creator. When you submit your post, Klout reads your metrics <strong className="text-zinc-100 font-medium">at that exact moment</strong> and calculates your payout from those numbers. Your payout cannot be updated later — if your post gains more views after you submit, you do not earn more. If it doesn&apos;t yet meet thresholds, it will be rejected.</P>
      <Callout type="warning" icon="⏳" title="Only submit once views have peaked">Give your post time to accumulate views organically before submitting. A good rule of thumb: wait until engagement has slowed to a trickle — typically several hours to a day after posting for most accounts. Submitting too early locks in a lower view count and a smaller payout.</Callout>

      <H2>Budget Caps</H2>
      <P>Campaigns set caps to prevent any single creator or post from consuming a disproportionate share of the budget:</P>
      <Ul items={[
        <span key="a"><strong className="text-zinc-100 font-medium">Max per user (%)</strong> — the most one account can earn across all their posts, as a % of total campaign budget.</span>,
        <span key="b"><strong className="text-zinc-100 font-medium">Max per post (%)</strong> — the maximum a single post can earn, as a % of total campaign budget.</span>,
      ]} />
      <P>For example, with a 1 SOL budget, a 10% per-user cap means any single creator can earn at most 0.1 SOL from that campaign regardless of view count.</P>

      <H2>Minimum Payout Threshold</H2>
      <P>Creators accumulate approved earnings across their qualifying posts. Only once the total reaches the campaign&apos;s <strong className="text-zinc-100 font-medium">minimum payout threshold</strong> (e.g. 0.01 SOL) can they request payment. This avoids micro-transactions and keeps on-chain fees practical.</P>

      <H2>Requesting Payment</H2>
      <P>When your approved (unpaid) earnings reach the minimum threshold, a <strong className="text-zinc-100 font-medium">Request Payment</strong> button appears in the <em>Your Payout</em> panel on the campaign page. Clicking it notifies the brand, who then manually reviews your submission and releases the SOL from escrow to your connected wallet.</P>
      <Callout type="tip" icon="💡" title="Multiple posts, one payout">If a campaign allows multiple submissions per user, all your approved post earnings accumulate together. You request one payment once your combined total hits the threshold — not separately per post.</Callout>

      <H2>Payout Tokens</H2>
      <P>Brands choose which token to denominate their campaign in. All payouts for that campaign use the selected token:</P>
      <Ul items={[
        <span key="a"><strong className="text-zinc-100 font-medium">SOL</strong> — native Solana token (most common)</span>,
        <span key="b"><strong className="text-zinc-100 font-medium">USDC</strong> — USD-pegged stablecoin on Solana</span>,
        <span key="c"><strong className="text-zinc-100 font-medium">Custom SPL</strong> — any Solana SPL token (used by projects promoting their own token)</span>,
      ]} />
    </>
  )
}

function WalletPage() {
  return (
    <>
      <PageTitle icon="👛" title="Wallet & Payments" sub="Klout pays you directly — no intermediary, no internal balance to manage." />
      <H2 first>Connecting Your Wallet</H2>
      <P>Klout supports any <strong className="text-zinc-100 font-medium">Solana-compatible wallet</strong>. Connect yours when you sign up, or update it from <strong className="text-zinc-100 font-medium">My Klout → Settings</strong>. Popular options:</P>
      <Ul items={[
        <span key="a"><strong className="text-zinc-100 font-medium">Phantom</strong> — the most widely used Solana wallet</span>,
        <span key="b"><strong className="text-zinc-100 font-medium">Backpack</strong> — popular in the Solana NFT and crypto community</span>,
        <span key="c"><strong className="text-zinc-100 font-medium">Solflare</strong> — browser and mobile wallet</span>,
        'Any other Solana-compatible wallet',
      ]} />
      <Callout type="info" icon="ℹ️" title="Klout doesn't hold your funds">There is no internal Klout balance. Campaign payments come directly from the brand&apos;s escrow vault to your wallet address the moment the brand releases them.</Callout>

      <H2>The Payment Flow</H2>
      <Step num={1} title="Post on X and submit your link">Pay the 0.0005 SOL verification fee. Klout reads your post metrics via the X API.</Step>
      <Step num={2} title="AI screens for artificial engagement">Posts flagged as botted or using paid services are automatically rejected. Clean posts move to the brand&apos;s review queue.</Step>
      <Step num={3} title="Your payout accumulates">Approved posts add to your <em>Approved (unpaid)</em> balance. Once you hit the min payout threshold, request payment.</Step>
      <Step num={4} title="Brand releases payment from escrow">The brand reviews your request, checks for brand adherence, and releases the SOL from the campaign&apos;s escrow vault.</Step>
      <Step num={5} title="SOL lands in your wallet">Funds are sent directly to your connected Solana wallet. No withdrawal step required.</Step>
    </>
  )
}

function LaunchPage() {
  return (
    <>
      <PageTitle icon="📣" title="Launching a Campaign" sub="Create a CPM campaign, fund an escrow vault, and reach vetted X creators at scale." />
      <Step num={1} title="Click + Post Campaign">From the top navigation, click <strong className="text-zinc-100 font-medium">+ Post Campaign</strong> to open the campaign builder.</Step>
      <Step num={2} title="Fill in the campaign details">Set your title, card heading, description, and upload a campaign image. Add your guidelines — what creators should and shouldn&apos;t do — and optionally a collateral link for brand assets.</Step>
      <Step num={3} title="Choose your token and set your budget">Select SOL, USDC, or a custom SPL token. Enter your total campaign budget — this amount is locked in escrow when you launch. Set your CPM rate (e.g. 0.03 SOL per 1,000 views).</Step>
      <Step num={4} title="Configure thresholds and caps">Set minimum engagement thresholds (views, likes, retweets, comments), a minimum payout threshold for creators, and budget caps per user and per post.</Step>
      <Step num={5} title="Launch">Review all settings and click <strong className="text-zinc-100 font-medium">Launch Campaign</strong>. Your budget is moved to escrow and your campaign goes live immediately, visible to all eligible creators.</Step>
      <Callout type="info" icon="ℹ️" title="You can edit after launch">Campaign creators can update copy, swap the campaign image, extend the campaign duration, and top up the escrow budget even after a campaign is live.</Callout>
    </>
  )
}

function CampaignFieldsPage() {
  return (
    <>
      <PageTitle icon="📝" title="Campaign Fields" sub="A full reference for every field in the campaign creation form." />
      <div className="rounded-xl border border-k-border bg-surface p-6 my-6 space-y-5">
        <MockField label="Title *" value="What do you need done?" hint="The campaign's name — shown in the campaign feed and at the top of the campaign page." />
        <MockField label="Card Heading" value="Short punchy headline for the campaign card" hint="Optional. Shown on the campaign card in the feed instead of the description. Max 120 characters." />
        <MockField label="Campaign Details *" value="Describe the campaign in detail..." hint="Full brief for creators. Include what to post, the seed tweet to quote, accounts to mention, and any content requirements." tall />
        <MockField label="Campaign Image" value="📷 Upload campaign image" hint="Optional. Shown on the campaign card and page. Recommended: 16:9 or wider aspect ratio." center />

        <div>
          <div className="text-[12px] text-zinc-500 font-mono tracking-wide mb-1.5">Bounty Token *</div>
          <div className="flex gap-2 mb-1.5">
            <span className="px-4 py-1.5 rounded-md text-[13px] font-medium bg-accent text-black border border-accent">SOL</span>
            <span className="px-4 py-1.5 rounded-md text-[13px] font-medium border border-k-border text-zinc-500 bg-surface-hover">USDC</span>
            <span className="px-4 py-1.5 rounded-md text-[13px] font-medium border border-k-border text-zinc-500 bg-surface-hover">Custom SPL</span>
          </div>
          <div className="text-[11.5px] text-zinc-500 mt-1">Choose any Solana token for your campaign — SOL, USDC, or any custom SPL token. All payouts, CPM rates, and platform fees are denominated in the token you select.</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MockField label="Budget *" value="1" hint="Total campaign budget. Locked in an escrow vault when you launch." hasValue />
          <MockField label="CPM — Cost per 1,000 views *" value="0.01" hint="How much you pay per 1,000 views on a qualifying promoted post." hasValue />
        </div>

        <div>
          <div className="text-[12px] text-zinc-500 font-mono tracking-wide mb-1.5">Minimum Engagement Thresholds</div>
          <div className="text-[11.5px] text-zinc-500 mb-2.5">Posts must meet all thresholds to qualify for payout. Set any to 0 to skip that check.</div>
          <div className="grid grid-cols-2 gap-3">
            <MockField label="Views" value="100" hasValue mini />
            <MockField label="Likes" value="0" hasValue mini />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2.5">
            <MockField label="Retweets" value="0" hasValue mini />
            <MockField label="Comments" value="0" hasValue mini />
          </div>
        </div>

        <MockField label="Minimum Payout Threshold — optional" value="0 (no minimum)" hint="Creators must accumulate at least this much in approved payouts before they can request payment." hasValue />

        <div>
          <div className="text-[12px] text-zinc-500 font-mono tracking-wide mb-1.5">Budget Caps</div>
          <div className="text-[11.5px] text-zinc-500 mb-2.5">Limit how much of the total budget a single user or post can consume.</div>
          <div className="grid grid-cols-2 gap-3">
            <MockField label="Max per user (%)" value="10" hint="Max % of budget one user can earn." hasValue mini />
            <MockField label="Max per post (%)" value="1" hint="Max % of budget one post can earn." hasValue mini />
          </div>
        </div>

        <MockField label="Guidelines — Do's" value="Guideline 1" hint={<span className="text-accent">+ Add guideline</span>} hasValue />
        <MockField label="Guidelines — Don'ts" value="Don't 1" hint={<span className="text-accent">+ Add guideline</span>} hasValue />
        <MockField label="Collateral Link — optional" value="https://drive.google.com/... or https://dropbox.com/..." hint="Link to Google Drive, Dropbox, etc. with images, logos, or other collateral creators can use." />
        <MockField label="Duration (days) — optional" value="e.g. 7" hint="How many days the campaign runs. After this, no new submissions are accepted. Leave empty for no deadline." />
      </div>
    </>
  )
}

function ManagingSubmissionsPage() {
  return (
    <>
      <PageTitle icon="✅" title="Managing Submissions" sub="How to review, approve, and release payment for creator submissions from your campaign admin view." />
      <H2 first>The Campaign Admin View</H2>
      <P>As a campaign creator, your campaign page shows a full admin dashboard with real-time stats and a submissions table. This is your control center for reviewing and paying creators.</P>

      <InfoCard icon="📊" title="Campaign Stats — Real-time overview">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatBox label="Total Budget" value="1.00 SOL" />
          <StatBox label="Remaining" value="0.84 SOL" accent />
          <StatBox label="Total Views" value="40,444" />
          <StatBox label="Submissions" value="11" sub="3 approved, 3 paid, 5 rejected" />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatBox label="CPM (per 1,000 views)" value="0.0250 SOL" />
          <StatBox label="Min views per post" value="500" />
          <StatBox label="Min payout threshold" value="0.0100 SOL" />
        </div>
        <div>
          <div className="flex justify-between text-[12px] text-zinc-500 mb-1">
            <span>Budget used: 15.4%</span><span>CPM: 0.0250 SOL</span>
          </div>
          <div className="h-1.5 bg-surface-hover rounded overflow-hidden"><div className="h-full bg-accent rounded" style={{ width: '15.4%' }} /></div>
        </div>
      </InfoCard>

      <H2>The Submissions Table</H2>
      <P>Below the stats panel you&apos;ll see every submission with the following columns:</P>
      <Table heads={['Column', 'Description']} rows={[
        [<strong key="a" className="text-zinc-100 font-medium">Submitter</strong>, "Creator's X handle"],
        [<strong key="b" className="text-zinc-100 font-medium">Post</strong>, 'Link to the live X post'],
        [<strong key="c" className="text-zinc-100 font-medium">Views</strong>, 'Verified view count at time of submission check'],
        [<strong key="d" className="text-zinc-100 font-medium">Payout</strong>, 'SOL owed based on views × CPM (after caps)'],
        [<strong key="e" className="text-zinc-100 font-medium">Platform Fee (10%)</strong>, "Klout's fee for that submission — deducted from budget alongside the creator payout"],
        [<strong key="f" className="text-zinc-100 font-medium">Status</strong>, 'Current state of the submission — see below'],
        [<strong key="g" className="text-zinc-100 font-medium">Date</strong>, 'When the submission was made'],
        [<strong key="h" className="text-zinc-100 font-medium">Action</strong>, 'Available actions — e.g. Reject, or if awaiting payment request, confirm release'],
      ]} />

      <H2>Submission Statuses</H2>
      <Table heads={['Status', 'Meaning']} rows={[
        [<Badge key="a" color="green">PAID</Badge>, "Payment has been released from escrow to the creator's wallet."],
        [<Badge key="b" color="blue">APPROVED</Badge>, 'Post met all thresholds; creator has been notified they can request payment.'],
        [<Badge key="c" color="red">CREATOR REJECTED</Badge>, 'Submission was flagged and rejected — typically for suspected artificial engagement.'],
        [<Badge key="d" color="gray">REJECTED</Badge>, 'Rejected by you (the brand) during manual review.'],
      ]} />

      <H2>AI Screening</H2>
      <P>Before any submission reaches you for review, Klout&apos;s AI automatically screens for signs of artificially inflated engagement — bots, paid view services, engagement pods, and other manipulation tactics. Posts flagged by the AI are marked <Badge color="red">CREATOR REJECTED</Badge> with a reason and are not eligible for payment.</P>

      <H2>Manual Review</H2>
      <P>For approved submissions that pass AI screening, you do a final check for:</P>
      <Ul items={[
        <span key="a"><strong className="text-zinc-100 font-medium">Brand adherence</strong> — does the post actually follow your Do&apos;s and Don&apos;ts?</span>,
        <span key="b"><strong className="text-zinc-100 font-medium">Content quality</strong> — does it represent your brand appropriately?</span>,
        <span key="c"><strong className="text-zinc-100 font-medium">Any botting the AI may have missed</strong> — unusually high view counts for a small account, suspicious engagement patterns, etc.</span>,
      ]} />
      <P>For posts you&apos;re satisfied with, release payment from the submission table. For posts that fail your review, click <strong className="text-zinc-100 font-medium">Reject</strong> — the submission is marked <Badge color="gray">REJECTED</Badge> and no payment is released.</P>

      <H2>Releasing Payment</H2>
      <P>When a creator has met the minimum payout threshold and requested payment, you&apos;ll see the action to release funds. Clicking release triggers the transfer of the owed SOL (plus 10% platform fee) from the campaign&apos;s escrow vault directly to the creator&apos;s connected Solana wallet.</P>

      <H2>Editing Your Campaign</H2>
      <P>You can modify a live campaign at any time from the admin view:</P>
      <Ul items={[
        <span key="a"><strong className="text-zinc-100 font-medium">Update copy</strong> — change the title, card heading, or campaign description</span>,
        <span key="b"><strong className="text-zinc-100 font-medium">Swap the image</strong> — upload a new campaign image or reposition the existing one</span>,
        <span key="c"><strong className="text-zinc-100 font-medium">Extend duration</strong> — push the campaign&apos;s end date forward to keep it open longer</span>,
        <span key="d"><strong className="text-zinc-100 font-medium">Top up budget</strong> — add more funds to the escrow vault if the budget is running low</span>,
      ]} />
    </>
  )
}

function EscrowPage() {
  return (
    <>
      <PageTitle icon="🔐" title="Escrow & Payments" sub="How campaign budgets are held, protected, and released." />
      <H2 first>What is Escrow?</H2>
      <P>When a brand launches a campaign, the full budget is immediately locked in an <strong className="text-zinc-100 font-medium">on-chain escrow vault</strong>. The funds are held there — not by Klout, not by the brand in a regular wallet — until the brand explicitly releases individual payments to approved creators.</P>

      <H2>How Escrow Works</H2>
      <Step num={1} title="Brand launches campaign">Total budget (e.g. 1 SOL) is transferred from the brand&apos;s wallet into the escrow vault. The campaign goes live.</Step>
      <Step num={2} title="Creators submit posts">Earnings accumulate in approved (unpaid) balances as posts pass engagement thresholds. Budget is reserved but not yet sent.</Step>
      <Step num={3} title="Creator requests payment">Once their approved earnings hit the minimum threshold, the creator requests payment. The brand is notified.</Step>
      <Step num={4} title="Brand releases from escrow">Brand reviews the submission and releases payment. Tokens flow from the escrow vault directly to the creator&apos;s connected wallet — plus the 10% platform fee.</Step>
      <Step num={5} title="Campaign ends">When the campaign closes, any remaining budget in the escrow vault is returned to the brand&apos;s wallet.</Step>

      <H2>Platform Fee</H2>
      <P>Klout charges a <strong className="text-zinc-100 font-medium">10% platform fee</strong> on every creator payout. This is deducted from the campaign escrow budget at the time of payment release — not from the creator&apos;s payout. For example, if a creator earns 0.1 SOL, the brand&apos;s escrow is debited 0.1 SOL (creator) + 0.01 SOL (platform fee) = 0.11 SOL total.</P>
      <Callout type="tip" icon="💡" title="Factor in the platform fee when budgeting">For a 1 SOL budget, effective creator payouts are capped at ~0.91 SOL (with ~0.09 SOL going to platform fees). Plan your budget accordingly so creators can always be paid in full.</Callout>
    </>
  )
}

function ReferralsPage() {
  return (
    <>
      <PageTitle icon="🔗" title="Referral Program" sub="Refer users to Klout and earn a share of the platform fee on every campaign payout they receive — automatically, forever." />
      <H2 first>How It Works</H2>
      <P>Every Klout account has a unique referral link — for example, <code className="text-accent text-[13px] font-mono bg-surface-hover border border-k-border px-1.5 py-0.5 rounded">https://klout.gg/yourusername</code>. When someone signs up through your link and earns from a campaign, you automatically receive a <strong className="text-zinc-100 font-medium">percentage of the 10% platform fee</strong> taken from their payout.</P>

      <H2>Finding Your Referral Link</H2>
      <P>Your link is under <strong className="text-zinc-100 font-medium">Referrals</strong> in the top navigation. Share it in your X bio, posts, DMs — or include it when you share your Klout Score card.</P>
      <Callout type="tip" icon="💡" title="The easiest referral move">Post your Klout Score card to X with your referral link in the tweet. Followers curious about their own score click through, sign up, and start earning — and so do you, passively, on every campaign they complete.</Callout>

      <H2>Program Progress</H2>
      <InfoCard icon="📈" title="Referral Program — Current Epoch">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatBox label="Current Epoch" value="Tier 1" />
          <StatBox label="Your Referrer Fee" value="100%" accent sub="of 10% platform fee" />
          <StatBox label="Remaining in Tier" value="995 slots" />
        </div>
        <div className="flex justify-between text-[12px] text-zinc-500 mb-1.5">
          <span>Tier 1 — 100% referrer fee</span><span>995 slots left</span>
        </div>
        <div className="h-1.5 bg-surface-hover rounded overflow-hidden"><div className="h-full bg-accent rounded" style={{ width: '0.5%' }} /></div>
        <div className="flex justify-between text-[12px] text-zinc-500 mt-1">
          <span>Next: <strong className="text-accent">Tier 2</strong> — referrer fee drops to <strong className="text-accent">90%</strong></span>
          <span>2,000 slots</span>
        </div>
      </InfoCard>

      <H2>Your Referral Stats</H2>
      <P>Track your referral performance from <strong className="text-zinc-100 font-medium">Referrals → Your Referral Stats</strong>:</P>
      <Ul items={[
        <span key="a"><strong className="text-zinc-100 font-medium">Total Referred</strong> — users who signed up via your link</span>,
        <span key="b"><strong className="text-zinc-100 font-medium">Completed</strong> — referrals who completed at least one campaign, triggering a fee payout to you</span>,
        <span key="c"><strong className="text-zinc-100 font-medium">Pending Score</strong> — referral earnings awaiting settlement</span>,
        <span key="d"><strong className="text-zinc-100 font-medium">Total Earned</strong> — cumulative SOL earned from the referral program</span>,
      ]} />
    </>
  )
}

function ReferralTiersPage() {
  return (
    <>
      <PageTitle icon="📈" title="Referral Tiers" sub="Early referrers lock in the highest fee share — which decreases as tiers fill." />
      <H2 first>How Tiers Work</H2>
      <P>The referral program runs in <strong className="text-zinc-100 font-medium">epochs (tiers)</strong>. Each tier has a fixed slot count. Once all slots fill, the program advances to the next tier and the referrer fee drops. Your tier is locked at the moment your referral signs up, not when they earn — so earlier action means permanently better rates.</P>

      <Table heads={['Tier', 'Slots', 'Referrer Fee', 'Effective earnings']} rows={[
        [<span key="a"><Badge color="yellow">Tier 1</Badge> <em className="text-accent text-[11px] ml-1">Current</em></span>, '1,000', <span key="b" className="text-accent font-semibold">100%</span>, "You keep the full 10% platform fee on all your referrals' payouts"],
        [<Badge key="c" color="gray">Tier 2</Badge>, '2,000', '90%', "You keep 9% of your referrals' platform fee"],
        [<Badge key="d" color="gray">Tier 3+</Badge>, 'TBA', 'Decreasing', 'Continues to decrease with each subsequent tier'],
      ]} />

      <Callout type="warning" icon="⚠️" title="Tier 1 is almost gone">Fewer than 1,000 Tier 1 slots remain across 15,000+ users on the platform. The window to lock in a 100% referrer fee is closing fast.</Callout>

      <H2>Earnings Example</H2>
      <Table heads={['Referral earns', 'Platform fee (10%)', 'Your cut — Tier 1 (100%)']} rows={[
        ['0.1 SOL', '0.01 SOL', <span key="a" className="text-accent font-medium">0.01 SOL</span>],
        ['1 SOL', '0.1 SOL', <span key="b" className="text-accent font-medium">0.1 SOL</span>],
        ['10 SOL', '1 SOL', <span key="c" className="text-accent font-medium">1 SOL</span>],
      ]} />
      <p className="text-[13px] text-zinc-500">Referral earnings accumulate across every campaign your referrals complete, indefinitely, as long as they&apos;re active on the platform.</p>
    </>
  )
}

function FaqPage() {
  return (
    <>
      <PageTitle icon="❓" title="Frequently Asked Questions" sub="Common questions from creators and brands." />
      <H2 first>For Creators</H2>

      <H3>How is my payout calculated?</H3>
      <P>Your payout is based on the CPM rate set by the brand: <code className="text-accent text-[13px] font-mono bg-surface-hover border border-k-border px-1.5 py-0.5 rounded">(views ÷ 1,000) × CPM rate</code>. For example, 8,000 views at a 0.03 SOL CPM earns you 0.24 SOL — assuming your post meets all minimum engagement thresholds and stays under budget caps.</P>

      <H3>Why is there a 0.0005 SOL submission fee?</H3>
      <P>The fee covers the cost of querying the X API to verify your post&apos;s real engagement metrics at the moment of submission. It also discourages spam and bot-farm attempts, keeping campaign quality high for everyone.</P>

      <H3>My post didn&apos;t meet the view threshold — can I resubmit after it gets more views?</H3>
      <P>No. Your payout and eligibility are determined at the exact moment of submission — Klout reads your metrics instantly and that snapshot is final. If your post doesn&apos;t meet thresholds yet, wait longer before submitting.</P>

      <H3>My post was rejected with &quot;botting warning&quot; — what does this mean?</H3>
      <P>Klout&apos;s AI detected patterns consistent with artificially inflated engagement on your post. Submissions flagged this way are not eligible for payment. Make sure all your engagement is organic.</P>

      <H3>When can I request payment?</H3>
      <P>Once your total approved (unpaid) earnings across your posts reach the campaign&apos;s minimum payout threshold, a payment request button becomes available on the campaign page.</P>

      <H3>How do I receive payment?</H3>
      <P>After you request payment and the brand approves it, the campaign&apos;s tokens are sent directly from the escrow vault to your connected Solana wallet. There is no internal Klout balance or withdrawal step.</P>

      <H3>What wallet do I need?</H3>
      <P>Any Solana-supported wallet — Phantom, Backpack, Solflare, and others. Connect your wallet from your account settings.</P>

      <hr className="border-t border-k-border my-9" />

      <H2>For Brands</H2>

      <H3>How does escrow work?</H3>
      <P>When you launch a campaign, your full budget is locked in an on-chain escrow vault. Funds sit there until you manually release individual creator payouts. You&apos;re never charged for submissions you reject, and any unused budget at campaign end is returned to your wallet.</P>

      <H3>What&apos;s the 10% platform fee?</H3>
      <P>Klout charges a 10% fee on every creator payout, deducted from the escrow budget at the time of release. If a creator earns 0.1 SOL, your escrow is debited 0.11 SOL total. The platform fee is partially shared with creators&apos; referrers through the referral program.</P>

      <H3>Can I edit my campaign after launch?</H3>
      <P>Yes. You can update the campaign copy, swap the image, extend the duration, and top up the escrow budget at any time from the campaign admin view.</P>

      <H3>Does the AI catch all botting?</H3>
      <P>The AI catches most cases automatically, but it&apos;s not infallible. You always have a final manual review step where you can reject any submissions that look suspicious.</P>

      <H3>What tokens can I use for payouts?</H3>
      <P>SOL (native Solana), USDC (Solana), or any custom SPL token. All CPM rates, payouts, and platform fees are denominated in whichever token you select at campaign creation.</P>
    </>
  )
}

function ChangelogPage() {
  return (
    <>
      <PageTitle icon="📝" title="Changelog" sub="Recent platform updates and improvements." />
      <H2 first>February 2025 — v2.1</H2>
      <Ul items={[
        <span key="a">✅ <strong className="text-zinc-100 font-medium">Referral Program launched</strong> — earn a % of platform fees from your referrals&apos; campaign payouts.</span>,
        <span key="b">✅ <strong className="text-zinc-100 font-medium">Referral Tiers</strong> — Tier 1 grants 100% of the platform fee share; drops as tiers fill.</span>,
        <span key="d">✅ <strong className="text-zinc-100 font-medium">Score card sharing</strong> — one-click share to X with auto-copied image.</span>,
        <span key="e">✅ <strong className="text-zinc-100 font-medium">On-demand recalculation</strong> — refresh your score anytime for 0.01 SOL.</span>,
        <span key="f">✅ <strong className="text-zinc-100 font-medium">Campaign collateral links</strong> — brands can share Drive/Dropbox assets with creators.</span>,
        <span key="g">✅ <strong className="text-zinc-100 font-medium">Custom SPL token support</strong> — campaign budgets and payouts can now use any SPL token.</span>,
      ]} />

      <H2>November 2024 — v2.0</H2>
      <Ul items={[
        <span key="a">✅ <strong className="text-zinc-100 font-medium">CPM-based campaigns</strong> — moved from flat-fee payouts to per-1,000-views pricing.</span>,
        <span key="b">✅ <strong className="text-zinc-100 font-medium">Escrow vault</strong> — campaign budgets locked on-chain; brands release individual payments.</span>,
        <span key="c">✅ <strong className="text-zinc-100 font-medium">AI submission screening</strong> — automatic botting and fake-engagement detection.</span>,
        <span key="d">✅ <strong className="text-zinc-100 font-medium">Klout Score system</strong> — X account quality score introduced as the core eligibility mechanic.</span>,
        <span key="e">✅ <strong className="text-zinc-100 font-medium">Solana wallet integration</strong> — connect any Solana wallet; payouts sent directly on release.</span>,
        <span key="f">✅ <strong className="text-zinc-100 font-medium">Budget caps</strong> — max per user (%) and max per post (%) limits.</span>,
        <span key="g">✅ <strong className="text-zinc-100 font-medium">Minimum engagement thresholds</strong> — views, likes, retweets, comments per post.</span>,
      ]} />

      <H2>August 2024 — v1.0</H2>
      <Ul items={[
        '✅ Initial platform launch — X sign-in, campaign browsing, and basic submission flow.',
        '✅ Campaign creation with fixed SOL payouts.',
        '✅ Basic campaign analytics for brands.',
      ]} />
    </>
  )
}

/* ═══════════════ HELPERS ═══════════════ */

function PageTitle({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-2">{icon} {title}</h1>
      <p className="text-[17px] text-zinc-400 leading-relaxed">{sub}</p>
    </div>
  )
}

function H2({ children, first }: { children: React.ReactNode; first?: boolean }) {
  return <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${first ? 'mt-0' : 'mt-10 pt-3 border-t border-k-border'} mb-3.5`}>{children}</h2>
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[17px] font-semibold text-zinc-100 mt-7 mb-2">{children}</h3>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-zinc-400 leading-relaxed mb-4">{children}</p>
}

function Ul({ items }: { items: React.ReactNode[] }) {
  return <ul className="pl-5 mb-4 text-zinc-400 text-[15px] leading-relaxed space-y-1.5 list-disc">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
}

function Pre({ children, label }: { children: string; label?: string }) {
  return (
    <pre className="relative bg-surface border border-k-border rounded-xl p-5 overflow-x-auto my-5">
      {label && <span className="absolute top-2.5 right-3.5 text-[10px] font-mono text-zinc-500 tracking-wide uppercase">{label}</span>}
      <code className="text-green-300 text-[13px] font-mono leading-relaxed">{children}</code>
    </pre>
  )
}

function Table({ heads, rows }: { heads: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto my-5">
      <table className="w-full text-[13.5px] border-collapse">
        <thead>
          <tr>{heads.map((h, i) => <th key={i} className="text-left px-3.5 py-2.5 font-mono text-[11px] tracking-wide uppercase text-zinc-500 border-b border-k-border">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-surface-hover transition">
              {row.map((cell, ci) => <td key={ci} className="px-3.5 py-3 border-b border-zinc-800/70 text-zinc-400 align-top">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatBox({ label, value, accent, sub }: { label: string; value: string; accent?: boolean; sub?: string }) {
  return (
    <div className="bg-surface-hover rounded-lg p-3.5">
      <div className="text-[11px] text-zinc-500 mb-1.5">{label}</div>
      <div className={`font-bold text-base ${accent ? 'text-accent' : ''}`}>{value}</div>
      {sub && <div className="text-[11px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function MockField({ label, value, hint, hasValue, tall, center, mini }: { label: string; value: string; hint?: React.ReactNode; hasValue?: boolean; tall?: boolean; center?: boolean; mini?: boolean }) {
  return (
    <div>
      {!mini && <div className="text-[12px] text-zinc-500 font-mono tracking-wide mb-1.5">{label}</div>}
      {mini && <div className="text-[12px] text-zinc-500 font-mono tracking-wide mb-1">{label}</div>}
      <div className={`w-full bg-surface-hover border border-k-border rounded-md px-3 py-2 text-[13px] ${hasValue ? 'text-zinc-200' : 'text-zinc-500'} ${tall ? 'h-[70px] pt-2.5' : ''} ${center ? 'text-center py-4' : ''}`}>{value}</div>
      {hint && <div className="text-[11.5px] text-zinc-500 mt-1">{hint}</div>}
    </div>
  )
}

/* ═══════════════ MAIN COMPONENT ═══════════════ */

export default function DocsPage() {
  const [activePage, setActivePage] = useState('intro')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const go = (id: string) => {
    setActivePage(id)
    setSidebarOpen(false)
    window.scrollTo(0, 0)
  }

  const renderPage = () => {
    switch (activePage) {
      case 'intro': return <IntroPage go={go} />
      case 'quickstart': return <QuickstartPage />
      case 'concepts': return <ConceptsPage />
      case 'klout-score': return <KloutScorePage />
      case 'browse-campaigns': return <BrowseCampaignsPage />
      case 'join-campaign': return <JoinCampaignPage go={go} />
      case 'cpm-payouts': return <CpmPayoutsPage />
      case 'wallet': return <WalletPage />
      case 'launch': return <LaunchPage />
      case 'campaign-fields': return <CampaignFieldsPage />
      case 'managing-submissions': return <ManagingSubmissionsPage />
      case 'escrow': return <EscrowPage />
      case 'referrals': return <ReferralsPage />
      case 'referral-tiers': return <ReferralTiersPage />
      case 'faq': return <FaqPage />
      case 'changelog': return <ChangelogPage />
      default: return <IntroPage go={go} />
    }
  }

  return (
    <div className="-mx-4 -my-6 sm:-mx-6 sm:-my-8 lg:-mx-12 flex min-h-[calc(100vh-3.5rem)]">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-5 right-5 z-50 flex lg:hidden h-12 w-12 items-center justify-center rounded-full bg-accent text-black shadow-lg"
      >
        {sidebarOpen ? (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        ) : (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        )}
      </button>

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-14 bottom-0 left-0 z-40 w-[268px] bg-surface border-r border-k-border overflow-y-auto transition-transform lg:translate-x-0 lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-5 py-5 border-b border-k-border flex items-center gap-2.5">
          <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center font-extrabold text-[15px] text-black shrink-0">⚡</div>
          <div>
            <div className="font-bold text-base text-zinc-100">Klout</div>
            <div className="text-zinc-500 text-[12px] -mt-0.5">Documentation</div>
          </div>
        </div>
        <nav className="py-2 pb-6">
          {sections.map((section) => (
            <div key={section.label}>
              <div className="px-5 pt-3.5 pb-1.5 text-[10px] font-mono tracking-widest uppercase text-zinc-500">{section.label}</div>
              {section.items.map((id) => (
                <button
                  key={id}
                  onClick={() => go(id)}
                  className={`flex w-full items-center gap-2 px-5 py-1.5 text-[13.5px] border-l-2 transition cursor-pointer ${
                    activePage === id
                      ? 'text-accent border-accent bg-accent/[.06] font-medium'
                      : 'text-zinc-500 border-transparent hover:text-zinc-200 hover:bg-surface-hover'
                  }`}
                >
                  <span className="text-sm opacity-75">{sectionIcons[id]}</span>
                  {pages[id]}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Breadcrumb bar */}
        <div className="sticky top-14 z-30 bg-background/90 backdrop-blur-md border-b border-k-border flex items-center justify-between px-6 sm:px-10 h-[52px]">
          <div className="text-[13px] text-zinc-500 flex items-center gap-1.5">
            Klout Docs <span className="text-zinc-600">›</span> <span className="text-zinc-200">{pages[activePage]}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/tasks" className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium border border-k-border text-zinc-400 hover:border-k-border-hover hover:text-zinc-200 transition">Browse Campaigns →</Link>
            <Link href="/" className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium bg-accent text-black hover:bg-accent-hover transition">Open Klout ↗</Link>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-[780px] mx-auto px-6 sm:px-10 py-12 pb-20">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
