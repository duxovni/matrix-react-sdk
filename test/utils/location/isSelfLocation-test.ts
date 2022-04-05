import { TEXT_NODE_TYPE } from "matrix-js-sdk/src/@types/extensible_events";
import {
    ILocationContent,
    LocationAssetType,
    M_ASSET,
    M_LOCATION,
    M_TIMESTAMP,
} from "matrix-js-sdk/src/@types/location";
import { makeLocationContent } from "matrix-js-sdk/src/content-helpers";

import { isSelfLocation } from "../../../src/utils/location";

describe("isSelfLocation", () => {
    it("Returns true for a full m.asset event", () => {
        const content = makeLocationContent("", '0');
        expect(isSelfLocation(content)).toBe(true);
    });

    it("Returns true for a missing m.asset", () => {
        const content = {
            body: "",
            msgtype: "m.location",
            geo_uri: "",
            [M_LOCATION.name]: { uri: "" },
            [TEXT_NODE_TYPE.name]: "",
            [M_TIMESTAMP.name]: 0,
            // Note: no m.asset!
        };
        expect(isSelfLocation(content as ILocationContent)).toBe(true);
    });

    it("Returns true for a missing m.asset type", () => {
        const content = {
            body: "",
            msgtype: "m.location",
            geo_uri: "",
            [M_LOCATION.name]: { uri: "" },
            [TEXT_NODE_TYPE.name]: "",
            [M_TIMESTAMP.name]: 0,
            [M_ASSET.name]: {
                // Note: no type!
            },
        };
        expect(isSelfLocation(content as ILocationContent)).toBe(true);
    });

    it("Returns false for an unknown asset type", () => {
        const content = makeLocationContent(
            undefined, /* text */
            "geo:foo",
            0,
            undefined, /* description */
            "org.example.unknown" as unknown as LocationAssetType);
        expect(isSelfLocation(content)).toBe(false);
    });
});
