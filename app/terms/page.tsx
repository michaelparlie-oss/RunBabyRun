import Link from "next/link";
import { PageTitle, Panel } from "@/app/_c/ui";

export const metadata = { title: "Terms · RunBabyRun" };

export default function TermsPage() {
  return (
    <>
      <PageTitle title="Terms of use" sub="Plain-language terms. Please read the first section." />
      <div className="space-y-4 text-sm">
        <Panel title="This is not medical advice">
          <ul className="list-disc space-y-1 pl-5">
            <li>RunBabyRun produces general training plans from rules and the information you give it. It is not a medical service and does not diagnose, treat or prevent any condition.</li>
            <li>Running carries risk of injury and, rarely, of serious medical events. You take part at your own risk.</li>
            <li>If you answered yes to any health question, have any medical condition, or are unsure, talk to a doctor before starting.</li>
            <li>Stop and seek medical help for chest pain or pressure, fainting, severe breathlessness, or an irregular heartbeat. See a physiotherapist or doctor for pain that makes you limp, is above 3 out of 10, or is worse the next day.</li>
          </ul>
        </Panel>
        <Panel title="Using the service">
          <ul className="list-disc space-y-1 pl-5">
            <li>You must be 18 or older.</li>
            <li>You need your own Strava account and must follow Strava&apos;s terms. You connect it yourself and can disconnect at any time.</li>
            <li>The service is provided free of charge, as is, with no guarantee of availability, accuracy or results. Plans and scores can be wrong; use your own judgement.</li>
            <li>To the extent the law allows, the operator is not liable for injury, loss or damage arising from use of the service.</li>
            <li>Access may be limited or withdrawn, for example if Strava&apos;s limits on connected athletes or requests are reached.</li>
          </ul>
        </Panel>
        <p className="text-xs text-muted">See also <Link href="/privacy" className="underline">Privacy</Link> and <Link href="/about" className="underline">How plans are built</Link>. RunBabyRun is not affiliated with or endorsed by Strava.</p>
      </div>
    </>
  );
}
