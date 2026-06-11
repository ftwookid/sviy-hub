export function SetupNotice() {
  return (
    <main className="mx-auto max-w-[780px] px-4 py-14 sm:px-6">
      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <div className="font-serif text-[28px] italic text-accent">Yani</div>
        <h1 className="mt-5 text-[20px] font-medium leading-[1.3] text-text-primary">Supabase setup needed</h1>
        <p className="mt-2 text-[13px] text-text-secondary">
          Add your Supabase URL and anon key to <span className="text-text-primary">.env.local</span>, then run the SQL in
          <span className="text-text-primary"> supabase/schema.sql</span>.
        </p>
      </div>
    </main>
  );
}

export function AppLoading({ message = "Preparing Yani..." }: { message?: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="text-center">
        <div className="font-serif text-[32px] italic leading-[1.3] text-accent">Yani</div>
        <p className="mt-2 text-[13px] text-text-secondary">{message}</p>
      </div>
    </main>
  );
}
