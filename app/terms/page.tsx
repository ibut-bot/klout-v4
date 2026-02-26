'use client'

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <h1 className="text-3xl font-bold text-zinc-100 mb-2">Terms of Service</h1>
      <p className="text-sm text-zinc-500 mb-8">Last updated: February 26, 2026</p>

      <div className="space-y-8 text-zinc-300 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Klout ("the Platform"), you agree to be bound by these Terms of Service. If you do
            not agree to these terms, do not use the Platform.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">2. Description of Service</h2>
          <p>
            Klout is a platform that connects brands with content creators for social media campaigns and competitions.
            Brands create campaigns, creators submit their content (X posts or YouTube videos), and payouts are
            processed based on verified engagement metrics.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">3. Eligibility</h2>
          <ul className="list-disc pl-6 space-y-2 text-zinc-400">
            <li>You must be at least 18 years old to use Klout.</li>
            <li>You must have a valid Solana wallet to participate.</li>
            <li>You must link authentic social media accounts that you own.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">4. Account Linking</h2>
          <p>
            To participate in campaigns, you must link your X (Twitter) and/or YouTube account via OAuth.
            By linking your account, you authorize Klout to access publicly available information including
            your profile details and content engagement metrics. You may unlink your accounts at any time
            from your profile settings.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">5. Campaign Participation</h2>
          <ul className="list-disc pl-6 space-y-2 text-zinc-400">
            <li>You may only submit content that you own and have created.</li>
            <li>Submitting another person's content is strictly prohibited and will result in a ban.</li>
            <li>Artificially inflating engagement metrics (buying views, likes, or using bots) is prohibited.</li>
            <li>Submitted content must comply with the campaign's content guidelines.</li>
            <li>Klout reserves the right to reject submissions that violate these terms.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">6. Payments and Fees</h2>
          <ul className="list-disc pl-6 space-y-2 text-zinc-400">
            <li>All payments on Klout are processed via the Solana blockchain in SOL.</li>
            <li>Campaign creators fund escrow wallets before campaigns go live.</li>
            <li>Payouts to creators are based on verified engagement metrics and the campaign's CPM rate.</li>
            <li>Klout charges platform fees for campaign creation and other services.</li>
            <li>Blockchain transactions are irreversible. Klout is not responsible for transactions sent to incorrect addresses.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">7. Prohibited Conduct</h2>
          <ul className="list-disc pl-6 space-y-2 text-zinc-400">
            <li>Impersonating another person or entity.</li>
            <li>Submitting content you do not own.</li>
            <li>Using bots or automated tools to manipulate engagement.</li>
            <li>Attempting to exploit, hack, or disrupt the Platform.</li>
            <li>Creating multiple accounts to circumvent bans or restrictions.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">8. Content Moderation</h2>
          <p>
            Klout uses automated and manual content moderation to ensure submissions comply with campaign guidelines.
            We reserve the right to reject, remove, or flag content that violates our policies or a campaign's
            specific requirements.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">9. Intellectual Property</h2>
          <p>
            You retain ownership of any content you submit. By submitting content to a campaign, you grant Klout
            a non-exclusive license to display the submission within the Platform for the purpose of campaign
            management and verification.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">10. Disclaimers</h2>
          <ul className="list-disc pl-6 space-y-2 text-zinc-400">
            <li>Klout is provided "as is" without warranties of any kind.</li>
            <li>We do not guarantee uninterrupted or error-free service.</li>
            <li>We are not responsible for the actions of third-party platforms (X, YouTube, Solana).</li>
            <li>Engagement metrics are sourced from third-party APIs and may not always be perfectly accurate.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">11. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Klout shall not be liable for any indirect, incidental, special,
            or consequential damages arising from your use of the Platform, including but not limited to loss of
            funds, data, or profits.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">12. Account Termination</h2>
          <p>
            We reserve the right to suspend or terminate your access to Klout at our discretion, including for
            violations of these Terms. Banned users may have pending payouts forfeited.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">13. Changes to Terms</h2>
          <p>
            We may modify these Terms at any time. Continued use of the Platform after changes constitutes
            acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-zinc-100 mb-3">14. Contact</h2>
          <p>
            For questions about these Terms, contact us at{' '}
            <a href="mailto:getkloutgg@gmail.com" className="text-accent hover:text-accent-hover underline">
              getkloutgg@gmail.com
            </a>.
          </p>
        </section>
      </div>
    </div>
  )
}
