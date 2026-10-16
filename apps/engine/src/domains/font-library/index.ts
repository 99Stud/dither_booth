import { deleteFontAssetProcedure } from "./mutations/delete-font-asset";
import { installLibraryFontProcedure } from "./mutations/install-library-font";
import { uploadFontProcedure } from "./mutations/upload-font";
import { getFontAssetProcedure } from "./queries/get-font-asset";
import { listFontAssetsProcedure } from "./queries/list-font-assets";
import { searchFontLibraryProcedure } from "./queries/search-font-library";

export const fontLibrary = {
  searchFontLibrary: searchFontLibraryProcedure,
  listFontAssets: listFontAssetsProcedure,
  installLibraryFont: installLibraryFontProcedure,
  uploadFont: uploadFontProcedure,
  deleteFontAsset: deleteFontAssetProcedure,
};

export const fontLibraryBooth = {
  getFontAsset: getFontAssetProcedure,
};
