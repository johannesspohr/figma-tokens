/* eslint-disable import/prefer-default-export */
import {createModel} from '@rematch/core';
import {SingleTokenObject, TokenGroup, SingleToken, TokenProps} from '@types/tokens';
import {StorageProviderType} from '@types/api';
import defaultJSON from '@/config/default.json';
import isEqual from 'lodash.isequal';

import parseTokenValues from '@/utils/parseTokenValues';
import {notifyToUI} from '@/plugin/notifiers';
import {reduceToValues} from '@/plugin/tokenHelpers';
import {replaceReferences} from '@/utils/findReferences';
import parseJson from '@/utils/parseJson';
import {RootModel} from '.';
import updateTokensOnSources from '../updateSources';
import * as pjs from '../../../../package.json';
import {string} from 'mathjs';

const defaultTokens: TokenProps = {
    version: pjs.plugin_version,
    updatedAt: new Date().toString(),
    values: defaultJSON,
};

export interface ComponentPart {
    parts: Record<string, ComponentPart>;
    variants: Record<string, Record<string, string>>;
    baseStyles: Record<string, string>;
}

type TokenInput = {
    name: string;
    parent: string;
    value: SingleToken;
    options: object;
};

type EditTokenInput = TokenInput & {
    oldName?: string;
};

type DeleteTokenInput = {parent: string; path: string};

interface TokenState {
    tokens: TokenGroup;
    components: Record<string, ComponentPart>;
    lastSyncedState: string;
    importedTokens: {
        newTokens: SingleTokenObject[];
        updatedTokens: SingleTokenObject[];
    };
    activeTokenSet: string;
    usedTokenSet: string[];
    editProhibited: boolean;
}

export const tokenState = createModel<RootModel>()({
    state: {
        tokens: {
            global: [],
        },
        components: {},
        lastSyncedState: '',
        importedTokens: {
            newTokens: [],
            updatedTokens: [],
        },
        activeTokenSet: 'global',
        usedTokenSet: ['global'],
        editProhibited: false,
    } as TokenState,
    reducers: {
        setEditProhibited(state, payload: boolean) {
            return {
                ...state,
                editProhibited: payload,
            };
        },
        toggleUsedTokenSet: (state, data: string) => {
            return {
                ...state,
                usedTokenSet: state.usedTokenSet.includes(data)
                    ? state.usedTokenSet.filter((n) => n !== data)
                    : [...new Set([...state.usedTokenSet, data])],
            };
        },
        setActiveTokenSet: (state, data: string) => {
            return {
                ...state,
                activeTokenSet: data,
            };
        },
        addTokenSet: (state, name: string) => {
            if (name in state.tokens) {
                notifyToUI('Token set already exists');
                return state;
            }
            return {
                ...state,
                tokens: {
                    ...state.tokens,
                    [name]: [],
                },
            };
        },
        deleteTokenSet: (state, data: string) => {
            const oldTokens = state.tokens;
            delete oldTokens[data];
            return {
                ...state,
                tokens: oldTokens,
                activeTokenSet: state.activeTokenSet === data ? Object.keys(state.tokens)[0] : state.activeTokenSet,
            };
        },
        renameTokenSet: (state, data: {oldName: string; newName: string}) => {
            const oldTokens = state.tokens;
            oldTokens[data.newName] = oldTokens[data.oldName];
            delete oldTokens[data.oldName];
            return {
                ...state,
                tokens: oldTokens,
                activeTokenSet: state.activeTokenSet === data.oldName ? data.newName : state.activeTokenSet,
            };
        },
        setLastSyncedState: (state, data: string) => {
            return {
                ...state,
                lastSyncedState: data,
            };
        },
        setTokenSetOrder: (state, data: string[]) => {
            const newTokens = {};
            data.map((set) => {
                Object.assign(newTokens, {[set]: state.tokens[set]});
            });
            return {
                ...state,
                tokens: newTokens,
            };
        },
        resetImportedTokens: (state) => {
            return {
                ...state,
                importedTokens: {
                    newTokens: [],
                    updatedTokens: [],
                },
            };
        },
        setTokenData: (state, data: {values: SingleTokenObject[]; shouldUpdate: boolean}) => {
            const values = parseTokenValues(data.values);
            return {
                ...state,
                tokens: values,
                activeTokenSet: Array.isArray(data.values) ? 'global' : Object.keys(data.values)[0],
                usedTokenSet: Array.isArray(data.values) ? ['global'] : [Object.keys(data.values)[0]],
            };
        },
        setComponents: (state, data: {values: Record<string, ComponentPart>; shouldUpdate: boolean}) => {
            return {
                ...state,
                components: data.values,
            };
        },
        setJSONData(state, payload) {
            const parsedTokens = parseJson(payload);
            parseTokenValues(parsedTokens);
            const values = parseTokenValues({[state.activeTokenSet]: parsedTokens});
            return {
                ...state,
                tokens: {
                    ...state.tokens,
                    ...values,
                },
            };
        },
        createToken: (state, data: TokenInput) => {
            let newTokens = {};
            const existingToken = state.tokens[data.parent].find((n) => n.name === data.name);
            if (!existingToken) {
                newTokens = {
                    [data.parent]: [
                        ...state.tokens[data.parent],
                        {
                            name: data.name,
                            value: data.value,
                            ...data.options,
                        },
                    ],
                };
            }
            return {
                ...state,
                tokens: {
                    ...state.tokens,
                    ...newTokens,
                },
            };
        },
        duplicateToken: (state, data: TokenInput) => {
            let newTokens = {};
            const existingTokenIndex = state.tokens[data.parent].findIndex((n) => n.name === data.name);
            if (existingTokenIndex > -1) {
                const newName = `${data.name}-copy`;
                const existingTokens = state.tokens[data.parent];
                existingTokens.splice(existingTokenIndex + 1, 0, {
                    ...state.tokens[data.parent][existingTokenIndex],
                    name: newName,
                });

                newTokens = {
                    [data.parent]: existingTokens,
                };
            }
            return {
                ...state,
                tokens: {
                    ...state.tokens,
                    ...newTokens,
                },
            };
        },
        // Imports received styles as tokens, if needed
        setTokensFromStyles: (state, receivedStyles) => {
            const newTokens = [];
            const existingTokens = [];
            const updatedTokens = [];

            // Iterate over received styles and check if they existed before or need updating
            Object.values(receivedStyles).map((values: [string, SingleTokenObject[]]) => {
                values.map((token: TokenGroup) => {
                    const oldValue = state.tokens[state.activeTokenSet].find((t) => t.name === token.name);
                    if (oldValue) {
                        if (isEqual(oldValue.value, token.value)) {
                            if (
                                oldValue.description === token.description ||
                                (typeof token.description === 'undefined' && oldValue.description === '')
                            ) {
                                existingTokens.push(token);
                            } else {
                                updatedTokens.push({
                                    ...token,
                                    oldDescription: oldValue.description,
                                });
                            }
                        } else {
                            updatedTokens.push({
                                ...token,
                                oldValue: oldValue.value,
                            });
                        }
                    } else {
                        newTokens.push(token);
                    }
                });
            });

            return {
                ...state,
                importedTokens: {
                    newTokens,
                    updatedTokens,
                },
            };
        },
        editToken: (state, data: EditTokenInput) => {
            const nameToFind = data.oldName ? data.oldName : data.name;
            const index = state.tokens[data.parent].findIndex((token) => token.name === nameToFind);
            const newArray = state.tokens[data.parent];
            newArray[index] = {
                ...newArray[index],
                name: data.name,
                value: data.value,
                ...data.options,
            };

            return {
                ...state,
                tokens: {
                    ...state.tokens,
                    [data.parent]: newArray,
                },
            };
        },
        deleteToken: (state, data: DeleteTokenInput) => {
            const newState = {
                ...state,
                tokens: {
                    ...state.tokens,
                    [data.parent]: state.tokens[data.parent].filter((token) => token.name !== data.path),
                },
            };

            return newState;
        },
        deleteTokenGroup: (state, data: DeleteTokenInput) => {
            const newState = {
                ...state,
                tokens: {
                    ...state.tokens,
                    [data.parent]: state.tokens[data.parent].filter((token) => !token.name.startsWith(data.path)),
                },
            };

            return newState;
        },
        updateAliases: (state, data: {oldName: string; newName: string}) => {
            const newTokens = Object.entries(state.tokens).reduce(
                (acc, [key, values]: [string, SingleTokenObject[]]) => {
                    const newValues = values.map((token) => {
                        if (Array.isArray(token.value)) {
                            return {
                                ...token,
                                value: token.value.map((t) =>
                                    Object.entries(t).reduce((a, [k, v]: [string, string]) => {
                                        a[k] = replaceReferences(v.toString(), data.oldName, data.newName);
                                        return a;
                                    }, {})
                                ),
                            };
                        }
                        if (typeof token.value === 'object') {
                            return {
                                ...token,
                                value: Object.entries(token.value).reduce((a, [k, v]: [string, string]) => {
                                    a[k] = replaceReferences(v.toString(), data.oldName, data.newName);
                                    return a;
                                }, {}),
                            };
                        }

                        return {
                            ...token,
                            value: replaceReferences(token.value.toString(), data.oldName, data.newName),
                        };
                    });

                    acc[key] = newValues;
                    return acc;
                },
                {}
            );

            return {
                ...state,
                tokens: newTokens,
            };
        },
    },
    effects: (dispatch) => ({
        setDefaultTokens: (payload) => {
            dispatch.tokenState.setTokenData({values: defaultTokens.values});
        },
        setEmptyTokens: (payload) => {
            dispatch.tokenState.setTokenData({values: []});
        },
        editToken(payload, rootState) {
            if (payload.oldName && payload.oldName !== payload.name) {
                dispatch.tokenState.updateAliases({oldName: payload.oldName, newName: payload.name});
            }

            if (payload.shouldUpdate && rootState.settings.updateOnChange) {
                dispatch.tokenState.updateDocument();
            }
        },
        deleteToken() {
            dispatch.tokenState.updateDocument({shouldUpdateNodes: false});
        },
        deleteTokenGroup() {
            dispatch.tokenState.updateDocument({shouldUpdateNodes: false});
        },
        addTokenSet() {
            dispatch.tokenState.updateDocument({shouldUpdateNodes: false});
        },
        renameTokenSet() {
            dispatch.tokenState.updateDocument({shouldUpdateNodes: false});
        },
        deleteTokenSet() {
            dispatch.tokenState.updateDocument({shouldUpdateNodes: false});
        },
        setTokenSetOrder() {
            dispatch.tokenState.updateDocument({shouldUpdateNodes: false});
        },
        setJSONData() {
            dispatch.tokenState.updateDocument();
        },
        setTokenData(payload, rootState) {
            if (payload.shouldUpdate) {
                dispatch.tokenState.updateDocument();
            }
        },

        toggleUsedTokenSet(payload, rootState) {
            dispatch.tokenState.updateDocument({updateRemote: false});
        },
        duplicateToken(payload, rootState) {
            if (payload.shouldUpdate && rootState.settings.updateOnChange) {
                dispatch.tokenState.updateDocument();
            }
        },
        createToken(payload, rootState) {
            if (payload.shouldUpdate && rootState.settings.updateOnChange) {
                dispatch.tokenState.updateDocument();
            }
        },
        updateDocument(options, rootState) {
            const defaults = {shouldUpdateNodes: true, updateRemote: true};
            const params = {...defaults, ...options};
            try {
                updateTokensOnSources({
                    tokens: params.shouldUpdateNodes ? rootState.tokenState.tokens : null,
                    tokenValues: reduceToValues(rootState.tokenState.tokens),
                    usedTokenSet: rootState.tokenState.usedTokenSet,
                    settings: rootState.settings,
                    updatedAt: new Date().toString(),
                    lastUpdatedAt: rootState.uiState.lastUpdatedAt,
                    isLocal: rootState.uiState.storageType.provider === StorageProviderType.LOCAL,
                    editProhibited: rootState.tokenState.editProhibited,
                    api: rootState.uiState.api,
                    storageType: rootState.uiState.storageType,
                    shouldUpdateRemote: params.updateRemote && rootState.settings.updateRemote,
                });
            } catch (e) {
                console.error('Error updating document', e);
            }
        },
        updateComponents: (state, data: {values: Record<string, ComponentPart>; shouldUpdate: boolean}) => {
            if (!isEqual(data.values, state.components)) {
                dispatch.tokens.setComponents(data);
                dispatch.tokens.updateDocument({shouldUpdateNodes: false});
            }
            return state;
        },
    }),
});
