import Link from "next/link";
import { PageTitle, Panel } from "@/app/_c/ui";

export const metadata = { title: "Privacy · RunBabyRun" };

export default function PrivacyPage() {
  const contact = process.env.CONTACT_EMAIL;
  return (
    <>
      <PageTitle title="Privacy" sub="What is stored, why, and how to remove it." />
      <div className="space-y-4 text-sm">
        <Panel title="What RunBabyRun reads from Strava">
          <ul className="list-disc space-y-1 pl-5">
            <li>Your first and last name and Strava athlete number, to identify your account.</li>
            <li>Your running activities (runs, trail runs, treadmill runs): name, date, distance, time, average and maximum heart rate. On first connection it looks back 120 days.</li>
            <li>Laps and second-by-second pace and heart-rate data, only for a run you open that has been matched to a planned session.</li>
          </ul>
          <p className="mt-2">Access is read-only (<code>read</code> and <code>activity:read_all</code>, which includes activities you have set to private). RunBabyRun cannot post, change or delete anything on Strava. Non-running activities are ignored.</p>
        </Panel>
        <Panel title="What is stored">
          <ul className="list-disc space-y-1 pl-5">
            <li>The items above, your questionnaire answers (including the health-check answers and your age if you give it), your plan, and anything you log (pain scores, completed strength sessions, skipped sessions, race results).</li>
            <li>Your Strava access tokens, encrypted. If you use your own Strava API keys, the client secret is stored encrypted as well.</li>
            <li>A sign-in cookie on your device that lasts 30 days. There are no advertising or analytics cookies.</li>
          </ul>
          <p className="mt-2">Data is kept in the site&apos;s storage on Netlify. Other runners cannot see your data. The person operating this site has administrative access to the hosting account and so can technically access stored data.</p>
        </Panel>
        <Panel title="What it is used for">
          <p>Only to build and adjust your training plan and show your progress. It is not sold, not shared with other users, not used for advertising and not used to train AI models.</p>
        </Panel>
        <Panel title="Your choices">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Download:</b> Settings → Download my data.</li>
            <li><b>Delete:</b> Settings → Delete my account. This revokes RunBabyRun&apos;s access at Strava and deletes everything stored about you here.</li>
            <li><b>Disconnect from Strava&apos;s side:</b> Strava → Settings → My Apps → Revoke access. Syncing stops at once; use Delete my account to remove what is already stored.</li>
          </ul>
          {contact && <p className="mt-2">Questions: <a className="underline" href={`mailto:${contact}`}>{contact}</a>.</p>}
        </Panel>
        <p className="text-xs text-muted">RunBabyRun is an independent project and is not affiliated with or endorsed by Strava. <Link href="/terms" className="underline">Terms</Link></p>
      </div>
    </>
  );
}
