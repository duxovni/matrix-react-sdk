import { ILocationContent, LocationAssetType, M_ASSET } from "matrix-js-sdk/src/@types/location";

export const isSelfLocation = (locationContent: ILocationContent): boolean => {
    const asset = M_ASSET.findIn(locationContent) as { type: string };
    const assetType = asset?.type ?? LocationAssetType.Self;
    return assetType == LocationAssetType.Self;
};
