import type { FC } from "react";

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
  FieldContent,
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
import { Switch } from "@dither-booth/ui/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dither-booth/ui/components/ui/tabs";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@dither-booth/ui/components/ui/toggle-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CloudOff, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";

import { errorMessage } from "#lib/feedback/error-message";
import { notify } from "#lib/feedback/notify";
import { useTRPC } from "#lib/trpc/trpc.client";

const SEARCH_DEBOUNCE_MS = 250;

interface KitFontLibrarySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Fonts added to this booth: from Google Fonts (downloaded once, then
 * offline) or uploaded as woff2. Any kit role can then use them.
 */
export const KitFontLibrarySheet: FC<KitFontLibrarySheetProps> = (props) => {
  const { open, onOpenChange } = props;
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const assets = useQuery(trpc.config.listFontAssets.queryOptions());
  const refreshAssets = () =>
    queryClient.invalidateQueries(trpc.config.listFontAssets.queryFilter());
  const [removing, setRemoving] = useState<{ id: string; family: string }>();

  const remove = useMutation({
    ...trpc.config.deleteFontAsset.mutationOptions(),
    onSuccess: async () => {
      notify.success("Font removed");
      await refreshAssets();
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={clsx("w-full sm:max-w-md")}>
        <SheetHeader>
          <SheetTitle>Font library</SheetTitle>
          <SheetDescription>
            Fonts added here stay on the booth, so they work without Wi-Fi.
            Adding one needs the internet once.
          </SheetDescription>
        </SheetHeader>

        <div
          className={clsx(
            "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6",
          )}
        >
          <Tabs defaultValue="google" className={clsx("gap-4")}>
            <TabsList>
              <TabsTrigger value="google">Google Fonts</TabsTrigger>
              <TabsTrigger value="upload">Upload woff2</TabsTrigger>
            </TabsList>
            <TabsContent value="google">
              <GoogleFontsSearch onAdded={refreshAssets} />
            </TabsContent>
            <TabsContent value="upload">
              <FontUploadForm onAdded={refreshAssets} />
            </TabsContent>
          </Tabs>

          <section
            aria-labelledby="font-library-installed"
            className={clsx("flex flex-col gap-2")}
          >
            <h3
              id="font-library-installed"
              className={clsx("text-sm font-medium")}
            >
              On this booth
            </h3>
            {assets.isLoading ? (
              <Spinner />
            ) : (assets.data ?? []).length === 0 ? (
              <p className={clsx("text-sm text-muted-foreground")}>
                No fonts added yet. The booth&apos;s own fonts are always there.
              </p>
            ) : (
              <ul
                className={clsx(
                  "flex flex-col divide-y divide-border rounded-lg border border-border",
                )}
              >
                {(assets.data ?? []).map((asset) => (
                  <li
                    key={asset.id}
                    className={clsx(
                      "flex items-center justify-between gap-3 px-3 py-2",
                    )}
                  >
                    <div className={clsx("min-w-0")}>
                      <p className={clsx("truncate text-sm font-medium")}>
                        {asset.family}
                      </p>
                      <p className={clsx("text-xs text-muted-foreground")}>
                        {asset.source === "fontsource"
                          ? "Google Fonts"
                          : "Uploaded"}{" "}
                        · {asset.weights.join(", ")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() =>
                        setRemoving({ id: asset.id, family: asset.family })
                      }
                    >
                      <Trash2 data-icon="inline-start" />
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
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
              <AlertDialogTitle>Remove {removing?.family}?</AlertDialogTitle>
              <AlertDialogDescription>
                It is deleted from the booth. A font the event uses can&apos;t
                be removed until you pick another one.
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
                Remove font
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
};

const GoogleFontsSearch: FC<{ onAdded: () => Promise<void> }> = ({
  onAdded,
}) => {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const results = useQuery({
    ...trpc.config.searchFontLibrary.queryOptions({ query: debounced }),
    retry: false,
  });
  const install = useMutation({
    ...trpc.config.installLibraryFont.mutationOptions(),
    onSuccess: async (asset) => {
      notify.success(`${asset.family} added to the booth`);
      await onAdded();
    },
    onError: (error) => notify.error(errorMessage(error)),
  });

  return (
    <div className={clsx("flex flex-col gap-3")}>
      <Field orientation="vertical">
        <FieldLabel htmlFor="font-library-search">
          Search Google Fonts
        </FieldLabel>
        <Input
          id="font-library-search"
          type="search"
          placeholder="Creepster, Inter…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <FieldDescription>
          Open-licence fonts (OFL). The regular and bold weights are saved.
        </FieldDescription>
      </Field>
      {results.isError ? (
        <p role="status" className={clsx("flex items-start gap-2 text-sm")}>
          <CloudOff aria-hidden className={clsx("mt-0.5 size-4 shrink-0")} />
          {errorMessage(results.error)}
        </p>
      ) : results.isLoading ? (
        <Spinner />
      ) : (
        <ul
          className={clsx(
            "flex flex-col divide-y divide-border rounded-lg border border-border",
          )}
        >
          {(results.data ?? []).map((font) => {
            const isInstalling =
              install.isPending && install.variables?.fontsourceId === font.id;
            return (
              <li
                key={font.id}
                className={clsx(
                  "flex items-center justify-between gap-3 px-3 py-2",
                )}
              >
                <div className={clsx("min-w-0")}>
                  <p className={clsx("truncate text-sm font-medium")}>
                    {font.family}
                  </p>
                  <p className={clsx("text-xs text-muted-foreground")}>
                    {font.category} · {font.license}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={install.isPending}
                  onClick={() => install.mutate({ fontsourceId: font.id })}
                >
                  {isInstalling ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Plus data-icon="inline-start" />
                  )}
                  {isInstalling ? "Adding" : "Add"}
                </Button>
              </li>
            );
          })}
          {(results.data ?? []).length === 0 ? (
            <li className={clsx("px-3 py-2 text-sm text-muted-foreground")}>
              No font by that name.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
};

const FontUploadForm: FC<{ onAdded: () => Promise<void> }> = ({ onAdded }) => {
  const trpc = useTRPC();
  const [file, setFile] = useState<File | null>(null);
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState("400");
  const [licenseConfirmed, setLicenseConfirmed] = useState(false);
  const upload = useMutation({
    ...trpc.config.uploadFont.mutationOptions(),
    onSuccess: async (asset) => {
      notify.success(`${asset.family} added to the booth`);
      setFile(null);
      setFamily("");
      setLicenseConfirmed(false);
      await onAdded();
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
  const canUpload =
    file !== null &&
    family.trim() !== "" &&
    licenseConfirmed &&
    !upload.isPending;

  return (
    <form
      className={clsx("flex flex-col gap-4")}
      onSubmit={(event) => {
        event.preventDefault();
        if (!canUpload || !file) return;
        const data = new FormData();
        data.set("file", file);
        data.set("family", family.trim());
        data.set("weight", weight);
        data.set("licenseConfirmed", "true");
        upload.mutate(data);
      }}
    >
      <Field orientation="vertical">
        <FieldLabel htmlFor="font-upload-file">Font file</FieldLabel>
        <Input
          id="font-upload-file"
          type="file"
          accept=".woff2,font/woff2"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setFile(next);
            if (next && family === "") {
              setFamily(
                next.name.replace(/\.woff2$/iu, "").replace(/[-_]+/gu, " "),
              );
            }
          }}
        />
        <FieldDescription>A .woff2 file, up to 2 MB.</FieldDescription>
      </Field>
      <Field orientation="vertical">
        <FieldLabel htmlFor="font-upload-family">Name</FieldLabel>
        <Input
          id="font-upload-family"
          value={family}
          maxLength={60}
          onChange={(event) => setFamily(event.target.value)}
        />
      </Field>
      <div className={clsx("flex flex-col gap-2")}>
        <span id="font-upload-weight" className={clsx("text-sm font-medium")}>
          Weight
        </span>
        <ToggleGroup
          aria-labelledby="font-upload-weight"
          spacing={1}
          size="sm"
          variant="outline"
          value={[weight]}
          onValueChange={(next: unknown[]) => {
            const [value] = next;
            if (typeof value === "string") setWeight(value);
          }}
        >
          <ToggleGroupItem
            value="400"
            className={clsx("px-2.5 data-[pressed]:bg-muted")}
          >
            Regular
          </ToggleGroupItem>
          <ToggleGroupItem
            value="700"
            className={clsx("px-2.5 data-[pressed]:bg-muted")}
          >
            Bold
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor="font-upload-license">
            We may use this font at the event
          </FieldLabel>
          <FieldDescription>
            The client owns a licence that covers it, or it is open-licence.
          </FieldDescription>
        </FieldContent>
        <Switch
          id="font-upload-license"
          checked={licenseConfirmed}
          onCheckedChange={setLicenseConfirmed}
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
    </form>
  );
};
