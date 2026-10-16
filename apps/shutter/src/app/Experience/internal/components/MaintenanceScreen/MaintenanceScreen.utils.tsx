/**
 * The ordered-dither (Bayer) threshold of every cell of a `size`×`size`
 * grid, row by row: a permutation of 0..size²-1 where neighbouring ranks sit
 * far apart. Revealing cells in rank order fades the grid in the way the
 * printer dithers a grey. `size` is a power of two.
 */
export const getBayerRanks = (size: number): number[] => {
  let matrix = [[0]];

  while (matrix.length < size) {
    const n = matrix.length;
    matrix = Array.from({ length: n * 2 }, (_, y) =>
      Array.from({ length: n * 2 }, (_, x) => {
        const base = 4 * matrix[y % n]![x % n]!;
        const quadrant = (y < n ? 0 : 2) + (x < n ? 0 : 1);
        return base + [0, 2, 3, 1][quadrant]!;
      }),
    );
  }

  return matrix.flat();
};
