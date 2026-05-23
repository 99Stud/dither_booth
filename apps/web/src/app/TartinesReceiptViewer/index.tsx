import type { FC } from "react";

import { TartinesReceiptTemplate } from "#components/receipt-templates/TartinesReceiptTemplate/index";

export const TartinesReceiptViewer: FC = () => {
  return (
    <div className="min-h-dvh bg-black p-4">
      <TartinesReceiptTemplate className="mx-auto" />
    </div>
  );
};
