export const isImageElement = (
  element: unknown,
): element is {
  src: string;
  decode: () => Promise<undefined>;
} => {
  return (
    element !== null &&
    typeof element === "object" &&
    "src" in element &&
    typeof element.src === "string" &&
    "decode" in element &&
    typeof element.decode === "function"
  );
};
