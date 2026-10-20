"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { can } from "@/lib/permissions";
import { extractErrorMessage } from "@/lib/errors";
import type { TeamDTO } from "@/lib/teams";

// Everyone with the Teams permission sees every team; a manager sees the team(s) they are in charge of, and goes
// straight to it when there is only one.
export default function TeamsIndexPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [teams, setTeams] = useState<TeamDTO[] | null>(null);
  const [error, setError] = useState("");
  const all = can(session?.user, "teams.manage");

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/teams")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) return setError(extractErrorMessage(data?.error, "Couldn't load the teams"));
        setTeams(data.teams);
        if (!all && data.teams.length === 1) router.replace(`/teams/${data.teams[0].id}`);
      })
      .catch(() => setError("Couldn't load the teams"));
  }, [status, all, router]);

  return (
    <div className="px-4 pb-24 lg:px-0 lg:pb-10 page-in">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 pt-4 lg:pb-7 lg:pt-10">
        <div>
          <h1 className="text-xl font-bold lg:text-[28px] lg:leading-none lg:tracking-[-0.025em]">Teams</h1>
          <p className="mt-1 text-[13px] text-muted lg:mt-2.5 lg:text-[15px]">Open a team to see its people, listings and leads.</p>
        </div>
        {all && (
          <Link href="/admin/users" className="rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] font-semibold hover:bg-surface-muted">
            Create or edit teams
          </Link>
        )}
      </div>
      {error && <p className="rounded-2xl border border-dashed border-border py-12 text-center text-[14px] text-muted">{error}</p>}
      {!error && teams === null && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-border bg-surface" />
          ))}
        </div>
      )}
      {teams && teams.length === 0 && <p className="rounded-2xl border border-dashed border-border py-12 text-center text-[14px] text-muted">There are no teams yet.</p>}
      {teams && teams.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <Link key={t.id} href={`/teams/${t.id}`} className="card-hover block rounded-2xl border border-border bg-surface p-4 shadow-sm lg:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-semibold">{t.name}</h2>
                  <p className="mt-0.5 text-[13px] text-muted">{t.manager ? `Managed by ${t.manager.name}` : "No manager yet"}</p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-[11.5px] font-semibold text-muted">
                  {t.members.length} {t.members.length === 1 ? "person" : "people"}
                </span>
              </div>
              <ul className="mt-3 flex -space-x-2">
                {t.members.slice(0, 6).map((m) => (
                  <li key={m.id} className="rounded-full ring-2 ring-surface">
                    <Avatar name={m.name} avatarUrl={m.avatarUrl} size={28} />
                  </li>
                ))}
                {t.members.length > 6 && <li className="flex h-7 items-center pl-3 text-[12px] text-muted">+{t.members.length - 6}</li>}
              </ul>
              <p className="mt-3 text-[13px] font-semibold text-primary">Open team →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
