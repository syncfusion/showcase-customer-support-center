import { Settings } from 'lucide-react';

/**
 * Generic placeholder used by tabs that are not yet implemented.
 * Lives in its own file so sibling tabs (Queue, Cases, Automation, Insights)
 * can import it without pulling in the full OverviewTab module.
 */
export function TabPlaceholder({ title, body }: { title: string; body: string }) {
  return (
    <section
      aria-labelledby="tab-heading"
      className="flex flex-col gap-md w-full py-xl px-0"
    >
      <h1
        id="tab-heading"
        className="text-3xl font-semibold text-text leading-tight"
      >
        {title}
      </h1>
      <p className="text-md text-text-muted">{body}</p>
      <div className="mt-lg rounded-lg border border-border bg-surface p-xl text-center">
        <Settings className="mt-md text-primary mx-auto" size={32} strokeWidth={2} aria-hidden="true" />
        <p className="mt-md text-text-muted">Coming soon</p>
      </div>
    </section>
  );
}
