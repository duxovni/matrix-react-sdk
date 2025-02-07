/*
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>
Copyright 2019 The Matrix.org Foundation C.I.C.

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

import AccessibleButton from "./AccessibleButton";
import Tooltip, { Alignment } from './Tooltip';

interface IProps extends React.ComponentProps<typeof AccessibleButton> {
    title: string;
    tooltip?: React.ReactNode;
    label?: React.ReactNode;
    tooltipClassName?: string;
    forceHide?: boolean;
    yOffset?: number;
    alignment?: Alignment;
    onHideTooltip?(ev: SyntheticEvent): void;
}

interface IState {
    hover: boolean;
}

export default class AccessibleTooltipButton extends React.PureComponent<IProps, IState> {
    constructor(props: IProps) {
        super(props);
        this.state = {
            hover: false,
        };
    }

    componentDidUpdate(prevProps: Readonly<IProps>) {
        if (!prevProps.forceHide && this.props.forceHide && this.state.hover) {
            this.setState({
                hover: false,
            });
        }
    }

    private showTooltip = () => {
        if (this.props.forceHide) return;
        this.setState({
            hover: true,
        });
    };

    private hideTooltip = (ev: SyntheticEvent) => {
        this.setState({
            hover: false,
        });
        this.props.onHideTooltip?.(ev);
    };

    render() {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { title, tooltip, children, tooltipClassName, forceHide, yOffset, alignment, onHideTooltip,
            ...props } = this.props;

        const tip = this.state.hover && <Tooltip
            tooltipClassName={tooltipClassName}
            label={tooltip || title}
            yOffset={yOffset}
            alignment={alignment}
        />;
        return (
            <AccessibleButton
                {...props}
                onMouseOver={this.showTooltip}
                onMouseLeave={this.hideTooltip}
                onFocus={this.showTooltip}
                onBlur={this.hideTooltip}
                aria-label={title}
            >
                { children }
                { this.props.label }
                { (tooltip || title) && tip }
            </AccessibleButton>
        );
    }
}
