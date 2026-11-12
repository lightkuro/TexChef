import { Contact, Ext, H2, LegalLayout, Operator, P, UL } from './LegalPage';
import { LEGAL } from './config';

export function PrivacyPage() {
  const app = LEGAL.appName;
  return (
    <LegalLayout title="Privacy Policy">
      <P>
        This policy explains what happens to information when you use {app} at <Ext href={LEGAL.site}>{LEGAL.site.replace('https://', '')}</Ext>.
        “We” and “us” mean <Operator />.
      </P>

      <H2>In short</H2>
      <UL>
        <li>{app} runs in your web browser. We do not operate a server that receives, stores or reads your documents.</li>
        <li>We do not use analytics, advertising, tracking cookies or profiling, and we do not sell or share personal information.</li>
        <li>If you connect Google Drive, your files go directly between your browser and your own Google Drive. They are never sent to us.</li>
      </UL>

      <H2>Information stored on your device</H2>
      <P>
        Your documents, their version history, compiled PDFs, settings and a cached copy of the TeX typesetting engine are stored in your
        browser's local storage (IndexedDB, localStorage and sessionStorage). This information stays on your device. You can delete it at any
        time in Settings → Local data → Erase local data, or by clearing this site's data in your browser. Browsers may also delete it, for
        example in private windows or when the device runs out of space.
      </P>

      <H2>Google sign-in and Google Drive (optional)</H2>
      <P>If you choose to connect Google Drive:</P>
      <UL>
        <li>
          You sign in with Google in a window provided by Google. {app} receives a temporary access token, which is kept only in your browser
          tab and expires after about one hour. {app} does not receive your Google password.
        </li>
        <li>
          {app} requests only the <code>drive.file</code> permission. This lets it see and change only the files it creates in your Drive and
          files you explicitly choose with the Google file picker. It cannot see any other files in your Drive.
        </li>
        <li>
          {app} uses this access only to provide the sync feature you see in the app: it creates a “TexChef” folder in your Drive, saves copies
          of your documents, their version history and PDFs there, reads them back to keep your devices in sync, removes outdated history
          files it created, and opens files you pick for import.
        </li>
        <li>
          Only if you turn on the experimental <b>AI agents</b> setting, {app} also keeps a “TexChef/Agents(optional_AI)” folder with a
          read-me listing your documents, and reads the replies you pick or paste there so you can review them. {app} never sends your
          documents to an AI service; an AI assistant sees them only if you connect it to your Google Drive yourself.
        </li>
        <li>
          {app} reads your Google account's name, email address and profile photo only to show which account is connected. They are displayed
          in the app and are not stored on any server or shared.
        </li>
      </UL>
      <P>
        {app}'s use and transfer of information received from Google APIs will adhere to the{' '}
        <Ext href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</Ext>, including the
        Limited Use requirements. In particular, Google user data is used only to provide the features described above. It is not
        transferred to us or to anyone else, not used for advertising, not sold, not used to train artificial-intelligence or machine-learning
        models, and not read by any person.
      </P>
      <P>
        You can disconnect Google Drive at any time from the app (sync menu → Disconnect) and revoke {app}'s access in your{' '}
        <Ext href="https://myaccount.google.com/permissions">Google Account permissions</Ext>. Files already saved in your Drive stay there until
        you delete them.
      </P>

      <H2>Hosting and third-party services</H2>
      <UL>
        <li>
          The site is delivered by <Ext href="https://www.cloudflare.com/privacypolicy/">Cloudflare</Ext>. Like any web host, Cloudflare
          processes technical information needed to deliver and protect the site, such as IP addresses, browser type and the pages requested.
          We may see aggregated, non-identifying traffic statistics that Cloudflare provides; we do not use them to identify or track you.
        </li>
        <li>
          When you connect Google Drive or import from Drive, your browser loads Google's sign-in and file-picker code directly from Google,
          under <Ext href="https://policies.google.com/privacy">Google's Privacy Policy</Ext>.
        </li>
      </UL>

      <H2>Children</H2>
      <P>
        {app} is not directed to children under 13, or under the minimum age for consent to online services in your country (16 in some
        countries). We do not knowingly collect information from children.
      </P>

      <H2>Your choices and rights</H2>
      <P>
        Because we do not hold your documents or personal information, you control your data directly: you can export, delete or disconnect
        it at any time as described above. If you have a question or request about privacy, contact us at <Contact />.
      </P>

      <H2>Security</H2>
      <P>
        The site is served over HTTPS and your data stays in your browser and your own Google account. Keep your device and Google account
        secure. No method of storage or transmission is completely secure, and we cannot guarantee absolute security.
      </P>

      <H2>Changes to this policy</H2>
      <P>
        We may update this policy. The effective date at the top shows when it last changed. If you keep using {app} after a change, the
        updated policy applies.
      </P>

      <H2>Contact</H2>
      <P>
        Questions about this policy: <Contact />.
      </P>
    </LegalLayout>
  );
}
