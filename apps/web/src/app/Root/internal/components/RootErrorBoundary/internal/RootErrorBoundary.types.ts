import type { ReactNode } from "react";

export type RootErrorBoundaryProps = {
  children: ReactNode;
};

export type RootErrorBoundaryState = {
  error: unknown | null;
};

export type RootScreenProps = {
  description: string;
  details?: string;
  title: string;
};
