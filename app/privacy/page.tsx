'use client'

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <h1 className="text-3xl font-bold text-zinc-100 mb-2">Privacy Policy</h1>
      <p className="text-sm text-zinc-500 mb-8">Last updated: February 26, 2026</p>

      <div className="space-y-8 text-zinc-300 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">1. Introduction</h2>
          <p>
            Klout ("we," "our," or "us") operates the klout.gg platform. This Privacy Policy explains how we collect,
            use, disclose, and safeguard your information when you use our website and services.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">2. Information We Collect</h2>
          <p className="mb-3">We collect information that you provide directly to us, including:</p>
          <ul className="list-disc pl-6 space-y-2 text-zinc-400">
            <li><strong className="text-zinc-300">Wallet address</strong> — your Solana wallet public key, used for authentication and payments.</li>
            <li><strong className="text-zinc-300">Social media accounts</strong> — when you link your X (Twitter) or YouTube account, we store your user/channel ID, username, and access tokens to verify ownership of submitted content.</li>
            <li><strong className="text-zinc-300">Profile information</strong> — optional username and profile picture you choose to set.</li>
            <li><strong className="text-zinc-300">Campaign submissions</strong> — links to social media posts or videos you submit, along with publicly available engagement metrics (views, likes, comments).</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc pl-6 space-y-2 text-zinc-400">
            <li>To provide, maintain, and improve the Klout platform.</li>
            <li>To verify ownership of social media accounts and submitted content.</li>
            <li>To calculate engagement metrics and Klout scores.</li>
            <li>To process payments and payouts via Solana blockchain.</li>
            <li>To detect fraud, bot activity, and enforce platform rules.</li>
            <li>To send notifications about campaign activity and submissions.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">4. Third-Party Services</h2>
          <p className="mb-3">We integrate with the following third-party services:</p>
          <ul className="list-disc pl-6 space-y-2 text-zinc-400">
            <li><strong className="text-zinc-300">X (Twitter) API</strong> — to fetch post metrics and verify account ownership.</li>
            <li><strong className="text-zinc-300">YouTube Data API</strong> — to fetch video metrics and verify channel ownership. Use of YouTube data is subject to <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">Google's Privacy Policy</a>.</li>
            <li><strong className="text-zinc-300">Solana blockchain</strong> — for payment processing. Blockchain transactions are public and permanent.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">5. Data Storage and Security</h2>
          <p>
            We store your data on secure servers. OAuth tokens are stored server-side and never exposed to the client.
            While we implement reasonable security measures, no method of transmission over the Internet is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">6. Data Retention</h2>
          <p>
            We retain your information for as long as your account is active. You can unlink your social media accounts
            at any time through your profile settings. Campaign submission data is retained for the duration of the
            campaign and payout period.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">7. Your Rights</h2>
          <ul className="list-disc pl-6 space-y-2 text-zinc-400">
            <li>Unlink your X or YouTube account at any time from your profile dropdown.</li>
            <li>Request deletion of your account data by contacting us.</li>
            <li>Revoke Klout's access to your Google account at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover underline">Google Account Permissions</a>.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">8. Children's Privacy</h2>
          <p>
            Klout is not intended for users under 18 years of age. We do not knowingly collect personal information
            from children.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify users of significant changes by posting
            the new policy on this page and updating the "Last updated" date.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">10. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at{' '}
            <a href="mailto:getkloutgg@gmail.com" className="text-accent hover:text-accent-hover underline">
              getkloutgg@gmail.com
            </a>.
          </p>
        </section>
      </div>
    </div>
  )
}
