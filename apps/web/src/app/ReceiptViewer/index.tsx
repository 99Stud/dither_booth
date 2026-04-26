import type { FC } from "react";

import { Receipt } from "#components/misc/Receipt/index";

export const ReceiptViewer: FC = () => {
  return (
    <div className="min-h-dvh bg-black p-4">
      <Receipt className="mx-auto" />
    </div>
  );
};
