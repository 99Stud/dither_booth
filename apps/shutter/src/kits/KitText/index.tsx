import type { FC } from "react";

import { fillCopyVariables } from "@dither-booth/shared/kit-copy";

/**
 * A kit's text, with `{name}` placeholders filled and `**text**` in bold. One
 * inline span, so a bold word never becomes its own item in a flex row (and
 * picks up the row's gap); the caller keeps its own element and styles.
 */
export const KitText: FC<{
  text: string;
  values?: Record<string, string | number>;
}> = (props) => {
  const { text, values = {} } = props;
  const parts = fillCopyVariables(text, values).split("**");

  return (
    <span>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="font-bold">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  );
};
