import Image from "next/image";

export function SetupNotice() {
  return (
    <main className="mx-auto max-w-[780px] px-4 py-14 sm:px-6">
      <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
        <Image src="/Logo v2.png" alt="Sviy Hub" width={92} height={92} className="h-[92px] w-[92px] object-contain" priority />
        <h1 className="mt-5 text-[22px] font-medium leading-[1.3] text-text-primary">Supabase setup needed</h1>
        <p className="mt-2 text-[15px] text-text-secondary">
          Add your Supabase URL and anon key to <span className="text-text-primary">.env.local</span>, then run the SQL in
          <span className="text-text-primary"> supabase/schema.sql</span>.
        </p>
      </div>
    </main>
  );
}

export function AppLoading({ message = "Preparing your workspace..." }: { message?: string }) {
  return (
    <main className="grid min-h-viewport place-items-center px-4 py-10">
      <div className="flex flex-col items-center text-center">
        <Image src="/Logo v2.png" alt="Sviy Hub" width={136} height={136} className="h-[136px] w-[136px] object-contain" priority />
        <p className="mt-3 text-[15px] text-text-secondary">{message}</p>
      </div>
    </main>
  );
}
