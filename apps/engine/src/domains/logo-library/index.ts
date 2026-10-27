import { deleteLogoAssetProcedure } from "./mutations/delete-logo-asset";
import { uploadLogoProcedure } from "./mutations/upload-logo";
import { getLogoAssetProcedure } from "./queries/get-logo-asset";
import { listLogoAssetsProcedure } from "./queries/list-logo-assets";

export const logoLibrary = {
  listLogoAssets: listLogoAssetsProcedure,
  uploadLogo: uploadLogoProcedure,
  deleteLogoAsset: deleteLogoAssetProcedure,
};

export const logoLibraryBooth = {
  getLogoAsset: getLogoAssetProcedure,
};
