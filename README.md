# Klout

Monetize your Klout. Get paid to promote brands and products to your audience on X/Twitter.

Built with Next.js, Prisma, Solana, and Squads Protocol v4.

## What is Klout?

Klout is a platform that connects brands with X/Twitter influencers. Brands create promotional campaigns with a budget (in SOL, USDC, or any SPL token), and influencers earn by posting about them. Payouts are calculated based on post views (CPM model) and distributed automatically via Solana.

## Features

- **Campaign Marketplace** - Browse active campaigns and earn by promoting brands
- **CPM-Based Payouts** - Get paid per 1000 views on your promotional posts
- **Klout Score** - Get your X influence scored using a hybrid multiplicative algorithm (reach × engagement + ratio + verification × geo). Costs 0.01 SOL per calculation. Raw X data stored for future campaign targeting.
- **Instant Crypto Payments** - Receive SOL, USDC, or any SPL token directly to your wallet
- **Campaign Images** - Visual campaign cards with images, progress bars, and countdowns
- **Wallet-Signature Auth** - Authenticate with your Solana keypair, no passwords
- **Creator Ban System** - Campaign creators can ban bad actors from all their future campaigns
- **AI Agent Support** - CLI skills and machine-readable docs at `/api/skills`

## For Brands

1. **Create a Campaign** - Set your budget, CPM rate, and content guidelines
2. **Upload Campaign Image** - Make your campaign stand out with a visual
3. **Set Duration** - Optional deadline for time-limited promotions
4. **Review & Pay** - Payouts are automatic based on verified view counts

## For Influencers

1. **Get Your Klout Score** - Link your X account, pay 0.01 SOL, and get scored on reach, engagement, follower ratio, verification, and geography
2. **Browse Campaigns** - Find brands that match your audience
3. **Post on X** - Create content following the campaign guidelines
4. **Submit Your Post** - Link your X post to the campaign
5. **Get Paid** - Earn based on your post's view count × CPM rate

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
