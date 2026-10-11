import type { Metadata } from "next";
import LegalPage, { LEGAL, List, Section } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" intro={`These terms apply when you use ${LEGAL.product}, provided by ${LEGAL.company}. By creating an account or using the service you agree to them on behalf of yourself and the agency you represent.`}>
      <Section title="The service">
        <p>{LEGAL.product} lets real estate agencies manage property listings and leads: receiving enquiries from Property Finder and from Facebook and Instagram lead ads, adding and importing leads, assigning them to agents, tracking follow-ups, and publishing listings to portals the agency chooses.</p>
      </Section>

      <Section title="Accounts">
        <List
          items={[
            "You must give accurate information when you sign up and keep your sign-in details secret.",
            "The person who creates an agency account is its owner and is responsible for who else is given access.",
            "You are responsible for what happens under your account. Tell us promptly if you think it has been misused.",
          ]}
        />
      </Section>

      <Section title="Your data and your clients">
        <p>The agency owns the listings, leads and other content it puts into the service. The agency is responsible for having the right to collect and use that information, for telling its clients and leads how it uses their details, and for following the privacy, marketing and messaging laws that apply to it, including rules on contacting people by phone, WhatsApp or email.</p>
        <p>We process that information only to provide the service, as described in the Privacy Policy.</p>
      </Section>

      <Section title="Connecting third-party services">
        <p>When you connect Property Finder, a Facebook Page or another service, you confirm that you are allowed to, and that you will follow that service&apos;s own terms and policies, including Meta&apos;s Platform Terms and lead ads policies. A connected service may change or stop working without notice, and we are not responsible for its availability or rules.</p>
      </Section>

      <Section title="Acceptable use">
        <List
          items={[
            "Do not use the service for anything unlawful, misleading or abusive, or to send unsolicited bulk messages.",
            "Do not try to access another agency's data, interfere with the service, or probe or test its security without our written permission.",
            "Do not upload content you do not have the right to use, or content that is harmful, such as malware.",
          ]}
        />
      </Section>

      <Section title="Availability and changes">
        <p>We work to keep the service running and your data safe, but it is provided &ldquo;as is&rdquo; and we cannot promise it will always be uninterrupted or error free. We may improve, change or remove features, and we will try to give notice of changes that significantly affect you.</p>
      </Section>

      <Section title="Ending your use">
        <p>You can stop using the service at any time and ask us to delete your agency&apos;s data. We may suspend or end access if these terms are broken or to protect the service or other users.</p>
      </Section>

      <Section title="Liability">
        <p>To the extent the law allows, {LEGAL.company} is not liable for indirect or consequential losses, such as lost leads, lost sales or lost profit, or for problems caused by third-party services. Nothing in these terms limits liability that cannot be limited by law.</p>
      </Section>

      <Section title="Changes to these terms">
        <p>We may update these terms. Continuing to use the service after a change means you accept the updated terms. The date at the top shows when they were last updated.</p>
      </Section>
    </LegalPage>
  );
}
