import type { FC } from "react";

import { HeirveyReceiptTemplate } from "#components/receipt-templates/HeirveyReceiptTemplate/index";
import { TartinesReceiptTemplate } from "#components/receipt-templates/TartinesReceiptTemplate/index";
import { receiptViewerRoute } from "#lib/router/index";

export const ReceiptViewer: FC = () => {
  const { template } = receiptViewerRoute.useSearch();

  return (
    <div className="min-h-dvh bg-black p-4">
      {template === "tartines" ? (
        <TartinesReceiptTemplate className="mx-auto" />
      ) : template === "heirvey" ? (
        <HeirveyReceiptTemplate className="mx-auto" />
      ) : (
        <p className="text-white">No template selected</p>
      )}
    </div>
  );
};
