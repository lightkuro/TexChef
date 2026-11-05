import { Link } from 'react-router';
import { Contact, Ext, H2, Jurisdiction, LegalLayout, Operator, P, UL } from './LegalPage';
import { LEGAL } from './config';

export function TermsPage() {
  const app = LEGAL.appName;
  return (
    <LegalLayout title="Terms of Service">
      <P>
        These terms govern your use of {app} at <Ext href={LEGAL.site}>{LEGAL.site.replace('https://', '')}</Ext> (the “Service”), provided by{' '}
        <Operator /> (“we” or “us”). By using the Service you agree to these terms and to the{' '}
        <Link to="/privacy" className="text-accent underline">
          Privacy Policy
        </Link>
        . If you do not agree, do not use the Service.
      </P>

      <H2>1. The Service</H2>
      <P>
        {app} is a free, browser-based LaTeX editor. It runs on your device; your documents are stored in your browser and, if you choose, in
        your own Google Drive. We may change, suspend or discontinue any part of the Service at any time, without notice and without liability.
      </P>

      <H2>2. Your content and backups</H2>
      <UL>
        <li>You keep all rights to the documents and files you create or upload. We do not receive them and claim no rights to them.</li>
        <li>You are solely responsible for your content, including having the rights to use it and its accuracy.</li>
        <li>
          You are responsible for keeping backups. Browser storage can be cleared by you, your browser or your device, and sync can fail. We are
          not responsible for any loss or corruption of data.
        </li>
        <li>
          You are responsible for checking every document you produce, including its content, layout and page count, before you rely on it or
          send it to anyone.
        </li>
      </UL>

      <H2>3. Acceptable use</H2>
      <P>You agree not to:</P>
      <UL>
        <li>use the Service in violation of any law or anyone else's rights;</li>
        <li>attempt to disrupt, overload or gain unauthorized access to the Service or its hosting;</li>
        <li>use the Service to create or distribute malware, or to process content you have no right to use.</li>
      </UL>

      <H2>4. Third-party services</H2>
      <P>
        The Service relies on services we do not control, including Google (sign-in, Drive and file picker) and Cloudflare (hosting). Your use of
        them is governed by their own terms, including the{' '}
        <Ext href="https://policies.google.com/terms">Google Terms of Service</Ext>. We are not responsible for third-party services, their
        availability or their handling of your data.
      </P>

      <H2>5. Open-source software</H2>
      <P>
        The Service includes open-source software that is licensed to you under its own license, and nothing in these terms limits your rights
        under those licenses. This includes the TeX engine{' '}
        <Ext href="https://github.com/TeXlyre/texlyre-busytex">TeXlyre BusyTeX</Ext> (GNU AGPL-3.0, based on{' '}
        <Ext href="https://github.com/busytex/busytex">BusyTeX</Ext>, MIT), <Ext href="https://tug.org/texlive/">TeX Live</Ext> (various free
        licenses, including the GPL and the LaTeX Project Public License), <Ext href="https://mozilla.github.io/pdf.js/">PDF.js</Ext> (Apache
        2.0), and other components under MIT and similar licenses. Their source code is available at the linked project pages.
      </P>

      <H2>6. No warranty</H2>
      <P className="uppercase">
        To the maximum extent permitted by law, the Service is provided “as is” and “as available”, without warranties of any kind, express or
        implied, including warranties of merchantability, fitness for a particular purpose, title, non-infringement, accuracy, availability,
        and that the Service will be error-free, secure or will preserve your data.
      </P>

      <H2>7. Limitation of liability</H2>
      <P>
        To the maximum extent permitted by law, we will not be liable for any indirect, incidental, special, consequential, exemplary or
        punitive damages, or for any loss of data, documents, profits, revenue, employment or business opportunities, or goodwill, arising out
        of or related to the Service or these terms, even if we were advised of the possibility of such damages. To the maximum extent
        permitted by law, our total liability for all claims relating to the Service is limited to the greater of the amount you paid us to use
        the Service in the twelve months before the claim (the Service is free) or ten US dollars (USD 10).
      </P>

      <H2>8. Indemnity</H2>
      <P>
        To the extent permitted by law, you agree to defend, indemnify and hold us harmless from any claims, losses and expenses (including
        reasonable legal fees) arising from your content, your use of the Service, or your violation of these terms or of anyone's rights.
      </P>

      <H2>9. Your statutory rights</H2>
      <P>
        Some jurisdictions do not allow certain warranties to be excluded or liability to be limited. In those jurisdictions, the exclusions
        and limits above apply only to the extent permitted, and nothing in these terms affects rights you have as a consumer that cannot be
        waived by contract.
      </P>

      <H2>10. Ending use</H2>
      <P>
        You may stop using the Service at any time. We may stop providing the Service, or refuse it to anyone who violates these terms, at any
        time. Sections 2, 5 to 9, 11 and 12 survive.
      </P>

      <H2>11. Governing law</H2>
      <P>
        These terms are governed by the laws of <Jurisdiction />, without regard to conflict-of-law rules, and disputes will be resolved in the
        courts located there, except where the law of your country of residence requires otherwise.
      </P>

      <H2>12. General</H2>
      <P>
        These terms and the Privacy Policy are the entire agreement between you and us about the Service. If any provision is found
        unenforceable, the rest remains in effect. Not enforcing a provision is not a waiver. You may not transfer these terms; we may transfer
        them to whoever operates the Service. We may update these terms; the effective date above shows when they last changed, and continuing
        to use the Service after a change means you accept the updated terms.
      </P>

      <H2>Contact</H2>
      <P>
        Questions about these terms: <Contact />.
      </P>
    </LegalLayout>
  );
}
