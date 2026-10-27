import type { FC } from "react";

import {
  LOGO_UPLOAD_ACCEPT,
  MAX_PARTNERS,
  type KitPartners,
} from "@dither-booth/shared/kit-partners";
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
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@dither-booth/ui/components/ui/field";
import { Input } from "@dither-booth/ui/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@dither-booth/ui/components/ui/sheet";
import { Spinner } from "@dither-booth/ui/components/ui/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Check, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";

import { errorMessage } from "#lib/feedback/error-message";
import { notify } from "#lib/feedback/notify";
import { useTRPC } from "#lib/trpc/trpc.client";

import { KitLogo } from "./KitLogo";

interface KitLogoLibrarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The logos already in the event's partner row. */
  partners: KitPartners;
  onAdd: (id: string) => void;
}

/**
 * Logos added to this booth, each kept as it prints. An event puts up to
 * four of them in its partner row.
 */
export const KitLogoLibrarySheet: FC<KitLogoLibrarySheetProps> = (props) => {
  const { open, onOpenChange, partners, onAdd } = props;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const assets = useQuery(trpc.config.listLogoAssets.queryOptions());
  const refreshAssets = () =>
    queryClient.invalidateQueries(trpc.config.listLogoAssets.queryFilter());
  const [removing, setRemoving] = useState<{ id: string; name: string }>();
  const isRowFull = partners.length >= MAX_PARTNERS;

  const remove = useMutation({
    ...trpc.config.deleteLogoAsset.mutationOptions(),
    onSuccess: async () => {
      notify.success("Logo removed");
      await refreshAssets();
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={clsx("w-full sm:max-w-md")}>
        <SheetHeader>
          <SheetTitle>Logo library</SheetTitle>
          <SheetDescription>
            Logos added here stay on the booth. Each is turned black and white
            the way the printer prints it, so what you see is what prints.
          </SheetDescription>
        </SheetHeader>

        <div
          className={clsx(
            "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6",
          )}
        >
          <LogoUploadForm
            onAdded={async (id) => {
              await refreshAssets();
              if (!isRowFull) onAdd(id);
            }}
          />

          <section
            aria-labelledby="logo-library-installed"
            className={clsx("flex flex-col gap-2")}
          >
            <h3
              id="logo-library-installed"
              className={clsx("text-sm font-medium")}
            >
              On this booth
            </h3>
            {assets.isLoading ? (
              <Spinner />
            ) : (assets.data ?? []).length === 0 ? (
              <p className={clsx("text-sm text-muted-foreground")}>
                No logos added yet.
              </p>
            ) : (
              <ul
                className={clsx(
                  "flex flex-col divide-y divide-border rounded-lg border border-border",
                )}
              >
                {(assets.data ?? []).map((asset) => {
                  const isInRow = partners.includes(asset.id);
                  return (
                    <li
                      key={asset.id}
                      className={clsx("flex items-center gap-3 px-3 py-2")}
                    >
                      <KitLogo
                        id={asset.id}
                        name={asset.name}
                        className={clsx("h-12 w-20 shrink-0")}
                      />
                      <p
                        className={clsx(
                          "min-w-0 flex-1 truncate text-sm font-medium",
                        )}
                      >
                        {asset.name}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isInRow || isRowFull}
                        onClick={() => onAdd(asset.id)}
                      >
                        {isInRow ? (
                          <Check data-icon="inline-start" />
                        ) : (
                          <Plus data-icon="inline-start" />
                        )}
                        {isInRow ? "In the row" : "Add"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${asset.name} from the booth`}
                        className={clsx(
                          "text-muted-foreground hover:text-destructive",
                        )}
                        disabled={remove.isPending}
                        onClick={() =>
                          setRemoving({ id: asset.id, name: asset.name })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {isRowFull ? (
              <p className={clsx("text-sm text-muted-foreground")}>
                The partner row is full: {MAX_PARTNERS} logos. Take one out of
                the row to add another.
              </p>
            ) : null}
          </section>
        </div>

        <AlertDialog
          open={removing !== undefined}
          onOpenChange={(next) => {
            if (!next) setRemoving(undefined);
          }}
        >
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                It is deleted from the booth. A logo the event prints can&apos;t
                be removed until you take it out of the partner row and save.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (removing) remove.mutate({ id: removing.id });
                  setRemoving(undefined);
                }}
              >
                Remove logo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
};

const LogoUploadForm: FC<{ onAdded: (id: string) => Promise<void> }> = ({
  onAdded,
}) => {
  const trpc = useTRPC();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  // Clears the file input after an upload, which a controlled value can't.
  const [inputKey, setInputKey] = useState(0);
  const upload = useMutation({
    ...trpc.config.uploadLogo.mutationOptions(),
    onSuccess: async (asset) => {
      notify.success(`${asset.name} added to the booth`);
      setFile(null);
      setName("");
      setInputKey((key) => key + 1);
      await onAdded(asset.id);
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
  const canUpload = file !== null && name.trim() !== "" && !upload.isPending;

  return (
    <form
      className={clsx("flex flex-col gap-4")}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canUpload || !file) return;
        const data = new FormData();
        data.set("file", file);
        data.set("name", name.trim());
        upload.mutate(data);
      }}
    >
      <Field orientation="vertical">
        <FieldLabel htmlFor="logo-upload-file">Logo file</FieldLabel>
        <Input
          key={inputKey}
          id="logo-upload-file"
          type="file"
          accept={LOGO_UPLOAD_ACCEPT}
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            if (next && name === "") {
              setName(
                next.name.replace(/\.(png|svg)$/iu, "").replace(/[-_]+/gu, " "),
              );
            }
          }}
        />
        <FieldDescription>
          A PNG or an SVG, up to 2 MB. Dark parts print black; light ones
          disappear.
        </FieldDescription>
      </Field>
      <Field orientation="vertical">
        <FieldLabel htmlFor="logo-upload-name">Name</FieldLabel>
        <Input
          id="logo-upload-name"
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <div className={clsx("flex items-center justify-between gap-3")}>
        <Badge variant="secondary">Stays on this booth</Badge>
        <Button type="submit" disabled={!canUpload}>
          {upload.isPending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <Upload data-icon="inline-start" />
          )}
          {upload.isPending ? "Uploading" : "Upload"}
        </Button>
      </div>
      {upload.data ? (
        <figure aria-live="polite" className={clsx("flex items-center gap-3")}>
          <KitLogo
            id={upload.data.id}
            name={upload.data.name}
            className={clsx("h-16 w-32 shrink-0")}
          />
          <figcaption className={clsx("text-sm text-muted-foreground")}>
            {upload.data.name}, as it prints.
          </figcaption>
        </figure>
      ) : null}
    </form>
  );
};
