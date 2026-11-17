import Link from "next/link";
import { PageTitle, Panel } from "@/app/_c/ui";

export const metadata = { title: "How plans are built · RunBabyRun" };

const SOURCES: { id: string; cite: string; doi?: string; use: string }[] = [
  { id: "frandsen", cite: "Frandsen JSB, Hulme A, Parner ET, et al. How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study. Br J Sports Med. 2025.", doi: "10.1136/bjsports-2024-109380", use: "The long-run cap. A single run is kept within about 10% of your longest run of the previous 30 days, because larger single-session jumps were associated with a higher rate of overuse injury in this cohort. It is observational evidence, so it shows association, not proof of cause." },
  { id: "nielsen", cite: "Nielsen RØ, Parner ET, Nohr EA, et al. Excessive progression in weekly running distance and risk of running-related injuries: an association which varies according to type of injury. J Orthop Sports Phys Ther. 2014;44(10):739–747.", doi: "10.2519/jospt.2014.5164", use: "Gentle weekly growth for newer runners. Novice runners who raised their weekly distance by more than 30% over two weeks appeared more vulnerable to distance-related injuries than those who progressed by less than 10%." },
  { id: "bosquet", cite: "Bosquet L, Montpetit J, Arvisais D, Mujika I. Effects of tapering on performance: a meta-analysis. Med Sci Sports Exerc. 2007;39(8):1358–1365.", doi: "10.1249/mss.0b013e31806010e0", use: "The taper. The meta-analysis found the largest gains when volume was cut by roughly 41–60% over about two weeks without reducing intensity or how often athletes trained. The studies were in competitive athletes. How the taper is scaled to each race distance here is our judgement." },
  { id: "stoggl", cite: "Stöggl TL, Sperlich B. The training intensity distribution among well-trained and elite endurance athletes. Front Physiol. 2015;6:295.", doi: "10.3389/fphys.2015.00295", use: "Mostly easy running. Endurance athletes typically do the large majority of their training at low intensity. The evidence is from trained athletes; applying it to recreational runners is an extrapolation." },
  { id: "balsalobre", cite: "Balsalobre-Fernández C, Santos-Concejero J, Grivas GV. Effects of strength training on running economy in highly trained runners: a systematic review with meta-analysis of controlled trials. J Strength Cond Res. 2016;30(8):2361–2368.", doi: "10.1519/JSC.0000000000001316", use: "Strength sessions two or three days away from the long run. The trials were in highly trained runners, so the size of the benefit for beginners is uncertain." },
  { id: "lack", cite: "Lack S, Barton C, Sohan O, Crossley K, Morrissey D. Proximal muscle rehabilitation is effective for patellofemoral pain: a systematic review with meta-analysis. Br J Sports Med. 2015;49(21):1365–1376.", doi: "10.1136/bjsports-2015-094723", use: "Extra hip and glute work when you report a sore knee. This is rehabilitation evidence for one condition; the app does not diagnose." },
  { id: "riebe", cite: "Riebe D, Franklin BA, Thompson PD, et al. Updating ACSM's recommendations for exercise preparticipation health screening. Med Sci Sports Exerc. 2015;47(11):2473–2479.", doi: "10.1249/MSS.0000000000000664", use: "The health check before a plan is made. It follows the same logic: known disease, symptoms, and current activity level decide whether to see a doctor first. The questions are written in our own words and are not a validated questionnaire." },
  { id: "tanaka", cite: "Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited. J Am Coll Cardiol. 2001;37(1):153–156.", doi: "10.1016/s0735-1097(00)01054-8", use: "Estimated maximum heart rate (208 − 0.7 × age) when you have not entered one and Strava has no heart-rate data. Individual values can differ by 10 beats or more." },
  { id: "riegel", cite: "Riegel PS. Athletic records and human endurance. Am Sci. 1981;69(3):285–290.", use: "Converting a result at one distance to an equivalent time at another (time × (distance ratio)^1.06). It tends to be optimistic for the marathon at modest weekly distance." },
  { id: "jeukendrup", cite: "Jeukendrup A. A step towards personalized sports nutrition: carbohydrate intake during exercise. Sports Med. 2014;44(Suppl 1):S25–S33.", doi: "10.1007/s40279-014-0148-z", use: "The reminder to practise taking carbohydrate on long runs before a half marathon or marathon." },
];

export default function AboutPage() {
  return (
    <>
      <PageTitle title="How plans are built" sub="What comes from research, and what is coaching judgement." />
      <div className="space-y-4">
        <Panel title="In short">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li><b>You connect Strava.</b> RunBabyRun reads your runs from the last 120 days to suggest your weekly distance, longest run and a recent hard effort. You can correct every number.</li>
            <li><b>You answer the questionnaire:</b> race and date, goal, current running, the days you can run, equipment, and a short health check.</li>
            <li><b>A plan is generated</b> from today to race day: base, build, taper and race week, with an easier week every third or fourth week.</li>
            <li><b>Each run is matched</b> to the Strava activity from that day and scored against its distance, heart-rate and pace targets.</li>
            <li><b>The plan is checked against what you actually ran.</b> If you jump too far, miss most of a week or log pain, Today tells you and offers to rebuild the remaining weeks.</li>
          </ol>
        </Panel>

        <Panel title="The rules" sub="Applied the same way to every runner.">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Rule</th><th>Value</th><th>Basis</th></tr></thead>
              <tbody>
                <tr><td>Longest run</td><td>At most 10% above your longest run of the last 30 days (or +1 km when under 10 km)</td><td>Frandsen 2025</td></tr>
                <tr><td>Weekly distance</td><td>Up about 8% a week; 6% for new runners, age 55+, or any health flag or sore area</td><td>Judgement, in the direction of Nielsen 2014</td></tr>
                <tr><td>Easier weeks</td><td>Every 4th week (every 3rd when progressing gently), about a quarter less running</td><td>Coaching convention</td></tr>
                <tr><td>Hard sessions</td><td>None until you can run 30 minutes; one or two a week after that, never on consecutive days</td><td>Judgement, consistent with Stöggl &amp; Sperlich 2015</td></tr>
                <tr><td>Taper</td><td>Race week only for a 5K; one lighter week before it for a 10K or half marathon; two for a marathon. Running drops 20–40% in those weeks and 50–70% in race week, and some faster running is kept</td><td>Direction from Bosquet 2007; the exact fractions are judgement</td></tr>
                <tr><td>Paces</td><td>Offsets from your 10K-equivalent pace</td><td>Riegel 1981 for the conversion; the offsets are coaching convention</td></tr>
                <tr><td>Heart-rate ranges</td><td>Percentages of maximum heart rate (easy 68–78%, tempo 84–89%)</td><td>Coaching convention; Tanaka 2001 only when no maximum is known</td></tr>
                <tr><td>Strength</td><td>0–2 sessions a week, never the day before the long run or race</td><td>Balsalobre-Fernández 2016; placement is judgement</td></tr>
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Limits you should know about">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>RunBabyRun is a planning tool. It is not a coach, a physiotherapist or a doctor, and it cannot examine you.</li>
            <li>No training rule has been shown to prevent injury in every runner. The caps here lower exposure to known risk patterns; they do not remove risk.</li>
            <li>Several rules are coaching conventions without direct trial evidence. They are marked as such above.</li>
            <li>Pace and heart-rate targets start as estimates and get better when you enter a race or time-trial result and a measured maximum heart rate.</li>
            <li>Heat and humidity raise heart rate at a given pace. On hot days follow the heart-rate range and let the pace be slower.</li>
            <li>The plan assumes you are 18 or older.</li>
          </ul>
        </Panel>

        <Panel title="Sources">
          <ol className="space-y-3 text-sm">
            {SOURCES.map((s) => (
              <li key={s.id} id={s.id}>
                <div>{s.cite}{s.doi && <> <a className="text-accent underline" href={`https://doi.org/${s.doi}`} target="_blank" rel="noreferrer">doi:{s.doi}</a></>}</div>
                <div className="mt-0.5 text-ink-2"><b>Used for:</b> {s.use}</div>
              </li>
            ))}
          </ol>
        </Panel>
        <p className="text-xs text-muted"><Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link></p>
      </div>
    </>
  );
}
