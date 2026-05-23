import type { FC } from "react";

import { HeirveyReceiptTemplate } from "#components/receipt-templates/HeirveyReceiptTemplate/index";

export const HeirveyReceiptViewer: FC = () => {
  return (
    <div className="min-h-dvh bg-black p-4">
      <HeirveyReceiptTemplate className="mx-auto" />
    </div>
  );
};
