import type { FormEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@dither-booth/ui/components/ui/alert-dialog";
import { Badge } from "@dither-booth/ui/components/ui/badge";
import { Button } from "@dither-booth/ui/components/ui/button";
import { Card, CardContent } from "@dither-booth/ui/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@dither-booth/ui/components/ui/dropdown-menu";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@dither-booth/ui/components/ui/field";
import { Input } from "@dither-booth/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dither-booth/ui/components/ui/select";
import { Skeleton } from "@dither-booth/ui/components/ui/skeleton";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@dither-booth/ui/components/ui/toggle-group";
import clsx from "clsx";
import {
  Copy,
  Crown,
  MoreHorizontal,
  Plus,
  Share,
  UserMinus,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { LiveFallback } from "#app/LiveFallback";
import { MemberStatusLine } from "#app/MemberStatusLine";
import { messageOf } from "#lib/errors";
import { useLive } from "#lib/live";
import {
  addErrorMessage,
  addMember,
  createTeam,
  memberStatus,
  NOT_IN_A_TEAM,
  readTeam,
  removeMember,
  setRole,
  shareMessage,
  staffOrgId,
  type Team,
  type TeamMember,
  type TeamRole,
  teamSummary,
  visibleTeams,
} from "#lib/team";

/** Share sheet where the device has one, else the clipboard. */
async function sendSignIn(text: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      // Closing the sheet is a choice, not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }
  await navigator.clipboard.writeText(text).then(
    () => toast.success("Message copied."),
    () => toast.error("Couldn't copy: select the message instead."),
  );
}

/** After adding someone: the message that tells them how to sign in. */
const SharePanel = ({
  team,
  email,
  created,
  onDone,
}: {
  team: string;
  email: string;
  created: boolean;
  onDone: () => void;
}) => {
  const heading = useRef<HTMLHeadingElement>(null);
  const text = shareMessage(team, email);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div
      className={clsx(
        "flex flex-col gap-3 rounded-lg border border-border p-3",
      )}
    >
      <h3
        ref={heading}
        tabIndex={-1}
        className={clsx("text-sm font-medium outline-none")}
      >
        {created
          ? `${email} is in ${team}.`
          : `${email} already had a login. They're now in ${team} too.`}{" "}
        Tell them how to sign in:
      </h3>
      <blockquote
        className={clsx(
          "rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground select-all",
        )}
      >
        {text}
      </blockquote>
      <div className={clsx("flex flex-wrap gap-2")}>
        {"share" in navigator ? (
          <Button type="button" size="sm" onClick={() => void sendSignIn(text)}>
            <Share data-icon="inline-start" />
            Share
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(
              () => toast.success("Message copied."),
              () => toast.error("Couldn't copy: select the message instead."),
            )
          }
        >
          <Copy data-icon="inline-start" />
          Copy message
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
};

const AddMember = ({
  orgId,
  team,
  onAdded,
}: {
  orgId: string;
  team: string;
  onAdded: () => void;
}) => {
  const [email, setEmail] = useState("");
  const [role, setRoleChoice] = useState<TeamRole>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<{ email: string; created: boolean }>();

  if (added) {
    return (
      <SharePanel
        team={team}
        email={added.email}
        created={added.created}
        onDone={() => setAdded(undefined)}
      />
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    const typed = email.trim();
    try {
      const result = await addMember(orgId, typed, role);
      setEmail("");
      setRoleChoice("member");
      setAdded({ email: result.member.email, created: result.created });
      onAdded();
    } catch (caught) {
      setError(addErrorMessage(caught, typed.toLowerCase(), team));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={clsx(
        "flex flex-col gap-3 rounded-lg border border-border p-3",
      )}
      onSubmit={submit}
      noValidate
    >
      <p className={clsx("text-sm font-medium")}>Add someone</p>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="new-member">Email</FieldLabel>
        <Input
          id="new-member"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          placeholder="lea@example.com"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "new-member-error" : undefined}
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(undefined);
          }}
        />
        <FieldError id="new-member-error">{error}</FieldError>
      </Field>
      <Field>
        <FieldLabel id="new-member-role">Role</FieldLabel>
        <ToggleGroup
          aria-labelledby="new-member-role"
          spacing={1}
          size="sm"
          variant="outline"
          value={[role]}
          onValueChange={(next: unknown[]) => {
            const [picked] = next;
            if (picked) setRoleChoice(picked as TeamRole);
          }}
        >
          {(["member", "owner"] as const).map((option) => (
            <ToggleGroupItem
              key={option}
              value={option}
              className={clsx(
                "px-3",
                "data-[pressed]:border-foreground/40 data-[pressed]:bg-muted",
              )}
            >
              {option === "member" ? "Member" : "Owner"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>Owners can add and remove people.</FieldDescription>
      </Field>
      <Button
        type="submit"
        className={clsx("self-end")}
        disabled={busy || email.trim() === ""}
      >
        {busy ? (
          <Spinner className="size-4" />
        ) : (
          <Plus data-icon="inline-start" />
        )}
        Add
      </Button>
    </form>
  );
};

const MemberMenu = ({
  orgId,
  team,
  member,
  onChanged,
}: {
  orgId: string;
  team: string;
  member: TeamMember;
  onChanged: () => void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const promoted = member.role === "member";

  const act = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      onChanged();
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const devices =
    member.devices === 0
      ? "They'll"
      : member.devices === 1
        ? "Their device stops getting this team's alerts, and they'll"
        : `Their ${member.devices} devices stop getting this team's alerts, and they'll`;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          aria-label={`Actions for ${member.email}`}
          render={<Button type="button" variant="ghost" size="icon-sm" />}
        >
          {busy ? <Spinner className="size-4" /> : <MoreHorizontal />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-auto">
          <DropdownMenuItem
            onClick={() => void sendSignIn(shareMessage(team, member.email))}
          >
            <Share />
            Share sign-in
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              void act(
                () =>
                  setRole(orgId, member.userId, promoted ? "owner" : "member"),
                promoted
                  ? `${member.email} is now an owner.`
                  : `${member.email} is now a member.`,
              )
            }
          >
            {promoted ? <Crown /> : <UserRound />}
            {promoted ? "Make owner" : "Make member"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirming(true)}
          >
            <UserMinus />
            Remove from team
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {member.email} from {team}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {devices} no longer see its booths. Their login stays, so you can
              add them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                void act(
                  () => removeMember(orgId, member.userId),
                  `${member.email} removed from ${team}.`,
                );
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const MemberRow = ({
  member,
  menu,
}: {
  member: TeamMember;
  menu: React.ReactNode;
}) => {
  return (
    <li className={clsx("flex items-center gap-3 py-3")}>
      <div className={clsx("flex min-w-0 flex-1 flex-col gap-1")}>
        <p className={clsx("flex items-center gap-1.5 text-sm font-medium")}>
          <span className={clsx("truncate")}>{member.email}</span>
          {member.you ? <Badge variant="outline">You</Badge> : null}
          {member.role === "owner" ? (
            <Badge variant="secondary">Owner</Badge>
          ) : null}
        </p>
        <MemberStatusLine status={memberStatus(member)} />
      </div>
      {menu}
    </li>
  );
};

/** The screen's shape while it loads: the summary, then the list. */
const MembersSkeleton = () => (
  <div
    aria-busy="true"
    aria-label="Loading the team"
    className={clsx("flex flex-col gap-4")}
  >
    <div className={clsx("flex flex-col gap-1.5")}>
      <Skeleton className={clsx("h-6 w-24")} />
      <Skeleton className={clsx("h-4 w-40")} />
    </div>
    <Card>
      <CardContent className={clsx("flex flex-col gap-4")}>
        {[0, 1, 2].map((row) => (
          <div key={row} className={clsx("flex flex-col gap-1.5")}>
            <Skeleton className={clsx("h-4 w-48")} />
            <Skeleton className={clsx("h-3 w-24")} />
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
);

/** One team: who is in it, whose phone rings, and for managers, changes. */
const TeamView = ({ orgId }: { orgId: string }) => {
  // No Realtime: a member can't read the rest of the team's rows, so it
  // would only hear about their own. Team reads again after each change made
  // here, when Studio comes back to the foreground, and every minute.
  const live = useLive("team", () => readTeam(orgId), []);

  if (live.data === undefined) {
    return live.error ? (
      <LiveFallback error={live.error} what="team" />
    ) : (
      <MembersSkeleton />
    );
  }

  const { team, canManage, members } = live.data;
  const alone = members.every((member) => member.you);

  return (
    <div className={clsx("flex flex-col gap-4")}>
      <div>
        <p className={clsx("text-lg font-semibold")}>{team.name}</p>
        <p className={clsx("text-sm text-muted-foreground")}>
          {teamSummary(members)}
        </p>
      </div>

      {canManage ? (
        <AddMember orgId={orgId} team={team.name} onAdded={live.reload} />
      ) : null}

      <Card>
        <CardContent>
          <ul
            aria-label="Members"
            className={clsx("-my-3 divide-y divide-border")}
          >
            {members.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                menu={
                  canManage && !member.you ? (
                    <MemberMenu
                      orgId={orgId}
                      team={team.name}
                      member={member}
                      onChanged={live.reload}
                    />
                  ) : null
                }
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      {alone ? (
        <p className={clsx("text-sm text-muted-foreground")}>
          {canManage
            ? "Nobody else yet. Add the people who should get this team's alerts."
            : "Nobody else yet. Ask an owner to add your teammates."}
        </p>
      ) : null}

      {canManage ? null : (
        <p className={clsx("text-sm text-muted-foreground")}>
          Only owners and platform admins change the team.
        </p>
      )}
    </div>
  );
};

/** A platform admin starts a team: a client's, or one more of 99Stud's. */
const NewTeam = ({ onCreated }: { onCreated: (team: Team) => void }) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={clsx("self-start")}
        onClick={() => setOpen(true)}
      >
        <Plus data-icon="inline-start" />
        New team
      </Button>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const team = await createTeam(name);
      toast.success(`${team.name} is on the Hub. Add its people next.`);
      setName("");
      setOpen(false);
      onCreated(team);
    } catch (caught) {
      setError(`Couldn't create ${name.trim()}: ${messageOf(caught)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className={clsx(
        "flex flex-col gap-3 rounded-lg border border-border p-3",
      )}
      onSubmit={submit}
      noValidate
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="new-team">Team name</FieldLabel>
        <Input
          id="new-team"
          placeholder="Le Bar"
          value={name}
          aria-invalid={error ? true : undefined}
          onChange={(changed) => {
            setName(changed.target.value);
            setError(undefined);
          }}
        />
        <FieldDescription>
          A client's team sees its events. Book them in Events.
        </FieldDescription>
        <FieldError>{error}</FieldError>
      </Field>
      <div className={clsx("flex justify-end gap-2")}>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy || name.trim() === ""}>
          {busy ? <Spinner className="size-4" /> : null}
          Create team
        </Button>
      </div>
    </form>
  );
};

/**
 * Studio's Team: the people in a team and whether their phones get its
 * alerts. A platform admin who sees several teams picks one; it starts on
 * their own. Admins also start new teams here.
 */
export const TeamScreen = ({ isAdmin }: { isAdmin: boolean }) => {
  const [teams, setTeams] = useState<Team[]>();
  const [orgId, setOrgId] = useState<string | null>();
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([visibleTeams(), staffOrgId()]).then(([all, own]) => {
      setTeams(all);
      setOrgId(own ?? all[0]?.id ?? null);
    }, setError);
  }, []);

  if (orgId === undefined || teams === undefined) {
    return error ? (
      <LiveFallback error={error} what="team" />
    ) : (
      <MembersSkeleton />
    );
  }

  const created = (team: Team) => {
    setTeams((now) =>
      [...(now ?? []), team].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setOrgId(team.id);
  };

  if (orgId === null) {
    return isAdmin ? (
      <NewTeam onCreated={created} />
    ) : (
      <p className={clsx("text-sm")}>{NOT_IN_A_TEAM}</p>
    );
  }

  return (
    <div className={clsx("flex flex-col gap-4")}>
      {isAdmin ? <NewTeam onCreated={created} /> : null}
      {teams.length > 1 ? (
        // Base UI's listbox, not a native one. ds-allow-native-select
        <Select
          items={teams.map((team) => ({ value: team.id, label: team.name }))}
          value={orgId}
          onValueChange={(next) => {
            if (next) setOrgId(next as string);
          }}
        >
          <SelectTrigger aria-label="Team" className={clsx("w-full")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <TeamView key={orgId} orgId={orgId} />
    </div>
  );
};
