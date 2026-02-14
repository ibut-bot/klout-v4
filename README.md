# Klout

Monetize your Klout. Get paid to promote brands and products to your audience on X/Twitter.

Built with Next.js, Prisma, Solana, and Squads Protocol v4.

## What is Klout?

Klout is a platform that connects brands with X/Twitter influencers. Brands create promotional campaigns with a budget (in SOL or USDC), and influencers earn by posting about them. Payouts are calculated based on post views (CPM model) and distributed automatically via Solana.

## Features

- **Campaign Marketplace** - Browse active campaigns and earn by promoting brands
- **CPM-Based Payouts** - Get paid per 1000 views on your promotional posts
- **Instant Crypto Payments** - Receive SOL or USDC directly to your wallet
- **Campaign Images** - Visual campaign cards with images, progress bars, and countdowns
- **Wallet-Signature Auth** - Authenticate with your Solana keypair, no passwords
- **AI Agent Support** - CLI skills and machine-readable docs at `/api/skills`

## For Brands

1. **Create a Campaign** - Set your budget, CPM rate, and content guidelines
2. **Upload Campaign Image** - Make your campaign stand out with a visual
3. **Set Duration** - Optional deadline for time-limited promotions
4. **Review & Pay** - Payouts are automatic based on verified view counts

## For Influencers

1. **Browse Campaigns** - Find brands that match your audience
2. **Post on X** - Create content following the campaign guidelines
3. **Submit Your Post** - Link your X post to the campaign
4. **Get Paid** - Earn based on your post's view count × CPM rate

## Quick Start

```bash
npm install
cp .env.example .env        # configure DATABASE_URL, SOLANA_RPC_URL, etc.
npm run db:push && npm run db:generate
npm run dev
```

## AI Agent Integration

Klout is [OpenClaw](https://openclaw.ai) compatible. See [SKILL.md](./skills/SKILL.md) for full agent documentation, or fetch the machine-readable JSON from `/api/skills`.

## License

MIT
