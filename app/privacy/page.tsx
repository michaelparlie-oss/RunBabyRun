import Link from "next/link";
import { PageTitle, Panel } from "@/app/_c/ui";

export const metadata = { title: "Privacy · RunBabyRun" };

export default function PrivacyPage() {
  const contact = process.env.CONTACT_EMAIL;
  return (
    <>
      <PageTitle title="Privacy" sub="What is stored, why, and how to remove it." />
      <div className="space-y-4 text-sm">
        <Panel title="Your account">
          <p>You sign in with an email address and a password. Sign-in is handled by Supabase Auth: your email and a scrambled (hashed) form of your password are stored there, and RunBabyRun never sees or stores the password itself. Your first name and email are also kept with your training data so the app can greet you.</p>
        </Panel>
        <Panel title="What RunBabyRun reads from Strava, if you connect it">
          <ul className="list-disc space-y-1 pl-5">
            <li>Your first and last name and Strava athlete number, to link the connection to your account.</li>
            <li>Your running activities (runs, trail runs, treadmill runs): name, date, distance, time, average and maximum heart rate. On first connection it looks back 120 days.</li>
            <li>Laps and second-by-second pace and heart-rate data, only for a run you open that has been matched to a planned session.</li>
          </ul>
          <p className="mt-2">Access is read-only (<code>read</code> and <code>activity:read_all</code>, which includes activities you have set to private). RunBabyRun cannot post, change or delete anything on Strava. Non-running activities are ignored.</p>
        </Panel>
        <Panel title="What is stored">
          <ul className="list-disc space-y-1 pl-5">
            <li>The items above, any runs you enter by hand, your questionnaire answers (including the health-check answers and your age if you give it), your plan, and anything you log (pain scores, completed strength sessions, skipped sessions, race results).</li>
            <li>Your Strava access tokens, encrypted. If you use your own Strava API keys, the client secret is stored encrypted as well.</li>
            <li>A sign-in cookie on your device that lasts 30 days. There are no advertising or analytics cookies.</li>
          </ul>
          <p className="mt-2">Your data is kept in a database at Supabase (Singapore region), which only this site&apos;s server can read; the site itself is served by Vercel. To update open pages instantly, the site also sends an empty &quot;something changed&quot; signal on a random-looking channel that carries no personal data. Other runners cannot see your data. The person operating this site has administrative access to the hosting and database accounts and so can technically access stored data.</p>
        </Panel>
        <Panel title="What it is used for">
          <p>Only to build and adjust your training plan and show your progress. It is not sold, not shared with other users, not used for advertising and not used to train AI models.</p>
        </Panel>
        <Panel title="Your choices">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Download:</b> Settings, then Download my data.</li>
            <li><b>Delete:</b> Settings, then Delete my account. It asks for your password, then deletes your login and everything stored about you, and revokes RunBabyRun&apos;s access at Strava if it was connected.</li>
            <li><b>Stop using Strava:</b> Settings, then Disconnect Strava. Runs imported from Strava are removed and you carry on by logging runs yourself.</li>
            <li><b>Disconnect from Strava&apos;s side:</b> on Strava, open Settings, My Apps, Revoke access. Syncing stops, and your Strava tokens and stored activities are removed from this site. Your answers, plan and logs stay until you use Delete my account.</li>
          </ul>
          {contact && <p className="mt-2">Questions: <a className="underline" href={`mailto:${contact}`}>{contact}</a>.</p>}
        </Panel>
        <p className="text-xs text-muted">RunBabyRun is an independent project and is not affiliated with or endorsed by Strava. <Link href="/terms" className="underline">Terms</Link></p>
      </div>
    </>
  );
}
