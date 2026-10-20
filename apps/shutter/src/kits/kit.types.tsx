import type { FC } from "react";

export type TicketComponent = FC<{ className?: string }>;

/**
 * A kit's code. What every app may know about a kit without loading this
 * lives in its manifest (`KIT_MANIFESTS` in `@dither-booth/shared/kits`).
 */
export type Kit = {
  tickets: {
    photo: TicketComponent;
    /** Absent means the default lottery ticket. */
    lottery?: TicketComponent;
  };
};
