/*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React, { SyntheticEvent } from 'react';
import maplibregl, { MapMouseEvent } from 'maplibre-gl';
import { logger } from "matrix-js-sdk/src/logger";
import { RoomMember } from 'matrix-js-sdk/src/models/room-member';
import { ClientEvent, IClientWellKnown } from 'matrix-js-sdk/src/client';

import { _t } from '../../../languageHandler';
import MatrixClientContext from '../../../contexts/MatrixClientContext';
import Modal from '../../../Modal';
import SdkConfig from '../../../SdkConfig';
import { tileServerFromWellKnown } from '../../../utils/WellKnownUtils';
import { GenericPosition, genericPositionFromGeolocation, getGeoUri } from '../../../utils/beacon';
import { LocationShareError, findMapStyleUrl } from '../../../utils/location';
import ErrorDialog from '../dialogs/ErrorDialog';
import AccessibleButton from '../elements/AccessibleButton';
import { MapError } from './MapError';
import LiveDurationDropdown, { DEFAULT_DURATION_MS } from './LiveDurationDropdown';
import { LocationShareType, ShareLocationFn } from './shareLocation';
import Marker from './Marker';

export interface ILocationPickerProps {
    sender: RoomMember;
    shareType: LocationShareType;
    onChoose: ShareLocationFn;
    onFinished(ev?: SyntheticEvent): void;
}

interface IState {
    timeout: number;
    position?: GenericPosition;
    error?: LocationShareError;
}

const isSharingOwnLocation = (shareType: LocationShareType): boolean =>
    shareType === LocationShareType.Own || shareType === LocationShareType.Live;

class LocationPicker extends React.Component<ILocationPickerProps, IState> {
    public static contextType = MatrixClientContext;
    public context!: React.ContextType<typeof MatrixClientContext>;
    private map?: maplibregl.Map = null;
    private geolocate?: maplibregl.GeolocateControl = null;
    private marker?: maplibregl.Marker = null;

    constructor(props: ILocationPickerProps) {
        super(props);

        this.state = {
            position: undefined,
            timeout: DEFAULT_DURATION_MS,
            error: undefined,
        };
    }

    private getMarkerId = () => {
        return "mx_MLocationPicker_marker";
    };

    componentDidMount() {
        this.context.on(ClientEvent.ClientWellKnown, this.updateStyleUrl);

        try {
            this.map = new maplibregl.Map({
                container: 'mx_LocationPicker_map',
                style: findMapStyleUrl(),
                center: [0, 0],
                zoom: 1,
            });

            // Add geolocate control to the map.
            this.geolocate = new maplibregl.GeolocateControl({
                positionOptions: {
                    enableHighAccuracy: true,
                },
                trackUserLocation: true,
            });

            this.map.addControl(this.geolocate);

            this.map.on('error', (e) => {
                logger.error(
                    "Failed to load map: check map_style_url in config.json "
                    + "has a valid URL and API key",
                    e.error,
                );
                this.setState({ error: LocationShareError.MapStyleUrlNotReachable });
            });

            this.map.on('load', () => {
                this.geolocate.trigger();
            });

            this.geolocate.on('error', this.onGeolocateError);

            if (isSharingOwnLocation(this.props.shareType)) {
                this.geolocate.on('geolocate', this.onGeolocate);
            }

            if (this.props.shareType === LocationShareType.Pin) {
                const navigationControl = new maplibregl.NavigationControl({
                    showCompass: false, showZoom: true,
                });
                this.map.addControl(navigationControl, 'bottom-right');
                this.map.on('click', this.onClick);
            }
        } catch (e) {
            logger.error("Failed to render map", e);
            const errorType = e?.message === LocationShareError.MapStyleUrlNotConfigured ?
                LocationShareError.MapStyleUrlNotConfigured :
                LocationShareError.Default;
            this.setState({ error: errorType });
        }
    }

    componentWillUnmount() {
        this.geolocate?.off('error', this.onGeolocateError);
        this.geolocate?.off('geolocate', this.onGeolocate);
        this.map?.off('click', this.onClick);
        this.context.off(ClientEvent.ClientWellKnown, this.updateStyleUrl);
    }

    private addMarkerToMap = () => {
        this.marker = new maplibregl.Marker({
            element: document.getElementById(this.getMarkerId()),
            anchor: 'bottom',
            offset: [0, -1],
        }).setLngLat(new maplibregl.LngLat(0, 0))
            .addTo(this.map);
    };

    private updateStyleUrl = (clientWellKnown: IClientWellKnown) => {
        const style = tileServerFromWellKnown(clientWellKnown)?.["map_style_url"];
        if (style) {
            this.map?.setStyle(style);
        }
    };

    private onGeolocate = (position: GeolocationPosition) => {
        if (!this.marker) {
            this.addMarkerToMap();
        }
        this.setState({ position: genericPositionFromGeolocation(position) });
        this.marker?.setLngLat(
            new maplibregl.LngLat(
                position.coords.longitude,
                position.coords.latitude,
            ),
        );
    };

    private onClick = (event: MapMouseEvent) => {
        if (!this.marker) {
            this.addMarkerToMap();
        }
        this.marker?.setLngLat(event.lngLat);
        this.setState({
            position: {
                timestamp: Date.now(),
                latitude: event.lngLat.lat,
                longitude: event.lngLat.lng,
            },
        });
    };

    private onGeolocateError = (e: GeolocationPositionError) => {
        logger.error("Could not fetch location", e);
        // close the dialog and show an error when trying to share own location
        // pin drop location without permissions is ok
        if (isSharingOwnLocation(this.props.shareType)) {
            this.props.onFinished();
            Modal.createTrackedDialog(
                'Could not fetch location',
                '',
                ErrorDialog,
                {
                    title: _t("Could not fetch location"),
                    description: positionFailureMessage(e.code),
                },
            );
        }

        if (this.geolocate) {
            this.map?.removeControl(this.geolocate);
        }
    };

    private onTimeoutChange = (timeout: number): void => {
        this.setState({ timeout });
    };

    private onOk = () => {
        const { timeout, position } = this.state;

        this.props.onChoose(
            position ? { uri: getGeoUri(position), timestamp: position.timestamp, timeout } : {
                timeout,
            });
        this.props.onFinished();
    };

    render() {
        if (this.state.error) {
            return <div className="mx_LocationPicker mx_LocationPicker_hasError">
                <MapError
                    error={this.state.error}
                    onFinished={this.props.onFinished} />
            </div>;
        }

        return (
            <div className="mx_LocationPicker">
                <div id="mx_LocationPicker_map" />
                { this.props.shareType === LocationShareType.Pin && <div className="mx_LocationPicker_pinText">
                    <span>
                        { this.state.position ? _t("Click to move the pin") : _t("Click to drop a pin") }
                    </span>
                </div>
                }
                <div className="mx_LocationPicker_footer">
                    <form onSubmit={this.onOk}>
                        { this.props.shareType === LocationShareType.Live &&
                            <LiveDurationDropdown
                                onChange={this.onTimeoutChange}
                                timeout={this.state.timeout}
                            />
                        }
                        <AccessibleButton
                            data-test-id="location-picker-submit-button"
                            type="submit"
                            element='button'
                            kind='primary'
                            className='mx_LocationPicker_submitButton'
                            disabled={!this.state.position}
                            onClick={this.onOk}>
                            { _t('Share location') }
                        </AccessibleButton>
                    </form>
                </div>
                <div id={this.getMarkerId()}>
                    { /*
                    maplibregl hijacks the div above to style the marker
                    it must be in the dom when the map is initialised
                    and keep a consistent class
                    we want to hide the marker until it is set in the case of pin drop
                    so hide the internal visible elements
                    */ }

                    { !!this.marker && <Marker
                        roomMember={isSharingOwnLocation(this.props.shareType) ? this.props.sender : undefined}
                        useMemberColor={this.props.shareType === LocationShareType.Live}
                    />
                    }
                </div>
            </div>
        );
    }
}

export default LocationPicker;

function positionFailureMessage(code: number): string {
    const brand = SdkConfig.get().brand;
    switch (code) {
        case 1: return _t(
            "%(brand)s was denied permission to fetch your location. " +
            "Please allow location access in your browser settings.", { brand },
        );
        case 2: return _t(
            "Failed to fetch your location. Please try again later.",
        );
        case 3: return _t(
            "Timed out trying to fetch your location. Please try again later.",
        );
        case 4: return _t(
            "Unknown error fetching location. Please try again later.",
        );
    }
}
