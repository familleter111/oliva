export default function PanelLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Chargement" className="animate-pulse">
      <div className="h-3 w-28 rounded bg-line" />
      <div className="mt-3 h-11 w-[min(520px,80%)] rounded-lg bg-line" />
      <div className="mt-3 h-5 w-[min(420px,65%)] rounded bg-line" />
      <div className="mt-8 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="h-80 rounded-2xl border border-line bg-white" />
        <div className="h-80 rounded-2xl border border-line bg-white" />
      </div>
    </div>
  );
}
