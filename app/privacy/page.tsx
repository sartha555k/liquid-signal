import type { Metadata } from "next";
import "./privacy.css";

export const metadata: Metadata = {
  title: "Privacy Policy | Liquid Signal",
  description: "How Liquid Signal processes YouTube comments, uses AI services, and stores your reports.",
};

const contents = [
  ["scope", "About this policy"], ["data", "Information we process"],
  ["processing", "How AI processing works"], ["storage", "Storage & retention"],
  ["choices", "Your choices & deletion"], ["security", "Security & permitted use"],
  ["contact", "Contact & updates"],
];

export default function PrivacyPage() {
  return (
    <main className="ls-privacy">
      <div className="privacy-wrap">
        <header className="privacy-topbar">
          <a className="privacy-brand" href="/" aria-label="Liquid Signal home">
            <span className="privacy-mark" aria-hidden="true"><i /><i /><i /></span>Liquid Signal
          </a>
          <a className="privacy-contact-link" href="mailto:beyondthebuildofficial@gmail.com">Contact us ↗</a>
        </header>
        <section className="privacy-hero">
          <span className="privacy-eyebrow">YOUR DATA, EXPLAINED</span>
          <h1>Privacy, without<br />the fine-print maze.</h1>
          <p>Public conversations become audience insights. Here’s what happens to the data along the way.</p>
          <div className="privacy-date">Privacy Policy · Effective and last updated: 2 October 2026</div>
        </section>
        <div className="privacy-summary" aria-label="Privacy at a glance">
          <article><span>01</span><h2>No account required</h2><p>The demo does not ask you to sign in or provide API credentials.</p></article>
          <article><span>02</span><h2>AI processing disclosed</h2><p>Selected video data goes to our backend and the services described below.</p></article>
          <article><span>03</span><h2>Reports stay local</h2><p>Complete extension reports are saved in your browser, not a shared report database.</p></article>
        </div>
        <div className="privacy-layout">
          <nav className="privacy-toc" aria-label="Policy sections">
            <span>ON THIS PAGE</span>
            {contents.map(([id, title]) => <a key={id} href={`#${id}`}>{title}</a>)}
            <a className="privacy-email" href="mailto:beyondthebuildofficial@gmail.com">Privacy questions? ↗</a>
          </nav>
          <div className="privacy-body">
            <section id="scope">
              <h2>01 / About this policy</h2>
              <p>This policy covers the Liquid Signal (d1) Chrome extension, its local report page, and its backend at liquid-signal.onrender.com. Liquid Signal is developed and operated by Sarthak Patel. Its single purpose is to turn public YouTube comments into audience research: suggested questions, opinion classifications, purchase signals, and downloadable reports.</p>
              <p>It is a public demo with no account requirement. It is not a tool for determining objective facts or making eligibility decisions about individuals. This policy describes the current product, not hypothetical future features.</p>
            </section>
            <section id="data">
              <h2>02 / Information we process</h2>
              <ul>
                <li><strong>Active video context:</strong> the extension reads the active tab’s URL and title to detect a YouTube video. It does not record your full browsing history or send unrelated tab URLs to our backend.</li>
                <li><strong>Public YouTube content:</strong> the selected video’s title, description, channel title, tags, and a sample of its public top-level comments. Imported comments include text, public comment IDs, and publication timestamps. We do not deliberately import commenter names, profile pictures, or channel profiles.</li>
                <li><strong>Your research inputs:</strong> the question, answer choices, selected model, sample size, and resulting classifications and summary.</li>
                <li><strong>Local settings:</strong> preferences, a record of your processing consent, suggestion cache, run status, and locally saved reports.</li>
                <li><strong>Operational information:</strong> requests to our hosting infrastructure necessarily expose network information such as an IP address. Hosting and error logs may include request paths, times, status codes, and diagnostic information. We use operational information to deliver, maintain, and troubleshoot the service, not for location profiling.</li>
              </ul>
              <div className="privacy-callout"><strong>Public does not mean anonymous.</strong> Comments and your own free-text questions can contain names or other personal or sensitive information. That text is not automatically redacted before AI processing. Do not submit passwords, API keys, private messages, payment details, health information, or other sensitive personal data.</div>
              <p>The extension does not request Google account access, read private communications, access GPS, collect payment information, or track your mouse movements and keystrokes for analytics. We do not intentionally build personal profiles of commenters.</p>
            </section>
            <section id="processing">
              <h2>03 / How AI processing works</h2>
              <p>In extension version 0.7.3 and later, a disclosure and an explicit “Allow AI processing” button appear before automatic suggestions or other backend requests. Without that permission, video detection remains local and AI processing is paused. After you allow processing, suggestions can load automatically when you switch to a YouTube video while the panel is open. Analysis starts only when you click “Ask this audience.”</p>
              <ol>
                <li><strong>YouTube / Google:</strong> our backend uses the YouTube Data API to retrieve metadata and public comments for the video you select. Suggestions use metadata only; they do not read the comments.</li>
                <li><strong>Render:</strong> our hosted backend receives the video URL, research inputs, and comment text needed to run your request. It coordinates the providers and returns results to your extension.</li>
                <li><strong>Liquid AI or TypeSafe / Jev:</strong> your selected decision provider receives comment text and the classification questions and choices. The current demo uses up to the first 2,000 characters of a long comment for classification; your local report retains the full imported text. Choosing Liquid does not silently send that classification to Jev, or vice versa.</li>
                <li><strong>OpenAI:</strong> video metadata is used to suggest questions. For a completed analysis, OpenAI receives your question, video title, aggregated results, and a limited set of supporting comment excerpts to write the final explanation—not the full imported comment collection. These Responses API calls use <code>store: false</code>; this is not a promise that OpenAI keeps no operational or safety records.</li>
              </ol>
              <p>These service providers process data to supply the requested feature. Their own terms, privacy practices, retention rules, and processing locations apply; we cannot promise immediate deletion or zero retention at third parties. Processing may take place outside your country.</p>
              <div className="privacy-provider-links">
                <a href="https://policies.google.com/privacy" rel="noreferrer" target="_blank">Google ↗</a>
                <a href="https://render.com/privacy" rel="noreferrer" target="_blank">Render ↗</a>
                <a href="https://www.liquid.ai/privacy-policy" rel="noreferrer" target="_blank">Liquid AI ↗</a>
                <a href="https://typesafe.ai/legal/privacy-policy" rel="noreferrer" target="_blank">TypeSafe ↗</a>
                <a href="https://openai.com/policies/privacy-policy/" rel="noreferrer" target="_blank">OpenAI ↗</a>
              </div>
            </section>
            <section id="storage">
              <h2>04 / Storage & retention</h2>
              <ul>
                <li><strong>In your browser:</strong> preferences, consent, and cached question suggestions use Chrome’s local extension storage. Suggestions are reused for up to seven days; the cache keeps up to 20 recent entries. Expired entries are not guaranteed to be deleted immediately.</li>
                <li><strong>Local reports:</strong> full comments, classifications, question, video URL, and summary are saved in the extension’s IndexedDB database. Reports older than 30 days are removed when a new report is saved; there is no continuously running deletion timer.</li>
                <li><strong>Backend classification cache:</strong> to avoid repeating paid analysis, we store a hashed signature derived from the provider, comment, and questions, plus classification results and creation time. Raw comment text is not stored in that cache. Results may contain your answer-choice labels. This is not a guarantee of anonymous data. There is currently no automatic expiry for this cache; it remains until the service’s temporary filesystem resets or the operator clears it.</li>
                <li><strong>Hosting and providers:</strong> operational logs and third-party processing records follow their respective retention rules. Render’s free-tier local filesystem is temporary; restarts or redeployments can remove the backend cache. Complete extension reports are not uploaded to a shared backend report library.</li>
                <li><strong>Downloads:</strong> CSV files and downloaded reports remain wherever you save them. Removing the extension does not delete those files.</li>
              </ul>
            </section>
            <section id="choices">
              <h2>05 / Your choices & deletion</h2>
              <p>You can decline processing by leaving the consent button unclicked, cancel a running analysis, choose the classification provider, and control which video, question, and comment sample you analyse.</p>
              <p>Use “Pause AI processing” in the extension footer to withdraw permission for future requests. This preserves your saved reports and preferences. Data already transmitted cannot be recalled. You can allow processing again later.</p>
              <p>To remove local extension storage and saved reports, uninstall Liquid Signal from that Chrome profile. Delete any exported files separately. Copies in other profiles or backups must be removed separately. If you want to ask about access, correction, or deletion of data held by the operator, email <a href="mailto:beyondthebuildofficial@gmail.com">beyondthebuildofficial@gmail.com</a>. Include enough context to identify the request, but never send API keys or other secrets. Because the demo has no user accounts, we may need request details to locate a record; we cannot directly erase files stored on your device or guarantee deletion of independent provider records.</p>
            </section>
            <section id="security">
              <h2>06 / Security & permitted use</h2>
              <p>The deployed extension communicates with the backend over HTTPS. Provider API keys are kept in private backend environment settings, not in the extension or public repository. No system is perfectly secure; do not use this demo for confidential information.</p>
              <p>We do not sell user data. Transfers are limited to delivering the audience-research features, necessary service operation and security, or legal obligations. We do not use or transfer user data for advertising, unrelated purposes, determining creditworthiness, or lending.</p>
              <p>Our use of information obtained through Google APIs follows the Chrome Web Store User Data Policy, including its Limited Use requirements. Human access to submitted content is limited to what is necessary for support you request, investigating security or operational problems, or meeting legal obligations. We do not routinely read your local reports.</p>
              <p>The extension and this privacy page do not include advertising trackers or third-party analytics scripts. The product is not designed to collect children’s personal information.</p>
            </section>
            <section id="contact" className="privacy-contact-card">
              <span className="privacy-eyebrow">LET’S KEEP IT CLEAR</span>
              <h2>07 / Contact & updates</h2>
              <p>For privacy questions, support, or data requests, contact Sarthak Patel at:</p>
              <a className="privacy-mail-button" href="mailto:beyondthebuildofficial@gmail.com">beyondthebuildofficial@gmail.com ↗</a>
              <p>We will update this page when the product’s data practices change and revise the date above. Material changes to extension processing will be disclosed in the extension before the new processing begins.</p>
            </section>
          </div>
        </div>
        <footer className="privacy-footer"><span>Liquid Signal · Audience research, with context.</span><a href="#">Back to top ↑</a></footer>
      </div>
    </main>
  );
}
