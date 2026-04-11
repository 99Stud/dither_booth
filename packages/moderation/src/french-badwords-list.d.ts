declare module "french-badwords-list" {
  const frenchBadwordsList: {
    array: string[];
    object: Record<string, unknown>;
    regex: RegExp;
  };

  export default frenchBadwordsList;
}
