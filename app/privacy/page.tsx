import type { Metadata } from "next";
import LegalPage, { LEGAL, List, Section } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" intro={`${LEGAL.product} is a customer relationship and listings platform for real estate agencies, provided by ${LEGAL.company}. This policy explains what information the service handles, why, who sees it, and how you can have it deleted.`}>
      <Section title="Who is who">
        <p>
          <b>Agencies</b> are the businesses that sign up to {LEGAL.product}. They decide which leads and listings they store, and they are responsible for the personal information of their own clients and leads. {LEGAL.company} provides the software and processes that information on the agency&apos;s behalf.
        </p>
        <p>
          <b>Users</b> are the agency&apos;s staff (owners, admins, managers and agents) who sign in to the service.
        </p>
      </Section>

      <Section title="Information we handle">
        <List
          items={[
            <>
              <b>Account information:</b> a user&apos;s name, email address, WhatsApp number, role, profile photo, and a password stored only as a one-way hash.
            </>,
            <>
              <b>Agency information:</b> the agency&apos;s name and logo, its property listings, photos, prices, and private owner details that an agent chooses to record.
            </>,
            <>
              <b>Leads:</b> the name, phone number, email address, area of interest and form answers of people who enquire about a property. Leads come from Property Finder, from Facebook and Instagram lead ads, and from leads an agent adds or imports. We also keep the notes, follow-ups, voice notes and files that an agency&apos;s staff add to a lead.
            </>,
            <>
              <b>Facebook connection:</b> when an agency connects a Facebook Page, we store the Page&apos;s ID and name, the Facebook user ID of the person who connected it, and a Page access token. The token is stored encrypted and is used only to receive and read that Page&apos;s lead-form submissions. We never post to a Page and we do not read personal messages or private profile information.
            </>,
            <>
              <b>Technical information:</b> basic logs needed to run and secure the service, such as sign-in sessions and error records.
            </>,
          ]}
        />
      </Section>

      <Section title="How we use it">
        <List
          items={[
            "To provide the service: showing leads and listings to the right people in the right agency, assigning leads to agents, publishing listings to portals the agency chooses, and sending reminders.",
            "To receive leads automatically from the Facebook and Instagram lead ads of Pages that an agency has connected.",
            "To keep the service secure, prevent misuse and fix problems.",
            "We do not sell personal information, and we do not use leads or Facebook data for advertising of our own.",
          ]}
        />
      </Section>

      <Section title="Who can see it">
        <p>Each agency&apos;s data is kept separate from every other agency&apos;s. Within an agency, agents see the leads assigned to them, and owners, admins and managers see the agency&apos;s leads. Private listing details are visible only to the listing&apos;s owner and admins.</p>
        <p>We use these service providers to run the service: a hosting and database provider for storage, a web hosting provider for the application, Meta (Facebook and Instagram) for lead ads, Property Finder and other listing portals when an agency chooses to use them, and an AI text provider only if an agency turns on its AI writing feature. They process data only to provide their part of the service.</p>
      </Section>

      <Section title="Facebook and Instagram data">
        <p>Connecting a Facebook Page asks the person to allow access to their Pages and to the leads submitted through those Pages&apos; lead forms. We use that access only to fetch each new lead and show it to the agency that connected the Page. An agency can switch a Page off or remove it in Settings at any time, which stops new leads from arriving and removes our access token for it.</p>
        <p>
          You can also remove the app from your Facebook account under Settings &amp; privacy → Settings → Business integrations. When you do, the Pages you connected stop sending leads. If you ask Facebook to delete the data an app holds about you, we delete the connection details described above. See the{" "}
          <a href="/data-deletion" className="underline">
            data deletion page
          </a>
          .
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>We keep an agency&apos;s data while its account is active. Agencies can delete leads and listings themselves. When an agency closes its account, or asks us to, we delete its data, except where we must keep something to meet a legal duty.</p>
      </Section>

      <Section title="Security">
        <p>Data is transmitted over encrypted connections. Passwords are stored as hashes, and Facebook access tokens are stored encrypted. Access is limited by role. No system is perfectly secure, so please use a strong password and tell us promptly if you think an account has been misused.</p>
      </Section>

      <Section title="Your rights and requests">
        <p>
          If you are a lead whose details an agency holds, please contact that agency first. You can also email us at <a href={`mailto:${LEGAL.email}`} className="underline">{LEGAL.email}</a> to ask to see, correct or delete personal information, or to ask a question about this policy, and we will help you reach the right agency or act on the request.
        </p>
      </Section>

      <Section title="Children">
        <p>The service is for businesses and is not directed at children. We do not knowingly collect information from anyone under 18.</p>
      </Section>

      <Section title="Changes">
        <p>We may update this policy as the service changes. The date at the top shows when it was last updated, and we will make significant changes clear in the service.</p>
      </Section>
    </LegalPage>
  );
}
