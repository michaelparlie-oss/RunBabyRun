import { PageTitle } from "@/app/_c/ui";
import { EXERCISES } from "@/lib/strength/library";

export default function LibraryPage() {
  return (
    <>
      <PageTitle title="Exercise library" sub="How to do every exercise in the strength menus." />
      <div className="grid gap-3 lg:grid-cols-2">
        {Object.entries(EXERCISES).map(([k, e]) => (
          <article key={k} id={k} className="card scroll-mt-4">
            <h2 className="font-extrabold">{e.name}</h2>
            <div className="text-xs text-muted">{e.equipment}</div>
            <p className="mt-2 text-sm">{e.purpose}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{e.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
            <p className="mt-2 text-sm"><b>Do:</b> {e.cues.join("; ")}. <b>Avoid:</b> {e.mistakes.join("; ")}.</p>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Start</dt><dd>{e.start}</dd>
              <dt className="text-muted">Progress</dt><dd>{e.progress}</dd>
              <dt className="text-muted">Easier</dt><dd>{e.easier}</dd>
              <dt className="text-muted">Harder</dt><dd>{e.harder}</dd>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
