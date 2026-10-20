import { IconBubble } from "@dither-booth/ui/components/misc/IconBubble";
import { buttonVariants } from "@dither-booth/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@dither-booth/ui/components/ui/card";
import clsx from "clsx";
import { BookOpen } from "lucide-react";

import { DOCS_PATH } from "#lib/docs/docs.constants";

/**
 * The way to the docs on a phone, where the sidebar's link isn't shown. The
 * booth serves them itself, so they open at a venue with no internet.
 */
export const DocsCard = () => (
  <Card>
    <CardHeader>
      <CardTitle className={clsx("flex items-center gap-2.5")}>
        <IconBubble tone="emerald">
          <BookOpen />
        </IconBubble>
        <h2>Docs</h2>
      </CardTitle>
      <CardDescription>
        Venue checklist, Wi-Fi, troubleshooting and how the booth works. Served
        by the booth, no internet needed.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <a
        className={clsx(buttonVariants({ variant: "outline" }), "w-full")}
        href={DOCS_PATH}
        target="_blank"
        rel="noopener"
      >
        Open the docs
      </a>
    </CardContent>
  </Card>
);
