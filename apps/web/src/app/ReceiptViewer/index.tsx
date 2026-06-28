import type { ReceiptTemplate } from "@dither-booth/shared/routes";
import type { FC } from "react";

import { RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE } from "@dither-booth/shared/browser/receipt-viewer";

import { HeirveyReceiptTemplate } from "#components/receipt-templates/HeirveyReceiptTemplate/index";
import { TartinesReceiptTemplate } from "#components/receipt-templates/TartinesReceiptTemplate/index";
import { receiptViewerRoute } from "#lib/router/index";

type ReceiptTemplateComponent = FC<{
  className?: string;
}>;

const RECEIPT_TEMPLATE_COMPONENTS = {
  heirvey: HeirveyReceiptTemplate,
  tartines: TartinesReceiptTemplate,
} satisfies Record<ReceiptTemplate, ReceiptTemplateComponent>;

export const ReceiptViewer: FC = () => {
  const { template } = receiptViewerRoute.useSearch();

  const ReceiptTemplateComponent = template
    ? RECEIPT_TEMPLATE_COMPONENTS[template]
    : undefined;

  return (
    <div
      className="min-h-dvh bg-black p-4"
      {...{ [RECEIPT_VIEWER_TEMPLATE_ATTRIBUTE]: template ?? "" }}
    >
      {ReceiptTemplateComponent ? (
        <ReceiptTemplateComponent className="mx-auto" />
      ) : (
        <p className="text-white">No template selected</p>
      )}
    </div>
  );
};
